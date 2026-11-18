# 03 — Canonical Execution Flows (Section E)

Each flow is one real request boundary. Flows that happen in **separate** HTTP requests are
kept separate here (as the brief requires). Status: ✅ verified in source · 🆕 proposed
(no code) · 🔌 external party.

Actors: **U** = authenticated user · **C** = user client · **A** = admin client ·
**B** = backend (monolith) · **N** = Neo4j · **R** = relational store 🆕 · **L** = LLM
provider 🔌 · **P** = payment provider 🔌 · **S** = file/object storage.

---

## Flow 1 — Sign up, log in, complete profile 🆕 (UR-01, UR-02)

Blocked by **D-01** (auth mechanism/provider). Steps below are the recommended shape; the
token/session technology is not yet decided.

```
1. C → B  POST /api/auth/register        {email, password, …}
2. B      validate; reject duplicates (unique email)
3. B      hash password with a real password-hashing algorithm; never store plaintext (§D.7)
4. B → R  INSERT user (+ profile row/fields, onboardingCompleted = false)
5. B      create an audit event "account.created"; write NO secret material to any log
6. B → C  201 + session cookie / short-lived access token (+ refresh token stored server-side)
7. C → B  POST /api/auth/login            (same session establishment)
8. C → B  GET  /api/me                    → principal, profile, onboardingCompleted, plan, usage summary
9. B      if onboardingCompleted → client goes straight to the dashboard (no forced onboarding)
10. C → B PATCH /api/me                   {allow-listed profile fields only}
11. B     apply allow-list; role/plan/storage fields are NOT settable here; audit the change
12. C → B POST /api/auth/logout           → server invalidates the session/refresh token
```

Failure states to draw: invalid credentials → 401 with no account-existence signal; expired
session → 401 and re-authentication; partially completed profile → dashboard still readable.

**Not yet decided:** D-01 — server-managed sessions vs token-based auth vs an external
identity provider. The brief says no plaintext passwords and no secrets in the client; that
is satisfiable either way.

---

## Flow 2 — Repository analysis ✅ (the verified pipeline, plus the 🆕 ownership wrapper)

Verified today (steps 2–12 have real code). Steps marked 🆕 exist only in the target.

```
1. C → B  POST /api/repositories/analyze   multipart field "file"        ✅
   🆕 1a  authenticate the principal; authorize; resolve/create the Repository record;
          mint an internal repositoryId (UUID) — replaces the filename-derived name (E1)
   🆕 1b  entitlement + quota check BEFORE accepting bytes (Flow 7)
2. B      Multer streams to backend/uploads/  (50 MB limit; field "file")  ✅
3. B      validate: name ends .zip AND first bytes are "PK"                ✅
           repository.controller.ts:70-80 · file.utils.ts::isZipArchive
4. B      reject non-ZIP → 400 with the readable message                    ✅
5. B      extract to backend/extracted/<name>-<Date.now()>/                  ✅
           per entry: isPathInside() → unsafe "../" entries skipped          ✅
           single top-level folder becomes the repository root               ✅
6. B      create AnalysisRun (status = running) 🆕 — today there is no run record
7. B      scan .ts/.tsx/.js/.jsx, skipping node_modules/.git/dist/build/
          coverage/.next/out/vendor                                          ✅
8. B      Phase 1  per file: Babel parse (plugins by extension) →
                   entities: File, Class, Function (incl. const/arrow), Method
                   + Function sourceSnippet ≤700 chars, whitespace-collapsed  ✅
                   per-file try/catch: an unparsable file is logged and SKIPPED ✅
9. B      Phase 2  build ONE TypeScript program over all files                ✅
10. B     Phase 3  relationships with evidence {filePath,line,resolution}:
                   CONTAINS (derived) · IMPORTS (resolved) ·
                   CALLS (resolved, innermost call wins) · EXTENDS (name-match) ✅
11. B     Phase 4  assemble: Repository node, derived Directory nodes +
                   CONTAINS, dedupe ids, drop dangling/self/duplicate edges   ✅
12. B     annotate scope: category + inDefaultScope by classification and
          import reachability — annotation only, nothing removed              ✅
13. B → N delete this repository's nodes (scoped by the repository identity),
          then CREATE every node and every edge                               ✅ 🟡 (E1/E5)
14. N     failure → caught; response still returns the graph with
          persisted = false                                                   ✅
15. B     drop cached reports + function summaries for this repository        ✅
           parser.service → invalidateReports / invalidateSummaries; api.ts clears its map
16. B → C 201 { repository, persisted, nodeCount, relationshipCount,
              categoryCounts, graph }                                         ✅
17. 🆕    B → R AnalysisRun(status = succeeded|failed, finishedAt, durationMs,
              nodeCount, relationshipCount, persistence flag)
18. 🆕    B → R usage event for any AI call made inside this flow (Flow 8)
19. B     finally: delete the uploaded ZIP and the extraction directory       ✅
          (KEEP_EXTRACTED=true keeps the folder for debugging)
```

⚠️ **Structural problem to solve in the target (D-04).** Today steps 5–13 run inside the
single request in step 1: real evidence shows a 53-node repository taking ~65 s, and
`repository.service.ts` keeps the whole repository in memory. UR-03/UR-04 ask for
"processing status", which a blocking request cannot show. Target shape:

```
POST /repositories → 202 { analysisRunId } → run executes in-process/asynchronously
GET  /analysis-runs/:id → status (queued|running|succeeded|failed) + result counts
```

This is still the same monolith — a job table, not a new service.

---

## Flow 3 — Stored-graph reload ✅

```
1. C → B GET /api/graph?repository=<name>          ✅
   🆕 1a authenticate; resolve <name> through the ownership table; 404 if it is not
        the caller's repository (today any caller can read any or ALL graphs — E2)
2. B → N MATCH (n:Entity {repository:$r}) RETURN n  ✅
3. B → N MATCH (a)-[r]->(b) RETURN ids, type(r), r.line/filePath/resolution ✅
4. B      rebuild evidence only when a resolution property exists            ✅
5. B → C  { nodes, relationships }                  ✅
6. C      render; no simulation reset of user viewport (persisted layout)     ✅
```

Note 🆕: `sourceSnippet` is currently part of what step 2 returns. Whether the client needs
it at all is a design question — only the AI path needs it, and that path is server-side
(E3). Recommendation: stop returning it to the browser.

---

## Flow 4 — AI repository report ✅ (separate request from Flow 2)

```
1. C → B GET /api/analysis?repository=<name>                                  ✅
2. B     require the parameter → else 400                                      ✅
3. B → N fetchGraph(repository)  (full read, only to measure + signature)     ✅ 🟡 (E5)
4. B     empty graph → 404 "Analyze it first"                                  ✅
5. B     signature = "<nodeCount>:CALLS=n,CONTAINS=n,IMPORTS=n…"              ✅
6. B     cache key = repository : model : promptVersion(v2) : signature       ✅
           hit → return cached;  in-flight duplicate → share one promise      ✅
   🆕 6a cache key must gain the owner/tenant dimension (E4) + entitlement check (UR-06)
7. B → L chat/completions with the measured digest as the only evidence       ✅
8. L     strict-JSON completion (markdown fences tolerated)                   ✅
9. B     normalize: summary, scalability{score 0-10, verdict, factors ≤6},
         sustainability{…}, strengths ≤5, risks ≤5, recommendations ≤5,
         limitations ≥2 required by prompt, model, generatedAt, graphSignature ✅
10. B → C report JSON; frontend renders the six sections + regenerate         ✅
11. 🆕   B → R persist an AnalysisReport row linked to the AnalysisRun (UR-04)
12. 🆕   B → R usage event (Flow 8)
```

---

## Flow 5 — Implementation plan: generate, review, download 🆕 (UR-05)

**Nothing of this exists in source.** Blocked by **D-06** (how it relates to the approved
proposal's Change-Impact Analyzer). Generation and download are **two** requests.

```
5a. Generate
1. C → B POST /api/repositories/:id/implementation-plans { featureRequest: string }
2. B     authorize ownership; entitlement check (report/plan generation may be paid)
3. B     load the stored graph context for that repository (server-side, trusted ids)
4. B     resolve the request text to real graph entities; DISCARD references that do
         not exist in the graph  (proposal rule: validate AI output against the graph)
5. B → L structured prompt over the verified context (data, never instructions)
6. L     strict JSON plan
7. B     validate + normalize into fixed sections, cap list lengths, record model,
         promptVersion, generatedAt, graphSignature
8. B → R persist ImplementationPlan (content) + usage event
9. B → C plan for review  { objective, relevantFiles[], steps[], affectedComponents[],
         dependencies[], testingRequirements[], risks[], assumptions[], acceptanceCriteria[] }

5b. Download
10. C → B GET /api/implementation-plans/:id.md
11. B     authorize; render the stored plan as Markdown server-side
12. B → C text/markdown attachment "implementation-plan.md"
```

Boundary that must be drawn in the UI and in every diagram: **a plan is advice.** It is a
generated document; CodeAtlas does not edit, commit, push or deploy code (proposal
Out-of-Scope).

---

## Flow 6 — User API key: configure, then use 🆕 (UR-08)

Two separate flows. Step 6b is blocked by finding **E8** — `chatComplete()` currently reads
the global `env.llm.key` (`env.ts:35`) and takes no credential argument, so per-user keys
cannot be supported without changing that signature.

```
6a. Configure (never returns the secret)
1. C → B PUT /api/me/provider-credentials { provider, key }      (HTTPS only)
2. B     require a supported provider id from configuration — not an open URL
3. B     validate the key with the provider's own supported mechanism when one exists
4. B     store encrypted at rest; keep metadata (provider, key fingerprint/last4,
         createdAt, updatedAt, state active|revoked)
5. B     audit "credential.updated" WITHOUT the secret; redact everywhere else
6. B → C 200 { provider, maskedHint, updatedAt, state }   ← never the raw key
7. C → B DELETE /api/me/provider-credentials/:provider    → revoke; audit

6b. Use (inside Flow 4 / 5 / 9's AI work)
8.  B     resolve the feature request to the calling user's credential
9.  B     decrypt into request scope only; never into a response, log, report or cache key
10. B → L chat/completions with Authorization: Bearer <user key>
11. B     record the usage event with attribution = user_provider_key
12. 📐    If the user has no key: use the platform key only if the plan allows, and record
          attribution = platform; otherwise return a clear "configure your key" state.
```

Anti-patterns to keep out of the design: sending the key to the frontend; storing it in
`localStorage`; putting it in a cache key; using one global key for all users' work and
billing it to the platform; letting encryption stand alone as the whole answer (key
access, rotation, redaction and deletion all matter).

---

## Flow 7 — Storage quota enforcement 🆕 (UR-07)

Blocked by **D-05** (retention) and **D-09** (where artifacts live). Quota is checked
**before** bytes are accepted, and the metric must match what is actually retained.

```
1. C → B upload/analysis request (repository bytes known or capped at 50 MB ✅ today)
2. B     compute intended usage: retained archive/source bytes + persisted derived
         artifacts + report/plan text size
3. B     read the user's allowance from the plan entitlement (UR-06) — never hardcoded
4. B     remaining = allowance − used
5. B     decision:
         intended ≤ remaining → proceed and record a pending usage delta
         intended > remaining → 413/402 with the reason; nothing is written
6. B     execute Flow 2
7. B     on completion, set the usage delta to the ACTUAL bytes retained
         (if artifacts are deleted immediately, retained bytes = 0 — then the quota
         metric must be repositories/graph/reports, NOT archive bytes) 📐
8. B     on repository deletion → remove artifacts → reclaim usage → audit
9. B     on plan change → allowance changes; re-evaluate and mark over-quota state
         (do not silently delete a user's data)
```

Three storage metrics stay separate in every diagram: **retained source/archive bytes**,
**repository + graph metadata** (Neo4j), **generated text artifacts** (reports, plans).
Counting Neo4j graph data as "repository storage" is the confusion the brief warns about.

---

## Flow 8 — Usage and cost attribution 🆕 (UR-09)

Blocked by **E7** (the provider's `usage` object is not parsed today) and **D-10** (pricing
source). One event per AI operation, written in the same request as Flow 4/5/6b.

```
1. B     begin an AI operation; capture userId, repositoryId, runId, provider, model,
         feature (report | function-summary | implementation-plan), startedAt
2. B → L chat/completions
3. L     response
4. B     read usage.inputTokens / outputTokens **only if the provider returned them**;
         otherwise mark tokens = unknown (never fabricate)
5. B     record: status, retryCount, latencyMs, attribution (platform | user_provider_key)
6. B     cost:
         provider-reported amount  → record as actual, with currency
         else pricing table        → record as ESTIMATED, stamp pricingVersion
         else                      → unavailable (explicitly, not 0)
7. B → R INSERT usage_event
8. B     aggregates for the user view (UR-09) and the admin view (§Flow 10) read events;
         BYOK spend is reported as the user's provider bill — NOT CodeAtlas revenue
         and NOT CodeAtlas cost
```

---

## Flow 9 — Subscription and payment 🆕 (UR-06, AR-05)

Provider undecided (**D-08**); nothing may be named as "the" gateway. The design is an
adapter boundary so a later provider plugs in.

```
9a. Start
1. C → B POST /api/billing/checkout-intent { planId }
2. B     plan must exist in configuration (no invented prices); create a PENDING
         subscription-change record
3. B → P adapter: create checkout/session for that plan
4. P → C hosted checkout (Card → external payment gateway)
5. C → B redirect/return → show "processing" only. A redirect is NOT proof of payment.

9b. Confirm (server-side, separate request)
6. P → B webhook: payment event
7. B     verify signature; reject unsigned payloads
8. B     idempotency: dedupe by provider event id (retries are normal)
9. B     re-fetch the payment state from the provider where the API allows it
10. B    state machine:
         paid           → activate subscription, emit entitlement change, audit
         pending        → no paid access
         failed         → no paid access; keep prior state
         cancelled      → lapse at period end; revoke paid features
         refunded       → policy decides; record it
11. B    storage/allowance re-evaluation (Flow 7) + cache invalidation for entitlements
12. A    sees the state transition in AR-05 analytics, never edits it directly
```

Rule to show explicitly: **only a verified server-side event moves a user to a paid
state.** Frontend selection of a plan grants nothing.

---

## Flow 10 — Administrator: analytics and user management 🆕 (AR-01…AR-06)

Two separate request groups: reading aggregates vs acting on an individual account.

```
10a. Analytics (aggregated — default admin surface)
1. A → B GET /api/admin/analytics?from&to&plan&feature&provider&status
2. B     role check server-side on the route; 403 otherwise (a hidden URL is not a control)
3. B     derive from users / repositories / analysis_runs / usage_events /
         subscriptions / payment_transactions (+ optional cache if justified)
4. B     metric bundles:
         users: total, new over period, active, growth, free vs paid, plan distribution
         usage: repositories submitted, analyses by status, feature usage, AI requests
                by provider+model, average analysis duration, error rate, peak periods
         money: active subscriptions, upgrades, cancellations, payment success/failure,
                gross volume, refunds (if ever supported), revenue over time and by plan
         cost:  provider-billed AI cost (where available), estimated AI cost,
                payment fees (if available), infrastructure cost (ONLY if a real source
                exists)
5. B     label every value measured | calculated | estimated | unavailable
         and attach source + formula + period + aggregation level
6. A → B render; profit is reported only from revenue minus *known* costs,
         with unavailable costs shown as unknown rather than zero

10b. User management (record-level — privileged, audited)
7. A → B  GET /api/admin/users?q&status&plan&page      → paginated, minimised fields
8. B      role check; field allow-list: NO password hashes, NO tokens,
          NO API-key material, NO repository source content
9. A → B  GET /api/admin/users/:id                      → permitted profile + plan +
          aggregated usage; source content requires the separate privileged capability
10. A → B POST /api/admin/users/:id/actions/<action>    → validated, confirmed,
          rate-limited, and written to audit_events with actor, target, reason
11. B     never impersonate by default; if ever added, it is explicit, scoped and audited
```

Privacy boundary to draw: **aggregated analytics ≠ individual record access ≠ private
content access.** They are three different permissions, and the third is off by default.

➡️ Next: [`04-data-models.md`](./04-data-models.md)
