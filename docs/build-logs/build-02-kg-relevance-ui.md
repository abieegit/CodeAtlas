# Build Log — Build 02 — kg-relevance-ui

| Field | Value |
| --- | --- |
| Unique file name | `build-02-kg-relevance-ui.md` |
| Build number | 02 |
| Build name | kg-relevance-ui |
| Status | Closed |
| Date opened | 2026-10-11 |
| Date closed | 2026-10-13 |
| Author | Muhammad Abdullah (47618) |
| Scope | F1 — knowledge-graph fundamentals, relevance-based scope, monochrome visual identity, execution-flows view, tests |

---

## 1. Build context — meeting goal & targets

**Goal (supervisor priority):** make the first feature genuinely aligned with knowledge-graph
fundamentals — not merely connected circles. Improve the existing Build 01 implementation
incrementally (no rebuild, stack unchanged), add relevance-based scope and a distinctive dark
interface, and back the behaviour with controlled tests.

**Targets set for this build:**

| # | Target | Result |
| --- | --- | --- |
| T1 | Test infrastructure for backend and frontend (Vitest). | Met |
| T2 | Record relationship provenance (resolution method, file, line). | Met |
| T3 | Emit `const`/arrow functions as entities and as CALLS callers **and** targets. | Met |
| T4 | Document node identity and relationship semantics. | Met |
| T5 | Repository-scoped reload (analyzed graph == reloaded graph). | Met |
| T6 | Relevance classification + default scope (persisted properties). | Met |
| T7 | Dark technical interface with reversible filters. | Met |
| T8 | Extraction-directory hygiene (cleanup + startup purge, opt-out). | Met |
| T9 | Controlled tests: pipeline, resolver, scope, API, UI. | Met |
| T10 | Keep build log, README, graph-model and diagrams consistent. | Met |

**Out of scope (unchanged):** guided tour, change-impact analysis, contextual search as a
feature, vulnerability analysis, AI/LLM/RAG, auth/billing. Six node types and four relationship
types preserved; API paths and response shape preserved (extended only).

---

## 2. Features delivered (current system)

**Knowledge-graph fundamentals**
- Relationship **provenance**: every edge may carry `evidence = { filePath, line, resolution }`,
  `resolution ∈ { derived, resolved, name-match }`; persisted as Neo4j relationship properties
  and rebuilt by `fetchGraph`. `CONTAINS`→`derived`, `IMPORTS`/`CALLS`→`resolved`,
  `EXTENDS`→`name-match`.
- **Arrow / `const` functions** (`const x = () => {}` / `function () {}`) are emitted as
  `Function` entities, recognised as CALLS **callers**, and — new in this build — resolved as
  CALLS **targets** via the TypeScript symbol resolver.
- **Repository isolation**: the frontend reload now passes the analysed repository
  (`GET /api/graph?repository=<name>`), so the reloaded graph equals the analysed one.
- **Documented semantics** in [`docs/graph-model.md`](../../graph-model.md) (identity, direction,
  discovery, evidence, validation, limitations).

**Relevance-based scope**
- `utils/classify.utils.ts` classifies each file as `source | test | config | fixture | generated
  | declaration` using combined path **and** filename signals (not folder names alone).
- `services/scope.service.ts` annotates the graph: `category` on File nodes and `inDefaultScope`
  on every node. A file is in scope when it is `source` **or** reachable (directly/transitively)
  via `IMPORTS` from a source file — so a relevant module outside the main source directory is
  kept. Directories are in scope when they contain an in-scope file.
- These are **properties**, not deletions: Neo4j and the API always return every file.

**Monochrome interface + reversible filters**
- Near-black background, neutral panels, thin borders, 3–6 px radii, a white accent, and per-type
  node colours; a subtle glow on the selected node only.
- `graphFilters.ts` (pure) + `FilterPanel.tsx`: scope (Application ↔ Full), node type, relationship
  type, directory, and focus-selected-plus-neighbours. All reversible; nothing is deleted.

**Execution-flows view**
- `executionFlows.ts` (pure `deriveExecutionFlows`) derives call-based execution paths from the
  graph: entry points are functions/methods called by nothing, following `CALLS` edges to a leaf
  (depth ≤ 8, cycle-safe, capped at 80 flows; branches become separate flows).
- `ExecutionFlowsView.tsx` renders each flow as an animated left-to-right pipeline (steps pulse,
  connectors animate, with Play/Pause), reached from an **Execution Flows** header tab beside the
  Knowledge Graph. Purely client-side — it reads the already-loaded graph, no extra request.

**Reliability & hygiene**
- Automated test suite: backend (8 files / 48 tests) and frontend (5 files / 18 tests).
- `GET /api/repositories/analyze` now returns `categoryCounts` alongside the graph.
- Extraction directories are cleaned up per request (`finally`) and purged at startup, unless
  `KEEP_EXTRACTED=true`.

**Preserved from Build 01:** ZIP ingestion (extension + magic-byte validation, zip-slip
protection), Babel/TS AST parsing, entity + relationship extraction, graph validation, Neo4j
persistence (allow-listed labels, repository-scoped idempotent writes), the REST API, and the
React + D3 interactive graph with all interactions.

---

## 3. Complete technology stack

**Languages & runtime**

| Item | Version |
| --- | --- |
| Node.js runtime | 18+ |
| TypeScript (backend) | ^5.9.3 |
| TypeScript (frontend) | ^5.6.3 |

**Backend (`backend/`) — Express 5 + TypeScript**

| Package | Version | Purpose |
| --- | --- | --- |
| express | ^5.2.1 | HTTP server / REST API |
| cors | ^2.8.6 | Cross-origin requests |
| multer | ^2.4.0 | Multipart upload (50 MB) |
| @babel/parser | ^7.29.9 | JS/TS AST parsing |
| @babel/traverse | ^7.29.8 | AST traversal |
| neo4j-driver | ^6.2.0 | Neo4j Bolt driver |
| unzipper | ^0.12.5 | ZIP extraction |
| dotenv | ^18.0.5 | Environment configuration |
| typescript | ^5.9.3 | Compiler API + type-checking |
| ts-node-dev | ^2.0.0 | Dev server |
| vitest | ^5.0.3 | Test runner |
| supertest | ^7.3.1 | HTTP assertions |

Scripts: `dev`, `build` (`tsc -p tsconfig.build.json`), `start`, `analyze`, `typecheck`
(`tsc --noEmit`), `test` (Vitest), `test:watch`.

**Frontend (`frontend/`) — Vite 5 + React 18**

| Package | Version | Purpose |
| --- | --- | --- |
| react / react-dom | ^18.3.1 | UI |
| d3 | ^7.9.0 | Force-directed graph + zoom/drag |
| vite | ^5.4.11 | Dev server + build |
| @vitejs/plugin-react | ^4.3.4 | React plugin |
| tailwindcss | ^3.4.17 | Styling (dark theme tokens) |
| postcss / autoprefixer | ^8.4.49 / ^10.4.20 | CSS pipeline |
| typescript | ^5.6.3 | Types |
| vitest | ^2.1.9 | Test runner |
| jsdom | ^28.1.0 | DOM environment |
| @testing-library/react | ^16.3.3 | Component tests |
| @testing-library/jest-dom | ^7.0.1 | DOM matchers |
| @testing-library/user-event | ^14.6.7 | User interaction |

Scripts: `dev`, `build` (`tsc && vite build`), `preview`, `test`, `test:watch`.
Dev server port 5173; `/api` proxied to `:5000`.

**Database & infrastructure**

| Item | Version / value |
| --- | --- |
| Neo4j | 5.x (Docker `neo4j:5`, or Aura) |
| Neo4j HTTP / Bolt ports | 7474 / 7687 |
| Docker Compose | `neo4j` service, auth `neo4j/codeatlas123`, volume `neo4j-data` |

**Configuration (`backend/.env`):** `NEO4J_URI` (use `127.0.0.1`), `NEO4J_USERNAME`,
`NEO4J_PASSWORD`, `NEO4J_DATABASE`, `PORT`, and (new) `KEEP_EXTRACTED`.

---

## 4. Flow of execution (current system)

**Analyze an uploaded repository**

1. `UploadPanel` → **Analyze repository** → `api.analyzeArchive()` POSTs multipart `file` to
   `/api/repositories/analyze` (proxied to `:5000`).
2. Multer streams into `uploads/`; `isZipArchive` checks the "PK" magic bytes → 400 if not a ZIP.
3. `ingestion.extractZip()` extracts (zip-slip-safe) into `extracted/<name>-<timestamp>/`.
4. `parser.service.analyzeAndStore()` → `analysis.service.analyzeRepository()`:
   scan → parse (Babel) → extract entities (incl. arrow/const functions) → build the TS program →
   extract relationships (**with evidence**) → `buildGraph` (validate/dedupe) →
   **`annotateScope`** (category + inDefaultScope).
5. `graph.service.saveGraph()` writes nodes (with `category`/`inDefaultScope`) and edges (with
   provenance) to Neo4j, scoped to the repository; best-effort (`persisted:false` if down).
6. Response **201** `{ repository, persisted, nodeCount, relationshipCount, categoryCounts, graph }`;
   the temp upload and the extraction directory are removed (`KEEP_EXTRACTED` opts out).

**Reload** — **Load stored graph** → `api.loadGraph(repository)` →
`GET /api/graph?repository=<name>` → `fetchGraph` → the same graph (with evidence/scope) renders.

**Frontend rendering** — `App` computes `filterGraph(graph, filters)` (`useMemo`) and passes the
filtered result to the D3 `GraphView`; `FilterPanel` changes scope/node-type/relationship-type/
directory/focus reversibly. `DetailsPanel` shows type, category, file, line range and each
in/out relationship with its evidence. A header tab switches between the **Knowledge Graph** and
the **Execution Flows** view; the latter derives call pipelines client-side
(`deriveExecutionFlows`) from the already-loaded graph (no extra request).

**Tests** — `cd backend && npm test` (Vitest; the Neo4j round-trip test runs live or skips);
`cd frontend && npm test` (Vitest + jsdom + Testing Library).

---

## 5. Data model summary

**Node types:** Repository, Directory, File, Class, Function, Method (Variable reserved).

**Node properties:** `id, type, name, filePath, startLine, endLine`, plus `category?`
(File nodes) and `inDefaultScope?` (all nodes).

**Relationship types:** `CONTAINS`, `IMPORTS`, `CALLS`, `EXTENDS`, plus optional
`evidence = { filePath?, line?, resolution }`.

**Identity (repository-relative, unique within one repository):**

```
repository:<name>            directory:<relativePath>       file:<relativePath>
class:<path>:<ClassName>     function:<path>:<Name>         method:<path>:<ClassName>:<Name>
```

**Categories:** `source | test | config | fixture | generated | declaration`.

**In Neo4j:** every node is `:Entity:<Type>` with a `repository` scoping property; relationships
carry `line`, `filePath`, `resolution`. Physical filesystem paths are never exposed.

---

## 6. REST API surface

| Method | Path | Description |
| --- | --- | --- |
| GET | `/api/health` | Service + Neo4j status |
| POST | `/api/repositories/analyze` | multipart `file` → graph (+ `categoryCounts`) |
| GET | `/api/graph` | Stored graph `{ nodes, relationships }` |
| GET | `/api/graph?repository=<name>` | Stored graph for one repository |
| GET | `/api/repositories` | Names of repositories with a stored graph |

Relationships may include `evidence`; **File nodes may include `category` and `inDefaultScope`**.
The shape is otherwise unchanged, so existing consumers keep working.

---

## 7. Verification / evidence

- **Backend tests:** `npm test` → **8 files / 48 tests, all passing** — smoke, archive validation
  (valid ZIP accepted; mislabeled ZIP and `.rar` rejected), pipeline over 10 fixtures (imports,
  calls, inheritance, duplicate-names, unresolved, unsupported, empty, arrow-functions, relevance),
  module-resolver, classify, scope, graph-builder, and a **gated live Neo4j round-trip**.
- **Frontend tests:** `npm test` → **5 files / 18 tests, all passing** — `filterGraph` (scope,
  node type, relationship type, directory, focus, plus a 5 000-node graph), `deriveExecutionFlows`
  (call chain, branching, cycle termination, no callables), `DetailsPanel` (evidence shown; click
  selects), `UploadPanel` (file → analyze), `FilterPanel` (toggles).
- **Type-check:** `npm run typecheck` (backend) and `tsc -p tsconfig.json --noEmit` (frontend) —
  clean. **Build:** `npm run build` on both — clean; `dist/` excludes tests/fixtures.
- **Live Neo4j round-trip:** analysing the `inheritance` fixture and reading it back returned the
  same node/relationship counts with **all relationships carrying evidence**, and `category` /
  `inDefaultScope` present on nodes; repository-scoped cleanup left other repositories untouched.
- **Real repository end-to-end (HTTP):** `axios` (170 files, good structure) uploaded via
  `POST /api/repositories/analyze` → **576 nodes / 1 028 relationships**, `persisted: true`,
  categories `{ source 89, test 78, config 2, declaration 1 }`, **all 1 028 relationships carry
  evidence** (`resolved` 451, `derived` 575, `name-match` 2), 90/170 files in default scope.
  `GET /api/graph?repository=axios` read back the identical 576/1 028 with evidence and scope
  intact (same node set), and `GET /api/repositories` returned only the expected repositories.
  (TripBuddy itself was unavailable; axios stands in as the real-repo check for criterion 11.)

---

## 8. Known limitations / deferred

- Calls **into** `const`/arrow functions now resolve, but calls inside **object-literal methods**
  are still not attributed to a named caller.
- `EXTENDS` is name-based (same file first); a same-named class elsewhere could be selected.
- Two same-named declarations of the same kind in **one** file still share an id (accepted to keep
  ids stable).
- `derived` Repository/Directory `CONTAINS` edges carry a resolution but no `filePath`/`line`.
- Classification is heuristic (path + filename signals); unusual layouts may be mis-categorised
  (visible via the Application ↔ Full toggle).
- No coverage thresholds or CI pipeline yet; tests are run manually.
- Input ZIP only (no RAR/7z, no Git URL); JS/TS only; no auth/multi-user isolation; full
  re-analysis each run; Neo4j writes are sequential (not transactional).

---

## 9. Next build targets

- Add CI (GitHub Actions) running `test`, `typecheck` and `build` on both packages, plus coverage
  thresholds.
- Attribute calls inside object-literal methods; refine symbol resolution (aliases, re-exports).
- Deterministic **relevance scoring** (centrality / fan-in) for ranking, layered on the existing
  categories.
- Begin Module 2 scope: **Guided Project Tour** and/or **Contextual Navigation & Search**.
- Incremental re-analysis groundwork; PostgreSQL/auth layer per the proposal.

---

## Related documentation (kept consistent with this build)

- Build-log standard & index: [`./README.md`](./README.md)
- Graph model: [`../graph-model.md`](../graph-model.md)
- System diagrams: [`../diagrams/D1/`](../diagrams/D1/README.md)
- F1 system guide: [`../../CodeAtlas_F1_System_Guide.txt`](../../CodeAtlas_F1_System_Guide.txt)

---

## Sign-off

| | |
| --- | --- |
| Build closed by | Muhammad Abdullah |
| Date closed | 2026-10-13 |
| Next build | 03 (to be named at the next major update) |
