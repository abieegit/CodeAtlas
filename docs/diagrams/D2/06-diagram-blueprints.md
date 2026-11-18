# 06 — Diagram Blueprints (Section H)

Blueprints only. **No draw.io file is produced in this phase.** Each blueprint lists the
exact components, boundaries, arrows, decision points and the status convention so the
diagram can be drawn directly from it once the blocking decisions in
`05-decisions-open-questions.md` are answered.

## H.0 Status convention (identical on every diagram)

| Style | Meaning | Rule |
| --- | --- | --- |
| **Solid border, filled** | ✅ Implemented & verified in this repository | only components listed in `01-audit-and-requirements.md` §I.1 |
| **Solid border, light fill** | 🔌 External party actually used today (Neo4j, LLM provider) | |
| **Dashed border, grey** | 🆕 Proposed — required, no code exists | never fill with colour, never label as implemented |
| **Dashed red border** | ❓ Unresolved decision | put the D-id in the label |
| **Dashed amber border** | 🟡 Partially implemented | list the gap in the sub-label |
| Line styles | solid arrow = real HTTP/DB call today · dashed arrow = proposed call · grey dotted = external/provider boundary | |
| Every diagram | a legend box with these six marks + a "as of Build 04, 2026-10-20" caption | |

Swimlane labels use the actual file names from this repository so a reviewer can verify any
solid box by opening it.

---

## Diagram 1 — Current System Architecture (draw now ✅)

**Components (all solid, all verified):**

- Client group *Browser :5173*: `App.tsx`, `UploadPanel`, `GraphView` (+`graphLayout`,
  `graphFilters`, `nodeStyles`), `SearchPanel`, `ExecutionFlowsView` (+`executionFlows`),
  `AnalysisReportView`, `DetailsPanel`, `Legend`, `api.ts` (in-browser `summaryCache`).
- Dev proxy: *Vite `/api` → :5000* (one node, labelled "dev only").
- Backend group *:5000 monolith*: `server.ts` → `repository.routes` (+Multer 50 MB),
  `analysis.routes` → `repository.controller`, `analysis.controller`; service layer
  `ingestion`, `parser.service`, `analysis.service` (4 phases), `scope.service`,
  `graph.service`, `analysis/repo-digest`, `analysis/report.service`,
  `analysis/function-summary`, `analysis/llm.client`; support nodes `config/env.ts`,
  `database/neo4j.ts`, `utils/{file,ignore,classify}`; parser nodes
  `ast.parser`, `entity.extractor`, `relationship.extractor`, `module-resolver`,
  `symbol.resolver`, `graph.builder`.
- Storage: *Neo4j 5* 🔌 (label: `:Entity:<Type>`, CONTAINS/IMPORTS/CALLS/EXTENDS,
  evidence props) + *filesystem* `backend/uploads/` → `backend/extracted/` (label
  "transient — deleted after response").
- External: *LLM provider* 🔌 (label: OpenAI-compatible chat/completions, Groq default,
  global key from `env.llm`).

**Arrows:** client→proxy→routes→controllers→services; `parser.service`→`analysis.service`→
parser nodes; `analysis.service`→`graph.builder`; `parser.service`→`graph.service`→Neo4j;
`report.service`/`function-summary`→`llm.client`→provider; `function-summary`→
`graph.service` (context read); `analysis.controller`→`graph.service` (full graph read for
the digest).

**Boundaries to draw:** one big "trusted backend" box; a thin "untrusted repository content"
arrow into the prompts (label: *content treated as data*); a dashed boundary marking
**no authentication anywhere** — that is a real property of the current system and belongs
on the diagram.

**Deliberately excluded:** anything from §D.3. Only §I.1 items get solid borders.

---

## Diagram 2 — Target System Architecture (blocked by D-16, D-01, D-03, D-09, D-11)

Three vertical groups: **User Application** 🆕 (separate client), **Administrator
Application** 🆕 (separate build, `05-decisions-open-questions.md` D-11), **Backend
monolith** (one box — explicitly *not* microservices) split into Interface / Application /
Domain / Infrastructure bands as in `02-architecture-current-target.md` §D.4.

**Include:** auth+authZ middleware 🆕❓; the 19 modules from §D.2/D.3 as labelled
rectangles, each tagged ✅/🟡/🆕; the existing pipeline as a single **unchanged** sub-box
(solid) with a note "preserved — not redesigned"; persistence: *Neo4j* ✅ (graph content)
and *PostgreSQL candidate* 🆕❓ (identity/ownership/runs/usage/plans); storage adapter 🆕❓;
external: LLM provider 🔌, payment gateway 🔌❓ dashed, optional identity provider 🔌❓ dashed.

**Security boundaries to draw as explicit containers:** (1) client → API behind
authentication; (2) admin API behind a server-side role guard; (3) credential store behind
an encryption boundary with no arrow to any client; (4) Neo4j reachable **only** from the
backend, never from either client (the brief's "no unrestricted database access from the
browser"); (5) ownership guard sitting in front of every repository/graph read (D-03).

**Arrows:** user app → `/api/*` (auth); admin app → `/api/admin/*` (role-guarded);
entitlement gate → every paid feature; usage meter ← each AI call; quota guard → before
ingestion; plan/subscription state → entitlement gate; analytics → derived from transactional
tables (dashed) not from a warehouse.

**Label to include verbatim on the proposed cloud:** "proposed — no code today".

---

## Diagram 3 — User Workflow (blocked by D-01, D-04)

Swimlanes: *User* · *User Application* · *Backend* · *Neo4j* · *LLM provider*. Steps from
`03-execution-flows.md` Flow 1 → 2 → 3 → 4 → 5 → 9a in user-visible order:

`sign up` → `log in` → decision **profile complete?** (no → onboarding, yes → dashboard) →
dashboard → select/upload repository → **entitlement + quota decision** (over quota →
clear stop state) → analysis (status `queued → running → succeeded/failed`, D-04) →
explore graph (filters/search/select node → core purpose) → execution flows →
analysis report → repository history (UR-04) → request a change/feature →
**generate plan** → review → **download `implementation-plan.md`** → view API usage &
cost → view plan/storage usage → **upgrade decision** (only here does payment appear, 9a) →
logout.

**Decision diamonds to include:** authenticated? · profile complete? · within quota? ·
plan allows this feature? · analysis succeeded? · provider returned usage? · payment
**verified server-side**? · user supplied own key?
**Error paths that must appear:** non-ZIP rejection, Neo4j unavailable (`persisted:false`,
analysis still usable), AI key missing → configuration message, 429 → retriable, plan
generation refused, cross-user repository request → denied.
**Dashed vs solid:** everything up to "upload + graph + report" is solid-ish today **except**
auth/quota/plan/usage/upgrade lanes, which are dashed grey with D-ids.

---

## Diagram 4 — Administrator Workflow (blocked by D-16, D-11, D-12)

Swimlanes: *Administrator* · *Admin Application* · *Backend (role-guarded APIs)* ·
*Stores* — and an explicit fourth lane **External provider (never accessed by admin)**.

`admin log in` → **role verified server-side?** (no → 403, recorded) → admin dashboard →
choose branch A or B:

- **A. Aggregated analytics (default):** filters (date range, plan, feature,
  provider/model, status, user segment) → user metrics · usage metrics · subscription
  metrics · cost/revenue metrics → each value tagged
  **measured / calculated / estimated / unavailable**.
- **B. Record-level management (privileged):** search users → open one user (allow-listed
  fields only) → aggregated usage → apply account action (confirm + reason) →
  **written to `audit_events`**.

**Hard exclusions drawn as a barred boundary:** passwords, session tokens, API-key
material, and repository source content are **not reachable** from either branch; private
source access is a separate privileged capability, off by default (AR-03). No arrow from
the admin client to Neo4j or the database. No impersonation path by default.

---

## Diagram 5 — Repository Processing & AI Execution Flow (blocked by D-03, D-04, D-05)

The verified pipeline as one continuous flow with the exact file names, from Flow 2 of
`03-execution-flows.md`: upload → ZIP validation (name + `PK`) → safe extract (zip-slip
skip, single-root detect) → scan → Babel parse → entity extract (+`sourceSnippet`) →
TS program build → relationship extract (with provenance) → graph build → scope annotate →
Neo4j scoped delete + create → `{graph, persisted}` → cache invalidation → 201 → temp
cleanup.

**Three separate AI request paths, drawn as three separate flows (they are not one):**
1. **Report:** `GET /api/analysis` → `fetchGraph` (read) → digest → signature + cache key →
   hit? → else `chatComplete` → normalize + cap → cache → response → *(🆕 persist + meter)*.
2. **Function summary:** `GET /api/analysis/function` → `fetchFunctionContext` →
   cache key → else `chatComplete` → one sentence → *(🆕 meter)*.
3. **Implementation plan (all 🆕):** requirement text → entity resolution against the graph
   → validation (drop anything not in the graph) → `chatComplete` → normalize →
   store → `GET …/:id.md` render.

**Also draw:** error interactions (401/403/429→503/timeout→504/empty completion→502),
cache stores (in-process today 🟡, persistent 🆕), the cleanup step, and the storage
interactions that do **not** exist yet (retention, quota counters) as dashed.

---

## Diagram 6 — UML Class & Module Diagram (blocked by D-06, E8/DIP refactor)

**Rule: no invented classes.** Everything solid must be a real declaration in source.

Solid (verified): interfaces/types `GraphNode`, `GraphRelationship`,
`RelationshipEvidence`, `GraphData`, `EntityType`, `RelationshipType`, `FileCategory`,
`ResolutionMethod`, `AnalysisReport`, `AnalysisFactor`, `FactorSeverity`,
`ExtractedRepository`, `ChatMessage`, `RepoDigest`, `FunctionSummary` ·
class `LlmError extends Error` (the only real class in the pipeline layer) ·
`RelationshipContext` (used by the extractor) · function-modules with their exported
operations as methods: `ast.parser::parseFile`, `entity.extractor::extractEntities`,
`relationship.extractor::extractRelationships`, `symbol.resolver::createSymbolResolver`,
`module-resolver::resolveModule`, `graph.builder::buildGraph`,
`analysis.service::analyzeRepository`, `scope.service::annotateScope`,
`ingestion.service::extractZip`, `parser.service::analyzeAndStore`,
`graph.service::{saveGraph, fetchGraph, fetchFunctionContext, listRepositories,
verifyConnection}`, `report.service::{generateRepositoryReport, invalidateReports}`,
`function-summary.service::{summarizeFunction, invalidateSummaries}`,
`llm.client::{chatComplete, parseJsonCompletion}`, `repo-digest::buildRepoDigest`.

Relationships to draw correctly: `parser.service` **depends on** `analysis.service`;
`analysis.service` **uses** the parser modules; `report.service` **depends on**
`llm.client` and `repo-digest`; `function-summary.service` **depends on** `llm.client` and
`graph.service`; controllers **depend on** services; `LlmError` **is raised by**
`llm.client` and **is handled by** `analysis.controller`. Mark function-only modules as
«module», not as classes (the brief warns against inventing classes for function-oriented
code).

Separate dashed **"future design view"** panel: `LlmProvider` «interface» (E8),
`StorageAdapter` (D-09), `EntitlementPolicy`, `UsageMeter`, `OwnershipGuard`,
`PaymentGatewayAdapter`, `Authenticator`, `AdminOperations`, `AnalyticsService` — each
labelled proposed and tied to its requirement id.

---

## Diagram 7 — Current Neo4j Data Model (blocked by D-03 for the *change*, not for the picture)

Draw the verified model from `04-data-models.md` §F.1: one `:Entity` supertype with seven
subtype labels (mark `Variable` as **declared, never emitted**); the ten node properties
exactly as written (`id, type, name, filePath, startLine, endLine, category,
inDefaultScope, sourceSnippet, repository`); four relationship types with the three
evidence properties (`line, filePath, resolution`) and each type's resolution value
(`derived` / `resolved` / `name-match`); directions `(source)→(target)`, including the
`fetchFunctionContext` inbound `CALLS` pattern.

**Call-outs that belong on the diagram** (they are facts, not opinions): identity =
application-generated repository-relative strings; **no uniqueness constraint and no
indexes exist**; scoping = the `repository` property; re-analysis = scoped
`DETACH DELETE` then per-node/per-edge `CREATE` (no `MERGE`, no batching);
`GET /api/graph` without a parameter returns every repository.

Dashed overlay for the target (labelled proposed): `repository` = UUID (D-03),
`UNIQUE (repository, id)` constraint + `id`/`category` indexes, an `unresolved`
resolution value (E13), optional `Route`/`APIEndpoint` entity (proposal Module 1 gap),
and `sourceSnippet` no longer returned to clients (E3).

---

## Diagram 8 — Proposed Application ERD (blocked by D-16, D-01, D-08, D-14, D-07)

Entities and relationships exactly as `04-data-models.md` §F.2, with crow's-foot
cardinalities: `users 1—* projects 1—* repositories 1—* analysis_runs 1—0..1
analysis_reports`; `repositories 1—* implementation_plans` (+ optional
`created_by_run_id`); `users 1—* usage_events` (+ nullable `repository_id`,
`analysis_run_id`); `users 1—* api_credentials` with `UNIQUE(user_id, provider)`;
`users 1—0..* subscriptions *—1 subscription_plans 1—* plan_entitlements`;
`subscriptions 1—* payment_transactions` with `UNIQUE(provider_event_id)`;
`audit_events` referencing actor and target.

**Show on the diagram:** PKs, FKs + delete rule (CASCADE/RESTRICT as listed), the unique
constraints that carry meaning (one active subscription per user, one credential per
provider per user, one report per run+type), which columns are **secrets and therefore
hashed/encrypted/never selected into a response**, and which tables are
source-of-truth / transactional / audit / reference.

**Show as an annotation, not a box:** the cross-database identity rule —
`repositories.repository_id` is also the Neo4j `repository` property value; **no foreign
key crosses the stores**; ownership is enforced in the application layer (F.3). Do not draw
an arrow between the PostgreSQL and Neo4j boxes — a reviewer would read it as a join.

---

## Diagram 9 — Subscription, Usage & Payment Flow (blocked by D-07, D-08, D-10, D-15)

Swimlanes: *User* · *Backend* · *Entitlement gate* · *Usage meter* · *Payment provider* 🔌❓.

Content: feature request → **central entitlement decision** (plan + subscription state +
usage + limit; limits shown as symbols, not invented numbers) → allow/deny → if denied and
the feature is paid, offer upgrade → 9a checkout (pending) → external gateway → return
redirect (**labelled "not proof of payment"**) → webhook **verified + idempotent** →
state machine `pending / active / past_due / cancelled / expired` → entitlement re-check →
quota re-evaluation (D-05/D-09) → cache invalidation → audit.
Parallel band: **usage/cost** — one `usage_event` per AI operation with
`attribution = platform | user_provider_key`, `cost_basis = actual | estimated | unknown`,
currency + pricing version, and a boundary note that BYOK spend is the user's provider bill
— neither CodeAtlas revenue nor CodeAtlas cost.
Failure states that must appear: unsigned webhook, duplicate event, pending payment,
failed payment, refund/cancel policy, plan downgrade while over quota, missing provider
`usage`.

---

## Diagram 10 — Deployment Architecture — **recommend NOT drawing it** (D-13)

Honest evidence today: `docker-compose.yml` with **one** service (`neo4j:5`, ports
7474/7687, `NEO4J_AUTH=neo4j/codeatlas123`, one named volume) plus two `npm run dev`
processes and two external network calls. No Dockerfile for either application, no CI
workflow in the repository, no proxy, no cloud/hosting decision, no secrets-management or
backup story, and the proposal's own "Docker packaging, deployment, pilot" WBS item
(3.12) is unstarted.

If a view is required for the report, draw it as **"development topology (verified)"**:
browser → Vite dev server :5173 → Express :5000 → Neo4j container :7687 → LLM provider,
with a dashed "target deployment — not yet designed" frame containing nothing but the
decisions still open (containerisation, hosting, TLS termination, secrets, backups,
scaling). Do **not** invent load balancers, regions or managed services.

---

## H.1 Cross-diagram consistency checks (run before approval)

1. Every solid box in Diagrams 1–8 appears in §I.1 of `01-audit-and-requirements.md`.
2. Every dashed box appears in §I.2 or §B with a requirement id.
3. No diagram shows a payment provider name, a price, or a quota number (§G D-07/D-08).
4. No client arrow touches Neo4j, PostgreSQL or the credential store directly.
5. `implementation-plan.md` is drawn as **generated advice**, never as a code change, in
   Diagrams 3, 5 and 9.
6. Storage is shown as three distinct metrics (retained bytes / graph data / generated
   text) wherever quota appears — Diagrams 2, 3, 8, 9.
7. Audit events, analysis history, AI reports and the user-visible work log are four
   different things in every diagram that touches any of them.
8. Where the current system has no isolation, the diagram says so (Diagrams 1, 7).
9. Diagrams 2, 5, 7 all show the **same** repository identity scheme (D-03).
10. Diagram 6's solid classes exist verbatim in source; the future panel is clearly
    separated.

➡️ Next: [`07-engineering-review.md`](./07-engineering-review.md)
