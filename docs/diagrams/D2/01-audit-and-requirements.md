# 01 — Current Implementation Audit, Confirmed Requirements, Traceability

Covers **Section A**, **Section B** and **Section I** of the discovery brief.
Status legend: ✅ implemented & verified · 🟡 partial · 🆕 proposed (no code) ·
🔌 external · ❓ unresolved.

---

## Section A — Current Implementation Audit

Every "Source" cell is a file that exists in this repository and was read during this
discovery. Line references point at the specific behaviour being claimed.

### A.1 Backend — HTTP and composition layer

| Component | Actual source | Responsibility | Dependencies | Status | Evidence | Known limitations |
| --- | --- | --- | --- | --- | --- | --- |
| Application entry | `backend/src/server.ts` (65 lines) | Wires `cors()`, `express.json()`, mounts two routers under `/api`, JSON 404 handler, central error handler, `listen()` only when run directly | `config/env`, both routers | ✅ | Exported `app` is imported by `__tests__/app.api.test.ts` and `app.smoke.test.ts` without opening a port | `cors()` with **no options** = any origin allowed; no `helmet`, no body-size policy beyond Multer, no rate limiting, no request-id logging |
| Error surface | `server.ts:45-57` | Logs the error, returns `{ error: error.message }` with 500 | — | 🟡 | Test `app.smoke.test.ts` asserts the 404 JSON shape | **Leaks internal error messages to clients** (E11); no error taxonomy, no correlation id, no audit sink |
| Upload route + limit | `routes/repository.routes.ts:17-22` | Multer disk storage into `env.uploadsDir`, `fileSize: 50 * 1024 * 1024`, field `file` | `multer 2.4` | ✅ | `app.api.test.ts` posts real archives; asserts 201 and 400 paths | File is **written to disk before** the ZIP is validated (no `fileFilter`) — a renamed non-ZIP is stored then rejected (E12) |
| Graph routes | `repository.routes.ts:26-31` | `GET /health`, `GET /repositories`, `GET /graph` | controller | ✅ | Supertest in `app.api.test.ts`, `app.smoke.test.ts` | No authentication, no ownership filter, no pagination |
| Analysis routes | `routes/analysis.routes.ts:10-12` | `GET /analysis`, `GET /analysis/function` | `analysis.controller` | ✅ | `analysis.api.test.ts` with mocked Neo4j + stubbed `fetch` | Same: unauthenticated; query params are the only input validation |
| Health handler | `controllers/repository.controller.ts:34-45` | `{ status:"ok", neo4j: boolean }` | `verifyConnection()` | ✅ | `app.smoke.test.ts` | Boolean only; no latency, no version, no queue depth |

### A.2 Backend — analysis pipeline (the working core)

| Component | Actual source | Responsibility | Dependencies | Status | Evidence | Known limitations |
| --- | --- | --- | --- | --- | --- | --- |
| Configuration | `config/env.ts` (40 lines) | Loads `backend/.env` once via `dotenv` with an explicit path; exports one frozen-shape `env` object (port, Neo4j, uploads/extracted dirs, `keepExtracted`, `llm.*`) | `dotenv 18` | ✅ | Every service imports `env` rather than `process.env` | **Global singleton**: the LLM key/base/model are process-wide (E8). `uploadsDir`/`extractedDir` resolve from the **current working directory** (`path.resolve("uploads")`) |
| Neo4j driver | `database/neo4j.ts` (23 lines) | One driver singleton, basic auth, `disableLosslessIntegers: true` | `neo4j-driver 6.2` | ✅ | `neo4j.roundtrip.test.ts` (gated: runs only if the DB is reachable) | No connection-pool tuning, no retry/timeout policy, no health probe beyond `verifyConnectivity()` |
| Graph contract | `models/graph.types.ts` (72 lines) | `EntityType` (7 values incl. `Variable`), `RelationshipType` (4), `FileCategory` (6), `GraphNode` (with `category`, `inDefaultScope`, `sourceSnippet`), `ResolutionMethod` (`derived`/`resolved`/`name-match`), `RelationshipEvidence`, `GraphData` | — | ✅ | Mirrored by `frontend/src/types.ts` | `Variable` is declared but **never emitted** (E14); no `Route`/`APIEndpoint` type (proposal Module 1 gap) |
| Scanner | `services/repository.service.ts` | Recursive `.ts/.tsx/.js/.jsx` discovery as repo-relative POSIX paths, skipping ignored dirs | `utils/ignore.utils` | ✅ | `analysis.pipeline.test.ts` fixtures | Extension allow-list only; no monorepo/workspace awareness |
| AST parser | `parser/ast.parser.ts` | Babel parse, plugins by extension, `sourceType: module`, ranges | `@babel/parser 7.29` | ✅ | `pipeline` fixtures incl. `unsupported` (unparsable file is skipped, not fatal) | **Per-file only** — no cross-file syntactic context (that is what Phase 2 adds) |
| Entity extractor | `parser/entity.extractor.ts` | File/Class/Function/Method nodes; `const`/arrow functions become Function nodes; method ids class-qualified; captures `sourceSnippet` | `@babel/traverse` | ✅ | `pipeline` fixtures `arrow-functions`, `duplicate-names` | `SOURCE_SNIPPET_MAX_LENGTH = 700` (line 35) — long functions are truncated with `…`; no `Variable` emission |
| Relationship extractor | `parser/relationship.extractor.ts` | `CONTAINS`, `IMPORTS`, `CALLS`, `EXTENDS` with `evidence`; `RelationshipContext` separates physical vs repository-relative paths | symbol resolver, module resolver | ✅ | `pipeline` fixtures `calls`, `imports`, `inheritance`, `unresolved` | Unresolvable edges are **omitted silently** — no `unresolved` mark, contrary to the proposal (E13) |
| Module resolver | `parser/module-resolver.ts` | Relative import → repo-relative file; tries `.ts/.tsx/.js/.jsx` and `/index.*`; maps ESM `.js`→`.ts` | `fs` | 🟡 | `module-resolver.test.ts` | **No CommonJS `require()`** handling (proposal Module 1 lists it) — verified: no `require` reference anywhere in `backend/src/parser/` |
| Symbol resolver | `parser/symbol.resolver.ts` | One TypeScript program over all files; `resolveCallFromLocation` follows import aliases; innermost `CallExpression` wins | `typescript 5.9` | ✅ | `pipeline` fixture `calls` | Best-effort: dynamic imports, re-exports, overloads, external packages omitted |
| Graph builder | `parser/graph.builder.ts` | Repository node, derived Directory nodes + `CONTAINS`, node dedupe by id, drop dangling/self/duplicate edges | — | ✅ | `graph.builder.test.ts` | Pure in-memory pass; no persisted graph comparison (no incremental update) |
| Pipeline orchestrator | `services/analysis.service.ts` | 4 phases with per-file try/catch | all of the above | ✅ | `analysis.pipeline.test.ts` | Whole repository in memory; a large repo is bounded by RAM and by the synchronous request (E6) |
| Scope annotator | `services/scope.service.ts` + `utils/classify.utils.ts` | Sets `category` + `inDefaultScope` by classification and import reachability | — | ✅ | `scope.service.test.ts`, `classify.utils.test.ts` | Heuristic; mis-categorisation possible in unusual layouts |
| Ingestion | `services/ingestion.service.ts` (112 lines) | `sanitizeName` (filename base, non-`[A-Za-z0-9._-]`→`-`), extraction under `extractedDir/<name>-<Date.now()>`, zip-slip skip via `isPathInside`, single-root-folder detection | `unzipper 0.12` | ✅ | `archive.validation`-style tests in `app.api.test.ts` | **Repository identity = sanitized filename** — the root cause of E1; no per-user namespace; archive path traversal is blocked but entry *content* is trusted |
| Persistence service | `services/graph.service.ts` (367 lines) | `saveGraph`, `fetchGraph`, `fetchFunctionContext`, `listRepositories`, `verifyConnection` | driver, types | 🟡 | `neo4j.roundtrip.test.ts`; live evidence in the build log | Full detail in A.3 — label allow-listing and per-repository delete are ✅; performance and identity scoping are 🟡 |
| Controller logic | `controllers/repository.controller.ts:51-134` | Validate → extract → `analyzeAndStore` → build `categoryCounts` (lines 104-111) → 201 → cleanup in `finally` (128-133) | services | ✅ | `app.api.test.ts` asserts 201/400 and cleanup | Response-shaping business logic lives in the controller (E10); one synchronous request for the whole pipeline |

### A.3 Verified Neo4j behaviour (read directly from the Cypher)

| Fact | Source line | Consequence for the target design |
| --- | --- | --- |
| Labels are allow-listed: `ENTITY_LABELS` covers Repository, Directory, File, Class, Function, Method, Variable; anything else falls back to `:Entity` | `graph.service.ts:19-40` | Good injection hygiene. Adding a `Route` entity requires editing this map **and** the type union |
| Relationship types allow-listed: CONTAINS, IMPORTS, CALLS, EXTENDS; fallback `RELATIONSHIP` | `29-46` | Same for new relationship types (`EXPOSES`, `AFFECTS`…) |
| Write starts with `MATCH (n:Entity {repository:$repository}) DETACH DELETE n` | `63-69` | Re-analysis is idempotent **per name**. Without an owner dimension, same-name uploads overwrite each other (E1) |
| Nodes are created one `session.run` per node with `CREATE` (not `MERGE`), properties: `id, type, name, filePath, startLine, endLine, category, inDefaultScope, sourceSnippet, repository` | `71-103` | ~N round trips; 461-node repository ⇒ 461 statements (E5) |
| Edges are created one `session.run` per edge, each doing two `MATCH` lookups by `{id, repository}` then `CREATE` with properties `line, filePath, resolution` | `105-127` | ~2·E index scans per edge; 1 148 edges ⇒ 2 296 node lookups with **no index on `id`** (E5) |
| **No `CREATE CONSTRAINT` / `CREATE INDEX` exists anywhere in `backend/src`** | verified by search across `backend/src` | Every `MATCH (n:Entity {repository:…})` and `{id:…}` is a full label scan. Also means duplicate `(repository,id)` pairs are possible — nothing enforces it |
| `fetchGraph` returns all `:Entity` nodes when no repository is supplied | `151-152` | `GET /api/graph` can expose every stored repository at once (E2) |
| `fetchGraph` re-attaches `sourceSnippet` to the returned node | `184-186` | Private source fragments leave the server unauthenticated (E3) |
| `fetchFunctionContext` returns the node plus `collect(caller)` / `collect(callee)` reduced to a `Set` of **names** | `286-316` | Two distinct callees with the same name collapse into one entry; summaries lose identity precision |
| `listRepositories` returns `DISTINCT r.name` from `:Repository` | `337-340` | Name-based identity again; cannot carry owner, timestamps or run history — a relational table is needed |
| Direction is always `(source)-[r]->(target)`; no inbound queries except `fetchFunctionContext`'s `(caller)-[:CALLS]->(n)` | `112`, `290-291` | Traversal-based change-impact (proposal Module 3) is not yet written, but the direction convention supports it |

### A.4 AI layer

| Component | Actual source | Responsibility | Status | Evidence | Limitations |
| --- | --- | --- | --- | --- | --- |
| LLM client | `services/analysis/llm.client.ts` (194 lines) | OpenAI-compatible `POST {base}/chat/completions`, `Authorization: Bearer <env key>`, `AbortController` timeout (`env.llm.timeoutMs`, default 60 000), error map 401→502, 403→502, 429→**503 retriable**, other→502, timeout→504, empty content→502; `reasoning_effort: "low"`; `parseJsonCompletion` strips markdown fences | ✅ | `analysis.services.test.ts:116` asserts the Bearer header; test at `:164-171` asserts 429→503 | **Reads only `choices[0].message.content`** — the response interface (`22-31`) has no `usage` field, so token counts and any provider-reported cost are **discarded** (E7). Credential is global `env.llm.key` (E8). No retry policy, no per-request timeout override, no provider abstraction interface |
| Metrics digest | `services/analysis/repo-digest.ts` | Pure measurement of `GraphData` (counts, relationship-type counts, category counts, fan-in/out leaders, largest files, busiest directories, import cycles), token-bounded | ✅ | `analysis.digest.test.ts` | Derived only from the stored graph; no file-level complexity, no test-execution or dependency data |
| Report service | `services/analysis/report.service.ts` (303 lines) | Strict-JSON prompt (`SYSTEM_PROMPT` 155-172, prompt version `v2` at 193) → `normalizeReport` → `AnalysisReport`; cache key `${repository}:${model}:${PROMPT_VERSION}:${graphSignature}` (225-226); in-flight dedupe (234-247); `invalidateReports(repository)` (288-303); caps: factors ≤6 (99), recommendations/strengths/risks/limitations ≤5 (109-121); score clamped 0-10, default 5 (61-71) | ✅ | `analysis.services.test.ts`; live Groq evidence in the build log (200 in ~4.6 s, cached re-read ~4 ms) | Cache is an **in-process `Map`** with no TTL/eviction and no user dimension (E9, E4); signature is **count-based** (`nodes:TYPE=count…`, 198-213) so equal-size different graphs share a signature |
| Function summary service | `services/analysis/function-summary.service.ts` | `fetchFunctionContext` → prompt lines `Calls:` / `Source:` (or "not captured — judge from the name and context", 102-108) → one sentence; cache key `${repository}:${model}:${PROMPT_VERSION}:${nodeId}` (75-76); `invalidateSummaries(repository)` | ✅ | `analysis.services.test.ts`; live 200 in ~2 s then cached 4 ms | Non-Function nodes rejected by design; snippet truncation means long functions are judged from their opening logic |
| Analysis controller | `controllers/analysis.controller.ts` (111 lines) | Param validation (400), `fetchGraph(repository)` → 404 when empty (41-46), call service, map `LlmError.status` to HTTP | ✅ | `analysis.api.test.ts` | `GET /analysis` **re-reads the whole graph from Neo4j on every call** just to compute a signature, then usually hits cache (E5/E9); no ownership check |

### A.5 Frontend

| Component | Actual source | Responsibility | Status | Limitations |
| --- | --- | --- | --- | --- |
| App shell | `frontend/src/App.tsx` | Owns graph, selected node, repository name, status, busy; header/tabs | ✅ | Single-user assumption baked in: no session, no project list, one active repository |
| API client | `frontend/src/api.ts` (171 lines) | `analyzeArchive`, `loadGraph`, `listRepositories`, `fetchAnalysisReport`, `fetchFunctionSummary` with a module-level `summaryCache` Map keyed `repository:nodeId` (130-141), cleared on each analysis (43) | ✅ | Browser-memory cache only; `AnalyzeResponse` (5-11) omits `categoryCounts` that the backend sends (drift, E14) |
| Graph view | `components/GraphView.tsx`, `graphLayout.ts`, `nodeStyles.ts` | D3 force simulation, zoom/pan/drag/select, neighbour highlight, label thinning above 80 nodes, persisted viewport, one-time auto-fit | ✅ | No clustering/level-of-detail for very large graphs |
| Filters | `graphFilters.ts`, `components/FilterPanel.tsx` | Reversible scope/type/relationship/directory/focus filtering returning new graphs | ✅ | Client-side only |
| Search | `search.ts`, `components/SearchPanel.tsx` | Client-side entity search, navigate, reveal-hidden | 🟡 | Not graph-aware server search (proposal Module 4 partially unmet) |
| Execution flows | `executionFlows.ts`, `components/ExecutionFlowsView.tsx` | Derives flows **from `CALLS` edges in the browser**, animated Play/Pause | 🟡 | Not server-identified "important" flows; no entry-point seeding; no ranking |
| Analysis report | `components/AnalysisReportView.tsx` | Renders the six AI sections, severity chips, regenerate, verbatim backend error | ✅ | — |
| Architectural icons | `archRoles.ts`, overlay in `GraphView` | Deterministic role classification for an optional visual overlay | 🟡 | Explicitly experimental; presentation-only |
| Details panel | `components/DetailsPanel.tsx` | Node stats, incoming/outgoing clickable relationships, Function `Core purpose` section below the stats | ✅ | — |

### A.6 Everything the meeting requirements assume but the code does not have

Verified absent by source inspection (not by assumption):

| Capability | Verification |
| --- | --- |
| Authentication / authorization | No auth middleware, no `authorization`/`cookie` reference anywhere in `backend/src` (searched) |
| Users, projects, ownership | No such type, table, service or route exists |
| Relational database | No PostgreSQL/MySQL/ORM dependency in `backend/package.json` |
| Subscriptions, plans, entitlements | Nothing in source |
| Payment provider or webhook | Nothing in source; no provider named in the meeting requirements |
| Usage metering / cost records | Provider `usage` object is not even parsed (`llm.client.ts:22-31`) |
| Per-user API credentials | Single global `env.llm.key` (`env.ts:35`) |
| Storage quota or retention | Upload and extraction folders are **deleted after the response** (`repository.controller.ts:126-133`); nothing is retained to measure |
| Administrator interface | `frontend/src` contains one application and no role concept |
| Audit logging | Only `console.log/warn/error`; no audit sink |
| Background jobs / queue | Analysis is synchronous inside the request |
| CI / app containers | No workflow file and no Dockerfile in the repository (searched); `docker-compose.yml` defines **only** `neo4j:5` with `NEO4J_AUTH=neo4j/codeatlas123` |
| Implementation-plan generation | Not present |
| Change-impact, vulnerability, export modules | Not present (confirmed in the master alignment doc, W1/W2, M6) |

---

## Section B — Confirmed Product Requirements (meeting), with stable ids

Requirement ids are stable for the diagrams. "Status" is **implementation** status — every
🆕 row is an intended behaviour, not a claim about the code.

### B.1 User application

| ID | Requirement | Status | Depends on | Data required | Acceptance criteria |
| --- | --- | --- | --- | --- | --- |
| **UR-01** | Sign up, log in, log out | 🆕 | ❓ D-01 auth mechanism/provider | Identity store; password hash or provider subject id; session or refresh-token store | Account created with no plaintext password; session ends on logout; every private endpoint rejects an unauthenticated request |
| **UR-02** | Profile view/update; onboarding only when needed | 🆕 | UR-01 | User + profile fields; onboarding-completed flag | A returning user with a completed profile is never forced through onboarding again; unsupported fields cannot be written from the client |
| **UR-03** | Repository management (submit, list, status, history, re-analyse, delete, quota-aware) | 🆕 (analysis itself ✅) | UR-01, **D-03 repository identity**, ❓ D-05 retention, ❓ D-04 async jobs | Repository + AnalysisRun records owned by a user; status field | Repository is visibly owned; status transitions are observable; re-analysis does not disturb other repositories; deletion frees the recorded storage |
| **UR-04** | Repository logs / short reports per run | 🆕 | UR-03 | AnalysisRun metadata (status, timing, node/edge counts, model) + generated reports | Each row shows name, date/time, status, summary, graph size, duration where measured; **no duplicated copy** of the same fact across audit, history, AI-report and work-log stores (see B.3 note) |
| **UR-05** | Implementation plan generated as Markdown and downloadable | 🆕 | UR-03, ❓ D-06 relationship to proposal Module 3 | Plan record; the selected change/feature text; graph context | Plan contains objective, relevant files/components, steps, dependencies and affected components, testing needs, risks/assumptions/limitations, acceptance criteria; download yields `implementation-plan.md`; the UI never presents it as a code change |
| **UR-06** | Free and paid plans with configurable entitlements | 🆕 | UR-01, ❓ D-07 plan rules and prices, D-08 payment | Plan + entitlement/limit configuration; subscription state | Limits enforced **server-side** (not by hiding controls); changing a limit does not touch the analysis pipeline; no hardcoded `$12` or invented quota appears in code or docs |
| **UR-07** | Storage allowance and enforcement | 🆕 | UR-06, D-05 retention, ❓ D-09 storage location | Per-user usage accounting derived from retained artifacts | Request validated **before** accepting a repository; over-quota rejected with a clear reason; deletion reclaims usage; plan change re-evaluates allowance; one user cannot read another's artifacts |
| **UR-08** | User-supplied API key with secure configuration | 🆕 | UR-01, **E8** (client must accept per-request credentials) | Credential store with encrypted material; provider id; key metadata | Key set/replaced/revoked through a protected endpoint; never returned to the client, never in logs, browser storage, reports or ordinary profile fields; provider calls for that user use that user's key with no cross-user leakage |
| **UR-09** | API usage and cost visibility | 🆕 | UR-08, **E7** (must capture provider `usage`), ❓ D-10 pricing source | Per-user usage events; estimated-vs-actual cost flag; currency and pricing-version | Usage recorded with user, repository/run, provider, model, feature, token counts **when the provider returns them**, status, retries; cost labelled *estimated* unless provider billing confirms it; BYOK spend is attributed to the provider's bill for that user, never counted as CodeAtlas revenue or CodeAtlas cost |

### B.2 Administrator application

| ID | Requirement | Status | Depends on | Data required | Acceptance criteria |
| --- | --- | --- | --- | --- | --- |
| **AR-01** | A genuinely separate administrator interface | 🆕 | UR-01, ❓ D-11 admin app form | Admin role assertion server-side | Separate client (or fully isolated admin surface) that talks only through authorized APIs; server enforces the role on every admin route; a hidden URL grants nothing |
| **AR-02** | User and profile management (view, search, status, plan, aggregated usage, approved actions) | 🆕 | AR-01, UR-01 | Read projections over identity + subscription + usage | Defined admin-visible field list; passwords, tokens, API-key material and repository source content are **not** readable |
| **AR-03** | Privacy boundary and privileged-access control | 🆕 | AR-01 | Audit records for privileged reads/actions | Least privilege and data minimisation; access to private repository content is a separate, explicitly authorized, audited capability, off by default |
| **AR-04** | Interactive business analytics dashboard | 🆕 | UR-03, UR-06, UR-09 | Derived from transactional + usage data; cache/aggregation only if justified | Every metric states source, formula, period, aggregation level and limitations; measured vs calculated vs estimated vs unavailable are visibly distinguished; filters for date range, plan, feature, provider/model, status |
| **AR-05** | Plan and subscription analytics (active, upgrades, cancellations, payment success/failure, revenue by plan) | 🆕 | UR-06, D-08 payment | Subscription + payment state history | States derived from verified payment events only; pending/failed/cancelled never grant paid access |
| **AR-06** | Cost, revenue and profitability reporting | 🆕 | UR-09, ❓ D-12 other cost sources | Provider-billed cost where available; estimated AI cost; infrastructure cost only if a real source exists | Never computed as revenue-minus-nothing; platform-paid vs user-BYOK usage separated; untracked costs reported as **unavailable**, not as zero |

### B.3 Note that shapes the data model

The brief asks for four different kinds of record and warns against duplicating them.
This is how they must stay separate:

| Kind | What it answers | Home | Must **not** contain |
| --- | --- | --- | --- |
| Application audit event | "who did what to what, when" — security/operations | `audit_events` | Repository content, AI prose |
| Repository analysis history | "what happened to this repository" — user-facing | `analysis_runs` | Security decisions, secrets |
| AI-generated report | "what did the model conclude" — content | `analysis_reports` (and `implementation_plans`) | Usage billing counts |
| User-visible work log | UI roll-up of history + reports | **derived view**, not a table | Its own copy of facts |

---

## Section I — Evidence and Traceability Matrix

Implemented components (source evidence) and proposed components (requirement or decision
evidence). Nothing appears in this matrix that is not listed in one of the two halves.

### I.1 Implemented → source evidence

| # | Component | Source of truth | Verified by |
| --- | --- | --- | --- |
| 1 | ZIP upload endpoint | `routes/repository.routes.ts:32-36` | `app.api.test.ts` (201 + cleanup) |
| 2 | Non-ZIP rejection | `repository.controller.ts:70-80`, `utils/file.utils.ts::isZipArchive` | `app.api.test.ts` (mislabeled ZIP, `.rar`) |
| 3 | Zip-slip protection | `ingestion.service.ts:79-105` + `isPathInside` | archive-validation tests |
| 4 | Source scanning + ignore rules | `repository.service.ts`, `ignore.utils.ts` | `analysis.pipeline.test.ts` |
| 5 | Babel parsing by extension | `ast.parser.ts` | pipeline fixtures incl. `unsupported` |
| 6 | Entity extraction incl. const/arrow Functions and class-qualified Methods | `entity.extractor.ts:138-178` | fixtures `arrow-functions`, `duplicate-names` |
| 7 | Function `sourceSnippet` capture | `entity.extractor.ts:35-73` | snippet persisted + read back in round-trip |
| 8 | Import resolution | `module-resolver.ts` | `module-resolver.test.ts` |
| 9 | Call resolution via TS program | `symbol.resolver.ts` | fixture `calls` |
| 10 | Relationship extraction + provenance | `relationship.extractor.ts` | fixtures `imports`, `calls`, `inheritance` |
| 11 | Graph assembly/validation | `graph.builder.ts` | `graph.builder.test.ts` |
| 12 | Scope annotation | `scope.service.ts`, `classify.utils.ts` | `scope.service.test.ts`, `classify.utils.test.ts` |
| 13 | Neo4j write/read, label allow-list | `graph.service.ts:19-133`, `139-237` | `neo4j.roundtrip.test.ts` (gated) |
| 14 | Best-effort persistence | `services/parser.service.ts` (`persisted:false` path) | API test asserting the flag |
| 15 | REST surface (7 endpoints) | `repository.routes.ts`, `analysis.routes.ts` | `app.api.test.ts`, `analysis.api.test.ts` |
| 16 | Graph digest | `repo-digest.ts` | `analysis.digest.test.ts` |
| 17 | Report generation + normalization + caps | `report.service.ts:39-153` | `analysis.services.test.ts` |
| 18 | Report/summary caching + invalidation | `report.service.ts:193-248,288-303`; `function-summary.service.ts:75-76,140+`; `api.ts:43,130-141` | invalidation tests + live proof in build log |
| 19 | LLM client error mapping | `llm.client.ts:87-155` | 401/403/429/timeout tests |
| 20 | Interactive graph, filters, search, viewport, flows, report tabs | `frontend/src/**` (A.5) | 12 frontend test files / 78 tests |
| 21 | Neo4j container | `docker-compose.yml:1-14` | manual `docker compose up -d neo4j` |

### I.2 Proposed → requirement/decision evidence

| # | Proposed component (no code) | Requirement | Blocked by decision |
| --- | --- | --- | --- |
| 1 | Identity + session handling | UR-01 | D-01 |
| 2 | Profile + onboarding state | UR-02 | D-01 |
| 3 | Project/repository ownership registry | UR-03 | **D-03** (identity), D-01 |
| 4 | Analysis job + status store | UR-03, UR-04 | D-04 |
| 5 | Analysis history + report persistence | UR-04 | D-05 (retention) |
| 6 | Implementation-plan service + download | UR-05 | **D-06** (vs Module 3) |
| 7 | Entitlement/limits engine | UR-06, UR-07 | D-07 |
| 8 | Subscription + payment adapter | UR-06, AR-05 | D-08 |
| 9 | Storage accounting + quota guard | UR-07 | D-05, D-09 |
| 10 | Credential vault + per-request provider config | UR-08 | **E8 refactor**; D-01 |
| 11 | Usage meter + cost estimator | UR-09, AR-06 | **E7 refactor**; D-10 |
| 12 | Admin API surface + role guard | AR-01, AR-02 | D-11 |
| 13 | Privileged-access audit trail | AR-03 | D-11 |
| 14 | Analytics aggregation | AR-04, AR-05 | D-12 |
| 15 | Deployment topology | Diagram 10 | D-13 — **insufficient evidence today** |

➡️ Next: [`02-architecture-current-target.md`](./02-architecture-current-target.md)
