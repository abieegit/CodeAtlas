# 02 — Current Architecture (C) and Target Architecture (D)

Status legend: ✅ implemented & verified · 🟡 partial · 🆕 proposed (no code) ·
🔌 external · ❓ unresolved. Findings labelled E* are in
[`07-engineering-review.md`](./07-engineering-review.md); decisions D-* in
[`05-decisions-open-questions.md`](./05-decisions-open-questions.md).

---

## Section C — Current architecture (what actually runs)

### C.1 Shape

One **layered monolithic** backend (`backend/`, Express 5 + TypeScript) and one
single-page client (`frontend/`, React 18 + D3 7 + Vite 5). Two persistence stores:
Neo4j for graph data (🔌) and the local filesystem for transient upload/extraction
scratch space. One external AI dependency (any OpenAI-compatible `chat/completions`
endpoint, documented default Groq 🔌). There is **no** relational database, **no** auth
layer, **no** queue, **no** cache server, **no** container for the application itself.

```
┌──────────────────────────── Browser (http://localhost:5173) ───────────────────────────┐
│  App.tsx  ─  UploadPanel │ GraphView │ ExecutionFlowsView │ AnalysisReportView │ Details│
│  api.ts (fetch /api…)    in-browser summaryCache (Map)     graphFilters/search/layout    │
└───────────────────────────────────────┬──────────────────────────────────────────────┘
                       Vite dev proxy: /api → http://localhost:5000  (no CORS issue in dev)
┌───────────────────────────────────────┴───────────────────── Backend :5000 ─────────────┐
│ server.ts  cors() · express.json() · /api routers · 404 JSON · error handler            │
│  routes: repository.routes (multer 50MB → uploads/)      analysis.routes                 │
│  controllers: repository.controller      analysis.controller                             │
│  services: ingestion → parser → analysis → scope → graph.service → persistence           │
│            analysis/{repo-digest, report.service, function-summary, llm.client}          │
│  config/env.ts (global singleton)      database/neo4j.ts (driver singleton)             │
└──────────────┬──────────────────────────────────────────────────┬──────────────────────┘
               │ bolt 7687                                        │ HTTPS chat/completions
        ┌──────┴───────┐                                   ┌──────┴────────┐
        │ Neo4j 5 🔌   │  :Entity:<Type> nodes             │ LLM provider  │ global API key
        │ one database │  CONTAINS/IMPORTS/CALLS/EXTENDS   │ (Groq default)│ env.llm.key
        └──────────────┘                                   └───────────────┘
        filesystem: backend/uploads/*.zip  →  backend/extracted/<name>-<ts>/   (deleted
        after the response unless KEEP_EXTRACTED=true)
```

### C.2 Boundaries and communication paths (verified)

| Boundary | Mechanism | Evidence | Notes for the target design |
| --- | --- | --- | --- |
| Client ↔ API | HTTP JSON; multipart for upload | `api.ts` + `vite.config.ts` proxy | No session, no token, no origin restriction (`cors()` bare) |
| Controller ↔ service | Direct function import | `repository.controller.ts:9-32` | Thin controllers **except** response shaping (E10) |
| Service ↔ service | Direct import, no interfaces | `parser.service` → `analysis.service` → `graph.service` | Simple and fine at this size; DIP matters only where a provider varies (E8) |
| API ↔ Neo4j | `neo4j-driver` sessions, parameterised Cypher | `graph.service.ts` | Allow-listed labels; no constraints/indexes (E5) |
| API ↔ LLM | `fetch` to `{baseUrl}/chat/completions` | `llm.client.ts:63-85` | Timeout via `AbortController`; `usage` discarded (E7) |
| API ↔ filesystem | `fs` writes under `env.uploadsDir` / `env.extractedDir` | `routes:15`, `ingestion.service.ts` | Paths resolved from cwd (E16); artifacts deleted after the run |

### C.3 Runtime behaviour that the target must respect (do not redesign these away)

1. **The backend is the only place graph semantics are created.** The client never builds
   nodes or edges — it renders what the API returns. This keeps provenance trustworthy and
   must survive into the target.
2. **Persistence is best-effort.** `{ graph, persisted:false }` still returns a working
   graph. Any new "analysis record" must therefore treat Neo4j write failure as a *status*,
   not a crash.
3. **Per-file fault tolerance** — one unparsable file never aborts a repository.
4. **Physical vs repository-relative paths never mix** (`RelationshipContext`). Retained:
   this is exactly what will keep source paths safe to expose later.
5. **Provenance on every edge** (`evidence.resolution`). Retained: the change-impact and
   vulnerability modules should carry the same discipline.
6. **Cache invalidation on re-analysis** already exists on both sides — the entitlement and
   usage layers must hook the same seam rather than invent a new one.
7. **Synchronous pipeline inside one request** — real evidence of ~65 s for a small
   repository. This is the single biggest runtime constraint for UR-03/UR-04.

### C.4 What the current architecture cannot express (drives Section D)

| Missing concept | Why the current shape blocks it |
| --- | --- |
| Identity | No request carries a user; every endpoint is public |
| Ownership | `repository` is a sanitized filename, not a scoped resource (E1) |
| Isolation | `GET /api/graph` without a parameter returns **all** stored repositories (E2) |
| Retention/quota | Uploads and extractions are deleted in `finally`; nothing accumulates to measure |
| Metering | LLM `usage` never parsed; no request id; no per-user attribution |
| Entitlements | `env.llm.*` is global; caches keyed by repository only (E4) |
| Administration | No role, no admin surface, no audit trail |
| Recovery | In-process `Map` caches and in-flight promises die with the process (E9) |

---

## Section D — Target architecture (meeting requirements)

### D.1 Deployment decision first

**Recommendation: keep one layered monolithic backend with explicit internal module
boundaries. 📐** No evidence in the source, the proposal or the meeting requires separate
deployable services: one analysis pipeline, one request pattern, one team, FYP scale. A
queue/worker split for long analyses (D-04) is a *background job inside the same
application*, not a new service. Modules below are **namespaces**, not deployments.

Two clients are justified by the meeting requirement itself: a **User Application** and an
**Administrator Application** (AR-01). 🆕 Both talk to the same backend through authorized
APIs; the admin client has no direct database path.

### D.2 Module map — implemented part first (no redesign needed)

| # | Module | Responsibility | Source today | Main deps | Input → output | Owns data | Status | Security need | Key failure mode |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 4 | Repository ingestion | Validate + safely extract archives | `services/ingestion.service.ts`, `utils/file.utils.ts` | `unzipper`, fs | upload file → `{repositoryName, repositoryPath, extractionDir}` | nothing persistent 🆕+ | ✅ | keep zip-slip rejection; stop trusting the name as identity | unreadable archive → 400; huge archive → disk pressure |
| 5 | AST parsing & entity extraction | Source → typed nodes | `parser/ast.parser.ts`, `parser/entity.extractor.ts` | Babel | file path → `GraphNode[]` | none | ✅ | parse only what the user owns | unparsable file (handled: skip) |
| 6 | Symbol & relationship resolution | Call/import/superclass resolution | `parser/{symbol.resolver,module-resolver,relationship.extractor}.ts` | TypeScript compiler | files + AST → `GraphRelationship[]` with evidence | none | ✅ | no path leakage across users | unresolved → currently omitted (E13) |
| 7 | Knowledge-graph construction | Assemble, dedupe, validate, annotate scope | `parser/graph.builder.ts`, `services/{analysis,scope}.service.ts`, `utils/classify.utils.ts` | above | entities+edges → `GraphData` | none | ✅ | keep id scheme repository-relative | in-memory size on large repos |
| 8 | Graph persistence & querying | Neo4j read/write + context queries | `services/graph.service.ts`, `database/neo4j.ts` | driver | `GraphData` → nodes/edges and back | Neo4j | 🟡 | add owner-scoping, constraints, batching (E1/E5) | DB down → `persisted:false` (by design) |
| 9 | Repository analysis & AI assistance | Metrics digest + report + function summaries | `services/analysis/{repo-digest,report.service,function-summary.service,llm.client}.ts` | Neo4j, LLM 🔌 | stored graph → report / one-line summary | in-process caches 🆕+ | ✅ | prompt-injection stance already correct; add per-user scoping | provider 4xx/5xx → mapped HTTP; empty completion → 502 |

### D.3 Module map — proposed part (🆕 everything below; nothing exists in source)

| # | Module | Responsibility | Input → output | Owns data | Status | Security need | Key failure mode |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | Authentication & authorization | Establish identity; authorize every private operation | credentials → session/token + principal | `users`, `sessions/refresh_tokens` | 🆕 | never store plaintext secrets; secrets never reach the client | expired/revoked session must fail closed |
| 2 | User & profile management | Profile read/update; onboarding completion flag | user id → profile; patch → profile | `users` | 🆕 | field allow-list (no self-service role/plan edits) | partial onboarding must not block read access |
| 3 | Project & repository management | Register, list, delete repositories; bind to user+project; expose run status | request → repository record | `projects`, `repositories`, `analysis_runs` | 🆕 | **every** read/write re-checks ownership (E1/E2) | name collision; stale running state after crash |
| 10 | Implementation-plan generation | Turn a selected feature/change + graph context into a structured plan; render `implementation-plan.md` | repository + requirement text → plan record → Markdown | `implementation_plans` | 🆕 | output validated against the graph; never presented as a code change | model returns non-JSON / invents files |
| 11 | Analysis history & report management | Store and serve per-run history, reports and plans | run → history rows; report content | `analysis_runs`, `analysis_reports` | 🆕 | no duplicated fact stores (B.3) | unbounded growth of AI text |
| 12 | Subscription & entitlement management | Central "may this user do X?" decision from plan + state + usage | user + feature (+ cost estimate) → allow/deny + reason | `subscription_plans`, `plan_entitlements`, `subscriptions` | 🆕 | enforced server-side; state machine driven by verified payments only | paid state revoked late; limits hardcoded (forbidden) |
| 13 | Usage metering & cost attribution | Record one event per AI/analysis operation; estimate cost from a priced table or record provider figures | request outcome → usage event | `usage_events`, `pricing_configuration` | 🆕 | BYOK spend attributed to the user's own provider bill, never platform revenue/cost (UR-09) | provider omits `usage` → event must be marked unknown, not zero |
| 14 | Payment integration (only if approved) | Provider-agnostic adapter: initiate, verify webhook idempotently, update subscription | checkout intent → verified event → state change | `payment_transactions` | 🆕 ❓ provider undecided (D-08) | webhook signature verification; idempotency key; ignore frontend redirects | replayed/duplicate events; pending → paid misread |
| 15 | Storage quota management | Track and guard retained bytes/counts per user; reclaim on delete | intended write → allow/deny; delta on completion | derived from `repositories` + `analysis_*` rows | 🆕 | separate metrics: retained artifacts vs graph data vs report text (D-09) | quota counted against a file that was already deleted |
| 16 | Secure API credential management | Store, validate, rotate, revoke per-user provider keys | key submission → metadata record; internal fetch → usable secret | `api_credentials` | 🆕 | encrypted at rest; redaction in logs; **never** serialized to any client (UR-08) | cross-user credential leakage through a shared client (E8) |
| 17 | Administrator management | Admin-only operations + role assignment + privileged-action audit | admin request → authorized result + audit row | `audit_events` | 🆕 | server-side role guard; no default access to source content or key material | treating the admin URL as the control |
| 18 | Business analytics | Aggregate users, usage, subscriptions, revenue, costs for admin dashboards | date range + filters → metric bundles | derived; optional cache | 🆕 | label measured/calculated/estimated/unavailable | double-counting BYOK spend; profit from revenue alone |
| 19 | Logging, audit & operational monitoring | Application logs (redacted) + security/audit events + metrics | events → sinks | `audit_events` (+ log files/external sink ❓) | 🆕 | never log raw tokens/keys; separate from user-visible work log | audit log becomes a second copy of app state |

Modules 1–19 from the brief map one-to-one onto the tables above (no module was dropped,
none was invented). Module 14 is included **conditionally** because no payment provider is
approved; if the project owner drops payments, it disappears and Diagram 9 is not drawn.

### D.4 Proposed layering (preserves the working core)

```
User App (React)   Admin App (React, separate build)   — both talk only to /api
        │  authorized requests                │  role-guarded requests
┌───────┴─────────────────────────────────────┴─────────── Backend (one app) ─────────────┐
│ Interface   routes + validation + authZ middleware (no business rules)                   │
│ Application services  analysis · entitlement · usage · storage · credential · plan ·      │
│                       history · admin-operations · analytics  (the only place rules live) │
│ Domain        shared contracts: GraphNode/Relationship (existing) + ownership,            │
│               entitlement decision, usage event types                                    │
│ Infrastructure  Neo4j repository (existing graph.service) · relational repository (🆕) ·   │
│                 LLM provider client (🆕 interface, existing wire code) · file/object      │
│                 storage (🆕 adapter) · audit sink                                          │
└──────────────────────────────────────────────────────────────────────────────────────────┘
        │                     │                      │                    │
     Neo4j 🔌          PostgreSQL 🆕❓         LLM provider 🔌      Storage 🔌❓ (D-09)
   (graph structure)   (identity, ownership, (chat completions)    (retained artifacts
                       runs, usage, plans)                          only if retained)
```

📐 **Why an interface for the LLM client:** the current `chatComplete()` reads a global key
(E8). Requirement UR-08 needs per-user credentials, which means the call site must supply
them. The smallest honest change is a provider interface — `complete(request, credentials)`
— with the existing Groq-compatible implementation behind it. That is dependency inversion
for a real reason, not decoration.

### D.5 Ownership boundary (the rule every new module must follow)

📐 **No endpoint may resolve a repository, run, report, plan, credential or usage record
without first binding it to the authenticated principal** (and, for admins, to a role plus
an audit record). In practice that means: application-layer records own identity and
ownership; Neo4j nodes stay content-addressed by a repository **identifier** minted by the
relational layer, not by a filename. Details and identifier strategy in
[`04-data-models.md`](./04-data-models.md).

### D.6 What must not change

- The pipeline's fault tolerance, provenance, path separation and best-effort persistence.
- "Backend builds the graph; frontend renders it."
- LLM as an explanation layer that never determines structure (proposal §AI Use).
- Monolithic deployment unless a concrete reason appears.

➡️ Next: [`03-execution-flows.md`](./03-execution-flows.md)
