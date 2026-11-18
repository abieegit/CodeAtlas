# 05 — Architecture Decisions and Open Questions (Section G)

Each decision is stated as it actually stands: **unresolved**, with reasonable options, a
recommendation, the trade-off, and whether it blocks diagram production. No answer is
invented for a business decision, and no price, quota, provider or identity product is
named as settled.

**Blocks?** = *Yes* → the diagram cannot be finalized until answered · *Partly* → the shape
can be drawn dashed/parameterised · *No* → can proceed with the recommendation as a
labelled assumption.

## G.0 Summary

| ID | Question | Recommendation | Blocks |
| --- | --- | --- | --- |
| **D-16** | Do the meeting's SaaS features belong in this project at all (proposal drift)? | **Project owner + supervisor must approve a proposal change record (v1.4)** before diagrams imply them | **Yes — all target diagrams** |
| **D-03** | How is a repository identified and owned? | Relational UUID as the single identity; Neo4j `repository` property = that UUID; ownership column enforced in the app layer | **Yes** — D2, D5, D7, D8 |
| **D-01** | Authentication design | Server-managed sessions (or short access token + rotating refresh token stored server-side); external identity provider only if the FYP wants a demo bonus | **Yes** — D2, D3, D8 |
| **D-06** | Implementation plan vs the proposal's Change-Impact Analyzer | Keep **one** analysis feature (Module 3) that produces the impact report *and* the Markdown plan as two outputs of the same evidence path | **Yes** — D5, D6, D8, D9 |
| **D-07** | Plan catalogue, prices, limits | Config-driven plans + entitlement table; numbers decided by the team; **no** invented `$12` or quotas in code/docs | **Yes** — D9 |
| **D-08** | Is payment processing in scope, and with which provider | For FYP: **simulate** a payment boundary behind an adapter (state machine + idempotent webhook handler + fake provider). Draw Diagram 9 with the provider as an unnamed boundary | **Yes** — D9 |
| **D-04** | Synchronous vs background analysis | Move to a job/status model inside the monolith (`202` + run record + `GET /analysis-runs/:id`) | **Yes** — D3, D5 |
| **D-05** | Retention of uploaded source | Keep everything transient by default; the durable artifacts are the graph + reports/plans | Partly — D5, D8 (quota) |
| **D-09** | Where retained bytes live (local disk vs object storage) | Local disk for FYP behind a storage adapter interface | Partly — D2 |
| **D-10** | Cost basis (actual vs estimated) | Persist provider `usage` when returned; otherwise an explicitly *estimated* cost from a pricing table with a version stamp | Partly — D9 |
| **D-11** | Admin application form | Separate client build under `/admin`, same backend, server-side role guard | Partly — D2, D4 |
| **D-02** | Administrator accounts | Single `users.role` column with an `admin` value; no separate admin store | No |
| **D-12** | Analytics computation | Query-time aggregation over the transactional tables; a scheduled rollup only if it proves slow | No |
| **D-13** | Deployment diagram | **Do not draw Diagram 10 now** — no Dockerfile, no CI, no hosting decision exists | Yes, for D10 only |
| **D-14** | Does "Project" exist as a concept? | Keep `projects` only if the UI truly groups multiple repositories per project; otherwise attach repositories directly to users | No (affects D8 width) |
| **D-15** | BYOK fallback policy | A user without their own key uses the platform key only when the plan allows it, recorded as `attribution=platform`; otherwise the AI feature is clearly unavailable | Partly — D9 |

---

## G.1 The decision that comes before all others

### D-16 — Is the SaaS/product layer part of this FYP, or a second product track? ❓

**Question.** The approved proposal (v1.3) scopes six **analysis** modules. It explicitly
places *"Enterprise SSO and granular organizational permissions"* and
*"billing/auth"*-class capabilities out of scope, and states the freemium SaaS model as a
**business** section rather than a build deliverable. The meeting requirements now ask for
registration, profiles, plan entitlements, storage quotas, per-user API keys, cost
reporting, an administrator application and a business-analytics dashboard.

**Why it matters.** This is not a small addition: roughly **eleven of the nineteen**
target modules are business-platform work rather than repository-intelligence work. If
both tracks proceed at full size, the proposal's own differentiators — the Change-Impact
Analyzer (Module 3) and the Vulnerability Analyzer (Module 5), which are still at 0 % per
the master alignment doc (W1/W2) — get crowded out. The diagrams will then describe a
product whose centre of gravity no longer matches the document the supervisor approved.

**Reasonable options.**
1. **Two-track FYP** — keep Modules 3/5/6 as the analysis deliverables and build the
   platform layer (auth, ownership, plans, usage, admin) as the productisation deliverable.
2. **Platform-first** — build the SaaS layer now and reduce analysis scope.
3. **Analysis-first** — finish Modules 3–6 and defer auth/billing/admin to a later phase
   or to a documented "commercial roadmap" rather than an FYP build commitment.

**Recommendation (📐, not a decision I can make).** Option 1, with a **reduced platform
slice** that is genuinely load-bearing: identity + ownership + run history + usage
attribution + a minimal entitlement check + a minimal admin view. Defer payments (D-08)
and storage-quota enforcement (D-07/D-09) to a simulated or configurable boundary. Reason:
identity and ownership are prerequisites for *everything* else (including safe multi-user
analysis, see D-03/E1), while billing and quotas are commercial features whose absence does
not invalidate the technical work.

**Trade-off.** Option 1 spreads effort across two domains and risks finishing neither
deeply; option 3 keeps the FYP defensible on its original claim but leaves the meeting's
product direction undelivered; option 2 delivers a demo-able SaaS shell around an
incomplete intelligence engine, which is the weakest position in a technical review.

**What must happen if it is approved:** a proposal change record (v1.4) listing the added
platform requirements, and a new warning row in the master alignment doc
`../../build-logs/README.md` §6 so the supervisor-facing file stays truthful.

**Blocks?** **Yes** — every target-state diagram (D2, D3, D4, D9) and the requirement set
in `01-audit-and-requirements.md` §B inherit from this answer.

---

## G.2 Identity and isolation

### D-03 — Repository identity and ownership ❓ (technically urgent)

**Question.** A repository is currently identified by a sanitized version of the uploaded
filename (`ingestion.service.ts:19-28,66`), and Neo4j deletes every node carrying that name
before re-creating them (`graph.service.ts:63-69`).

**Why it matters.** With more than one user, two uploads named `app.zip` from different
projects **silently destroy each other's graph**. Ownership, quotas, history, admin
scoping and per-user caching all depend on a stable, non-colliding identifier. There is no
way to satisfy UR-03, UR-07 or AR-02 without changing this.

**Options.** (a) UUID minted per repository record, used as the Neo4j `repository`
property. (b) Composite key `(userId, name)` stored as a property. (c) Keep names and rely
on Neo4j per-user databases.

**Recommendation.** **(a)** — one globally unique application-minted id; names stay as
display data only. The write path already threads a single `repository` value through every
node and edge, so the change is small; the cross-database strategy is in
`04-data-models.md` §F.3.

**Trade-off.** Existing stored graphs in the prototype are keyed by name, so they need a
one-off re-analysis (cheap — no live users) or a property migration. Option (c) would give
clean isolation per database but Neo4j Community does not offer multi-database, so it is
not actually available.

**Blocks?** **Yes** — Diagrams 2, 5, 7, 8.

### D-01 — Authentication design ❓

**Question.** Sessions vs tokens vs an external identity provider. Nothing exists today
(no auth middleware; no `authorization`/`cookie` handling anywhere in `backend/src`).

**Why it matters.** It decides the shape of `users`/`sessions`, every route guard, the
admin boundary, CSRF posture, and the client architecture of both applications.

**Options.** (a) Server-managed session cookies (HttpOnly, Secure, SameSite) with a session
store. (b) Short-lived access token + rotating refresh token stored server-side. (c) An
external identity provider (OAuth/OIDC) — attractive for a demo, but adds a dependency,
and the proposal puts *enterprise SSO* out of scope.

**Recommendation.** **(a)** for an FYP — simplest to secure and to reason about, revocable
server-side, and matches "server-managed session or token-based design" in the brief
without inventing a provider. Choose (b) only if a native/mobile or multi-service client is
announced.

**Trade-off.** Sessions need same-site handling and a store to clean; tokens are stateless
but revocation gets awkward; (c) is quick to build and impressive to show, but hides the
engineering being examined and risks the demo dying with a network outage.

**Blocks?** **Yes** — Diagrams 2, 3, 8.

### D-02 — Administrator accounts ❓ (low risk)

**Recommendation.** One `users` table with a `role` value (`user` | `admin`); the admin
client is just another principal with a role the server verifies. **No** separate admin
store, no `role_assignments` table for a single role. **Blocks?** No.

### D-11 — Administrator application form ❓

**Options.** (a) Separate client build (own Vite app under `/admin`). (b) Same SPA with
role-gated routes.

**Recommendation.** **(a)** — the meeting requirement is explicit that the administrator
experience is *not* a dashboard card inside the user product, and a separate build makes
that true in the artefacts, not just in intent.

**Trade-off.** A second app duplicates some tooling and deployment surface for an FYP.
**(b)** is cheaper and is what many small products actually do — but it weakens the stated
requirement. **Blocks?** Partly (Diagrams 2 and 4 need the answer to be drawn solid).

---

## G.3 Analysis execution

### D-04 — Synchronous vs background analysis ❓

**Question.** The pipeline runs inside one HTTP request today (verified: `repository.controller.ts:51-134`,
Multer → analyse → Neo4j → response, with cleanup in `finally`). Real evidence: ~65 s for a
53-node repository; 461 nodes/1 148 edges for `class-validator`.

**Why it matters.** UR-03/UR-04 want status, history and durations. A blocking request
cannot report progress, dies on timeouts/proxies, and cannot be retried safely. Long
requests also hold memory for the whole repository (`analysis.service.ts`).

**Options.** (a) Keep synchronous + a client polling a run record created up front. (b)
In-process job/worker with a run row (`queued → running → succeeded|failed`) and
`202 Accepted`. (c) A brokered queue (Redis/BullMQ/RabbitMQ).

**Recommendation.** **(b)** inside the same monolith. A run table plus a small
in-process executor gives status, retry, crash recovery and honest durations without
adding infrastructure. **Do not** choose (c) for an FYP — it buys nothing at this scale and
adds an operational dependency the brief warns against.

**Trade-off.** (b) still dies with the process unless runs are recovered on startup — so the
run row must be created **before** execution and marked on startup if orphaned. That is a
real, cheap improvement over today.

**Blocks?** **Yes** for Diagrams 3 and 5 (the user workflow and the processing flow).

### D-05 — Retention of uploaded source ❓

**Question.** Today the ZIP and the extracted tree are deleted after the response
(`repository.controller.ts:126-133`; startup purge in `server.ts:24-27`), while
`sourceSnippet` fragments stay in Neo4j and are returned by `GET /api/graph`.

**Why it matters.** It determines what the storage quota can even measure (UR-07/D-09),
what "re-analyse" means for history (UR-04), and the privacy posture (E3).

**Recommendation.** Keep uploads transient by default; treat the durable artifacts as
**graph + reports/plans**, and count quota against those plus repository count — not
against bytes that no longer exist. If retention is ever needed, define a TTL and an
encrypted at-rest location.

**Blocks?** Partly (quota definition and Diagram 9).

### D-09 — Storage location for retained artifacts ❓

**Options.** Local disk (as now) vs object storage (S3-compatible). **Recommendation.**
Local disk behind a small `StorageAdapter` interface, so object storage later is a new
implementation rather than a rewrite. **Blocks?** Partly (Diagram 2's storage box).

### D-06 — Implementation plan vs Change-Impact Analyzer ❓

**Question.** UR-05 asks for a downloadable `implementation-plan.md` describing suggested
changes; the approved proposal's Module 3 is a Change-Impact Analyzer that takes a
natural-language requirement, validates candidate entities against the graph, traverses
direct/indirect impact, and computes requirement-specific technical debt/risk. The brief
says keep them distinct *unless* the responsibilities are explicitly merged.

**Why it matters.** They share the hard 80 % — requirement → entity resolution grounded in
the graph → affected components. Building them as two features means two prompt paths, two
validations and two UIs over the same missing capability (both are currently 0 %).

**Options.** (a) One Module 3 service producing two outputs: an *impact report* (affected
components, dependency paths, debt/risk score) and a *plan* (ordered steps, tests,
acceptance criteria) rendered to Markdown. (b) Two independent modules. (c) Plan now,
impact analysis later.

**Recommendation.** **(a)**. It matches the proposal's Module 3 text, delivers the meeting's
downloadable artefact, and keeps one evidence path. Both outputs must still be labelled as
**generated advice** — a plan is not a code change (the brief's boundary, and the
proposal's out-of-scope list).

**Blocks?** **Yes** — Diagrams 5, 6, 8, 9, and the requirement split in §B.

---

## G.4 Commercial and measurement decisions

### D-07 — Plans, prices and limits ❓

**Unresolved.** The meeting record mentions a **$12 Pro starting point** as a discussed
business concept; it is **not** an approved price, and no quota number has been agreed.

**Recommendation.** Model plans as **configuration rows** (`subscription_plans` + a
per-feature entitlement/limit table) so limits never live in code. Draw the entitlement
decision as a single named gate used by every paid feature. Ask the project owner to
supply (or explicitly defer) the numbers. **Blocks?** **Yes** for Diagram 9's limit values —
otherwise Diagram 9 is drawn with symbolic limits (e.g. *L₁…Lₙ*) and no numbers.

### D-08 — Payment provider and whether payments are in scope at all ❓

**Unresolved.** No provider is named anywhere in the source, the proposal or the meeting
requirements.

**Recommendation.** Keep payments **out of the FYP build** and implement the state machine
behind an adapter with a fake/simulated provider (webhook verification, idempotent by
provider event id, `pending/failed/cancelled` never granting access). This preserves the
architecture claim without inventing a vendor or touching real money. **Blocks?** **Yes**
for a real Diagram 9; with the recommendation it becomes a *simulated* Diagram 9.

### D-10 — Cost basis: actual vs estimated ❓

**Unresolved.** Today `llm.client.ts` discards the provider response body except
`choices[0].message.content` (interface at lines 22-31), so **no token usage is captured at
all** (finding E7). Whether Groq (or any chosen provider) returns usable `usage` and
billing-grade figures has not been established here.

**Recommendation.** Persist `usage` whenever the provider returns it, and treat any locally
derived figure as an **estimate** with `cost_basis = estimated` + `pricing_version`. Label
anything not obtainable as **unavailable** — never zero. Keep BYOK spend in a separate
bucket that is neither CodeAtlas revenue nor CodeAtlas cost (UR-09/D-15). **Blocks?**
Partly (Diagram 9's cost section and AR-06 wording).

### D-15 — Platform key vs user key fallback ❓

**Recommendation.** Explicit `attribution` on every usage event: `platform` when the app's
own key paid, `user_provider_key` when the user's key did — and only the first is a
CodeAtlas cost. Requires the client signature change in E8. **Blocks?** Partly (Diagram 9).

### D-12 — Analytics freshness ❓

**Recommendation.** Query-time aggregation over transactional tables at FYP scale; no
rollup jobs, no warehouse, no separate metrics DB. Add caching only when a measured
latency problem exists. **Blocks?** No.

### D-14 — Is "Project" a real concept? ❓

**Question.** The meeting text says users "access their own projects, repositories…", but
the current system knows only repositories.

**Recommendation.** Keep `projects` **only** if the UI will genuinely group several
repositories under one name; otherwise attach repositories straight to users and drop the
table. A table that exists only to mirror the word "project" on a screen is exactly the
per-screen-table anti-pattern. **Blocks?** No (it changes Diagram 8's width).

---

## G.5 Deployment and diagram scope

### D-13 — Diagram 10 (Deployment Architecture) ❓

**Evidence.** `docker-compose.yml` defines **one** service, `neo4j:5`
(`container_name: codeatlas-neo4j`, ports 7474/7687, `NEO4J_AUTH=neo4j/codeatlas123`, one
named volume). There is **no** Dockerfile for the backend or frontend, **no** CI workflow
file in the repository, **no** reverse proxy, **no** hosting/cloud decision, and the
proposal's WBS 3.12 ("Docker packaging, deployment, demonstration environment and pilot")
is unstarted (master doc W14).

**Recommendation.** **Do not draw Diagram 10 in this round.** A deployment diagram built
from these facts would be a claim about infrastructure that does not exist. If a
deployment view is required for the report, draw the *development* topology truthfully
(two dev servers + one Neo4j container + two external calls) and label it as such.

**Blocks?** It is itself the blocker: choosing to produce Diagram 10 requires first
answering where the app will run and whether it gets containerised.

---

## G.6 Decisions already settled by evidence (no question needed)

These are recorded so the diagrams can draw them **solid**:

- Backend build order and pipeline stages — verified end to end (Flow 2).
- Graph persistence is best-effort with `persisted:false` — verified.
- Relationship provenance model (`derived`/`resolved`/`name-match`) — verified.
- Prompt-injection stance and strict-JSON validation with server-side normalisation/caps —
  verified in `report.service.ts` / `llm.client.ts`.
- Cache invalidation on re-analysis, backend and frontend — verified.
- Zip-slip rejection and ZIP magic-byte validation — verified.
- **No** microservices in the target — recommendation accepted unless new evidence appears.
- The relational store is a **separate** store from Neo4j, joined in the application layer —
  design rule, see F.3.

➡️ Next: [`06-diagram-blueprints.md`](./06-diagram-blueprints.md)
