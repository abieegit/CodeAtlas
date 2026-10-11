# Build Log — Build 02 — prototype-test02

| Field | Value |
| --- | --- |
| Unique file name | `build-02-prototype-test02.md` |
| Build number | 02 |
| Build name | prototype-test02 |
| Status | Open |
| Date opened | 2026-10-11 |
| Date closed | — (open) |
| Author | Muhammad Abdullah (47618) |
| Scope | F1 hardening — automated test suite + relationship provenance + arrow-function coverage |

---

## 1. Build context — meeting goal & targets

**Goal:** harden the existing F1 prototype without changing its architecture — add an
automated test suite that locks in the parsing pipeline, and make graph edges auditable by
recording *how* each edge was discovered (provenance). Extend the parser so modern
`const`/arrow functions are represented in the graph.

**Targets set for this build:**

| # | Target | Result |
| --- | --- | --- |
| T1 | Add automated test infrastructure (Vitest + Supertest). | Met |
| T2 | Cover the parsing pipeline with fixture-driven tests (units + API). | Met |
| T3 | Unit-test graph assembly, validation and provenance preservation. | Met |
| T4 | Emit `const`/arrow function values as `Function` entities and CALLS callers. | Met |
| T5 | Record relationship provenance (resolution method, file, line). | Met |
| T6 | Persist + read relationship provenance back through Neo4j. | Met (verified live) |
| T7 | Export the Express app without starting the listener; keep `dist` free of tests. | Met |

**Out of scope (unchanged from Build 01):** guided project tour, change-impact analyzer,
contextual search, vulnerability analyzer, project-intelligence export, and the LLM/AI
layer. (See `../../proposal/CodeAtlas Project Proposal Final.docx`.)

---

## 2. Features delivered (current system)

> Build 01 features remain intact; this build adds the items below (marked **new**) and
> amends two existing ones (marked **amended**).

**Automated test suite (new)**
- Vitest + Supertest test harness (`vitest.config.ts`); `npm test` runs once, `npm run
  test:watch` watches.
- Fixture-driven integration tests over the real pipeline (`analysis.pipeline.test.ts`)
  using eight focused fixture repositories under `src/test-fixtures/`.
- Unit tests for graph assembly/validation/provenance (`graph.builder.test.ts`).
- API smoke tests with a mocked Neo4j layer (`app.smoke.test.ts`).
- 25 tests across 3 files — scan → parse → extract → assemble and the HTTP surface.

**Relationship provenance (new)**
- Every edge can now carry `{ filePath, line, resolution }`, where `resolution` is one of
  `derived` | `resolved` | `name-match`, so the graph states how an edge was found rather
  than presenting it as fact.
- `CONTAINS` → `derived`; `IMPORTS` and `CALLS` → `resolved`; `EXTENDS` → `name-match`.
- Provenance is written as relationship properties in Neo4j and read back by `fetchGraph`.

**Arrow / const functions (amended)**
- `const name = () => {}` and `const name = function () {}` are now emitted as `Function`
  entities (`entity.extractor`) and contained/attributed as CALLS callers
  (`relationship.extractor`), mirroring the declaration id scheme.

**Testability plumbing (new)**
- `server.ts` exports `app` and only binds the port when run directly
  (`require.main === module`), so Supertest can drive the app without a live listener.
- `tsconfig.build.json` excludes tests and fixtures, so `npm run build` produces a `dist`
  with no test artifacts; `tsconfig.json` still type-checks all of `src/`.
- Added `test`, `test:watch` and `typecheck` scripts.

**Preserved from Build 01:** ZIP ingestion (extension + magic-byte validation, zip-slip
protection), Babel/TS AST parsing, entity + relationship extraction, graph assembly,
Neo4j persistence (allow-listed labels, repository-scoped idempotent writes), the Express
REST API, and the React + D3 interactive graph.

---

## 3. Complete technology stack

**Languages & runtime**

| Item | Version |
| --- | --- |
| Node.js runtime | 18+ (documented minimum) |
| TypeScript (backend) | ^5.9.3 |
| TypeScript (frontend) | ^5.6.3 |

**Backend (`backend/`) — Express 5 + TypeScript**

| Package | Version | Purpose |
| --- | --- | --- |
| express | ^5.2.1 | HTTP server / REST API |
| cors | ^2.8.6 | Cross-origin requests |
| multer | ^2.4.0 | Multipart file upload (50 MB limit) |
| @babel/parser | ^7.29.9 | JS/TS AST parsing |
| @babel/traverse | ^7.29.8 | AST traversal for extraction |
| neo4j-driver | ^6.2.0 | Neo4j Bolt driver |
| unzipper | ^0.12.5 | ZIP extraction |
| dotenv | ^18.0.5 | Environment configuration |
| typescript | ^5.9.3 | TypeScript Compiler API + type-checking |
| ts-node-dev | ^2.0.0 | Dev server with respawn |
| **vitest (new)** | ^5.0.3 | Test runner |
| **supertest (new)** | ^7.3.1 | HTTP assertions against Express |
| **@types/supertest (new)** | ^7.2.1 | Supertest types |

Build/run scripts: `npm run dev` (ts-node-dev), `npm run build` (`tsc -p
tsconfig.build.json`), `npm start`, `npm run analyze` (demo on bundled `src/test-project`),
`npm run typecheck` (`tsc --noEmit`), `npm test` (Vitest), `npm run test:watch`.

**Frontend (`frontend/`) — Vite 5 + React 18**

| Package | Version | Purpose |
| --- | --- | --- |
| react / react-dom | ^18.3.1 | UI |
| d3 | ^7.9.0 | Force-directed graph + zoom/drag |
| vite | ^5.4.11 | Dev server + build |
| @vitejs/plugin-react | ^4.3.4 | React plugin |
| tailwindcss | ^3.4.17 | Styling |
| postcss / autoprefixer | ^8.4.49 / ^10.4.20 | CSS pipeline |
| typescript | ^5.6.3 | Types |

Dev server port 5173; `/api` proxied to the backend on `:5000`.

**Database & infrastructure**

| Item | Version / value |
| --- | --- |
| Neo4j | 5.x (Docker `neo4j:5`, or Aura) — live instance used for verification |
| Neo4j HTTP / Bolt ports | 7474 / 7687 |
| Docker Compose | `neo4j` service, auth `neo4j/codeatlas123`, named volume `neo4j-data` |
| Backend port | 5000 (`PORT`) |
| Frontend port | 5173 |

**Configuration (`backend/.env`):** `NEO4J_URI` (use `127.0.0.1`, not `localhost`),
`NEO4J_USERNAME`, `NEO4J_PASSWORD`, `NEO4J_DATABASE`, `PORT`.

---

## 4. Flow of execution (current system)

**Analyze an uploaded repository** (unchanged from Build 01)

1. User selects a `.zip` in `UploadPanel` and clicks **Analyze repository**.
2. `api.analyzeArchive()` POSTs the file as multipart field `file` to
   `/api/repositories/analyze`.
3. The Vite dev server proxies `/api/*` to the backend on port 5000.
4. Express (`server.ts`) → `repository.routes.ts`; Multer streams the upload into
   `backend/uploads/`.
5. `repository.controller.ts` validates the upload (`.zip` extension **and** "PK" magic
   bytes) and rejects non-ZIP with HTTP 400.
6. `ingestion.service.extractZip()` extracts to `backend/extracted/<name>-<timestamp>/`
   (zip-slip entries skipped) and resolves the repository root.
7. `parser.service.analyzeAndStore()` runs the pipeline:
   a. `analysis.service.analyzeRepository()`:
      - `repository.service.findSourceFiles()` lists `.ts/.tsx/.js/.jsx`;
      - per file: `ast.parser.parseFile()` (Babel) → `entity.extractor.extractEntities()`
        (File/Class/Function/Method, including arrow/const functions);
      - `symbol.resolver.createSymbolResolver()` builds the TypeScript program;
      - per file: `relationship.extractor.extractRelationships()`
        (`CONTAINS`, `IMPORTS` via `module-resolver`, `EXTENDS`, `CALLS` via the resolver),
        each edge tagged with provenance;
      - `graph.builder.buildGraph()` adds Repository/Directory nodes, deduplicates and
        drops dangling/duplicate/self edges.
   b. `graph.service.saveGraph()` writes to Neo4j (scoped delete, then nodes and edges with
      their provenance); if Neo4j is unreachable this is caught and `persisted = false`.
8. Controller responds **201** with `{ repository, persisted, nodeCount,
   relationshipCount, graph }` and deletes the temporary upload file.
9. `App.tsx` stores the graph and shows the status line; `GraphView` runs the force
   simulation and renders the interactive graph; clicking a node populates `DetailsPanel`.

**Reload a stored graph** — `Load stored graph` → `api.loadGraph()` → `GET /api/graph` →
`controller.getGraph()` → `graph.service.fetchGraph()` → Neo4j (provenance included) → the
graph is re-rendered.

**Health check** — `GET /api/health` → `verifyConnection()` → `{ status, neo4j }`.

**Run the tests** — `cd backend && npm test` → Vitest loads `src/**/*.test.ts`, runs the
smoke, pipeline and graph-builder suites, and reports pass/fail. `npm run typecheck` and
`npm run build` are the other gates.

---

## 5. Data model summary

**Node types:** Repository, Directory, File, Class, Function, Method
(Variable reserved, not emitted by the extractor).

**Relationship types:** `CONTAINS`, `IMPORTS`, `CALLS`, `EXTENDS`.

**Relationship provenance (new):** each edge may carry
`evidence = { filePath?, line?, resolution }`, where `resolution ∈ { derived, resolved,
name-match }`:

| Relationship | Resolution | Meaning |
| --- | --- | --- |
| `CONTAINS` (repository/dir) | `derived` | computed from file paths |
| `CONTAINS` (file→class/function, class→method) | `derived` | structural ownership in the AST |
| `IMPORTS` | `resolved` | relative path resolved to a local file |
| `CALLS` | `resolved` | target resolved via the TypeScript symbol resolver |
| `EXTENDS` | `name-match` | superclass matched by name |

**Node identity (repository-relative, unique within one repository):**

```
repository:<name>
directory:<relativePath>
file:<relativePath>
class:<relativePath>:<ClassName>
function:<relativePath>:<Name>
method:<relativePath>:<ClassName>:<Name>
```

Each node carries `id, type, name, filePath, startLine, endLine`. In Neo4j every node is
`:Entity:<Type>` plus a `repository` scoping property; relationships carry the provenance
properties (`line`, `filePath`, `resolution`). Physical filesystem paths are never exposed.

---

## 6. REST API surface

| Method | Path | Description |
| --- | --- | --- |
| GET | `/api/health` | Service + Neo4j status |
| POST | `/api/repositories/analyze` | multipart `file` = repository ZIP → graph |
| GET | `/api/graph` | Stored graph `{ nodes, relationships }` |
| GET | `/api/graph?repository=<name>` | Stored graph for one repository |
| GET | `/api/repositories` | Names of repositories with a stored graph |

Relationships in the `graph` payload may now include an `evidence` object; the payload
shape is otherwise unchanged, so the frontend needs no changes.

---

## 7. Verification / evidence

- **Automated tests:** `npm test` → **3 files, 25 tests, all passing**.
  - `app.smoke.test.ts` (3) — JSON 404, health via a mocked Neo4j check, repository
    listing.
  - `analysis.pipeline.test.ts` (17) — the real pipeline over the eight fixtures:
    `imports` (resolved IMPORTS + cross-file CALLS), `calls`, `inheritance`
    (name-match EXTENDS), `arrow-functions` (Function entities + CONTAINS), `duplicate-names`
    (same-named functions/methods stay distinct; calls resolve to the same-file namesake),
    `unresolved` (unresolvable edges omitted), `unsupported` (an unparsable file is skipped),
    and `empty` (repository-only graph).
  - `graph.builder.test.ts` (5) — Repository/Directory derivation, derived CONTAINS
    evidence, node de-duplication, dangling/self-loop/duplicate edge removal, and
    preservation of incoming evidence.
- **Type-check:** `npm run typecheck` (`tsc --noEmit`) — clean.
- **Build:** `npm run build` — clean; `dist/` contains 25 JS files and **no** `__tests__`
  or `test-fixtures` output.
- **Demo pipeline:** `npm run analyze` still runs on the bundled `src/test-project`.
- **Provenance verified live against Neo4j** (fixture `inheritance`, repository
  `build02-probe`): analyze → `saveGraph` → `fetchGraph` returned **7 nodes / 8
  relationships**, and **all 8 relationships carried evidence**, e.g.
  `IMPORTS file:dog.ts -> file:base.ts [resolved @ dog.ts:1]` and
  `EXTENDS class:dog.ts:Dog -> class:base.ts:Animal [name-match @ dog.ts:3]`. The probe
  repository was removed afterwards and the pre-existing repositories (`ky-mini`,
  `tripbuddyzip`) were left untouched, confirming repository-scoped cleanup.

---

## 8. Known limitations / deferred

- Arrow/`const` functions are emitted as entities and *callers*, but they are not yet valid
  `CALLS` **targets**: `symbol.resolver.getCodeAtlasId` maps only `FunctionDeclaration` and
  `MethodDeclaration` declarations, so a call into a `const`-arrow function is omitted.
- A `derived` edge produced by `graph.builder` (Repository/Directory containment) carries a
  resolution but no `filePath`/`line`, because it is computed from paths rather than a
  source location.
- No unit test exercises `graph.service` without a live Neo4j instance (provenance
  round-trip is verified by the live probe above, not by the automated suite).
- No coverage reporting or CI pipeline yet; tests are run manually.
- Input: ZIP only (no RAR/7z, no Git URL yet).
- Languages: JavaScript/TypeScript only.
- Symbol resolution is best-effort: dynamic imports, re-exports, aliases, ambiguous names
  and external packages may be omitted.
- Calls inside object-literal methods are not attributed to a named caller.
- No authentication, no multi-user isolation (repository scoping only).
- Full re-analysis each time (no incremental update).
- Neo4j persistence is sequential and not wrapped in a transaction.
- Large graphs may need level-of-detail / clustering for readability.

---

## 9. Next build targets

- Extend the symbol resolver to map variable/arrow function declarations to CodeAtlas ids,
  so `CALLS` edges *into* `const`-arrow functions resolve (closes the new gap above); add
  fixtures/tests for those cases.
- Add CI (e.g. GitHub Actions) running `test`, `typecheck` and `build` on every push.
- Add coverage reporting and thresholds to the Vitest config.
- Begin Module 2 scope from the proposal: **Guided Project Tour** and/or foundational
  **Contextual Navigation & Search** over the existing graph.
- Add incremental re-analysis groundwork (only re-parse changed files).
- Prepare for the PostgreSQL/auth layer described in the proposal.

---

## Related documentation (kept consistent with this build)

- Build-log standard & index: [`./README.md`](./README.md)
- System diagrams: [`../diagrams/`](../diagrams/README.md)
- F1 system guide: [`../../CodeAtlas_F1_System_Guide.txt`](../../CodeAtlas_F1_System_Guide.txt)
- Project proposal: [`../../proposal/CodeAtlas Project Proposal Final.docx`](../../proposal/CodeAtlas%20Project%20Proposal%20Final.docx)

---

## Sign-off

| | |
| --- | --- |
| Build opened by | Muhammad Abdullah |
| Date opened | 2026-10-11 |
| Status | Open — closes when Build 03 begins |
