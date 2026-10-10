# Build Log — Build 01 — prototype-test01

| Field | Value |
| --- | --- |
| Unique file name | `build-01-prototype-test01.md` |
| Build number | 01 |
| Build name | prototype-test01 |
| Status | Closed |
| Date opened | 2026-10-09 |
| Date closed | 2026-10-09 |
| Author | Muhammad Abdullah (47618) |
| Scope | F1 — initial first-feature implementation (AST knowledge graph + interactive map) |

---

## 1. Build context — meeting goal & targets

**Goal (supervisor order):** implement the *first feature* of CodeAtlas end to end — turn a
JavaScript/TypeScript repository into an interactive knowledge graph — as a working,
demonstrable prototype rather than scaffolding.

**Targets set for this build:**

| # | Target | Result |
| --- | --- | --- |
| T1 | Ingest a repository (ZIP upload) safely. | Met |
| T2 | Parse JS/TS sources into an AST (Babel + TypeScript Compiler API). | Met |
| T3 | Extract entities (nodes) and relationships (edges). | Met |
| T4 | Assemble, validate and deduplicate the graph. | Met |
| T5 | Persist the graph to Neo4j (best-effort). | Met |
| T6 | Expose the graph through a REST API (Express). | Met |
| T7 | Render an interactive graph and node details in the browser. | Met |

**Out of scope for this build (proposal features deferred):** guided project tour,
change-impact analyzer, contextual search, vulnerability analyzer, project-intelligence
export, and the LLM/AI layer. (See `../../proposal/CodeAtlas Project Proposal Final.docx`.)

---

## 2. Features delivered (current system)

**Ingestion & analysis**
- ZIP upload (multipart `file`), extension and ZIP magic-byte ("PK") validation; non-ZIP
  archives rejected with a clear 400.
- Safe extraction with zip-slip protection; single top-level folder auto-detected as the
  repository root.
- Recursive source scan for `.ts`, `.tsx`, `.js`, `.jsx`, skipping ignored directories
  (`node_modules`, `.git`, `dist`, `build`, `coverage`, `.next`, `out`, `vendor`).
- Babel AST parsing with per-extension plugins; one unparsable file is skipped, never fatal.
- Entity extraction — `File`, `Class`, `Function`, `Method` (method ids class-qualified).
- Relationship extraction — `CONTAINS`, `IMPORTS` (local), `EXTENDS` (by name),
  `CALLS` (TypeScript symbol resolution).
- Graph assembly — adds `Repository` and `Directory` nodes, derives containment edges,
  deduplicates nodes/edges, drops dangling edges and self-loops.

**Persistence**
- Neo4j store with allow-listed labels/relationship types (no Cypher injection).
- Idempotent re-analysis: only the current repository's nodes are replaced.
- Read-back (`fetchGraph`), repository listing, and health connectivity check.
- Best-effort persistence: if Neo4j is down, the graph is still returned (`persisted: false`).

**API (Express)**
- `GET /api/health`, `POST /api/repositories/analyze`, `GET /api/graph[?repository=]`,
  `GET /api/repositories`.

**Frontend (React + D3)**
- Three-pane dashboard: controls, graph, details.
- ZIP picker + "Analyze repository" and "Load stored graph" actions with status line.
- Force-directed graph: zoom, pan, drag, click-to-select, background-click to deselect.
- Selection highlights the node and its direct neighbours.
- Details panel: type, file path, line range, and clickable incoming/outgoing relationships.
- Colour legend and node-type colours/radii; auto fit-to-view; label thinning above 80 nodes.

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

Build/run scripts: `npm run dev` (ts-node-dev), `npm run build` (tsc), `npm start`,
`npm run analyze` (demo on bundled `src/test-project`).

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
| Neo4j | 5.x (Docker `neo4j:5`, or Aura) |
| Neo4j HTTP / Bolt ports | 7474 / 7687 |
| Docker Compose | `neo4j` service, auth `neo4j/codeatlas123`, named volume `neo4j-data` |
| Backend port | 5000 (`PORT`) |
| Frontend port | 5173 |

**Configuration (`backend/.env`):** `NEO4J_URI` (use `127.0.0.1`, not `localhost`),
`NEO4J_USERNAME`, `NEO4J_PASSWORD`, `NEO4J_DATABASE`, `PORT`.

---

## 4. Flow of execution (current system)

**Analyze an uploaded repository**

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
      - per file: `ast.parser.parseFile()` (Babel) → `entity.extractor.extractEntities()`;
      - `symbol.resolver.createSymbolResolver()` builds the TypeScript program;
      - per file: `relationship.extractor.extractRelationships()`
        (`CONTAINS`, `IMPORTS` via `module-resolver`, `EXTENDS`, `CALLS` via the resolver);
      - `graph.builder.buildGraph()` adds Repository/Directory nodes, deduplicates and
        drops dangling/duplicate/self edges.
   b. `graph.service.saveGraph()` writes to Neo4j (scoped delete, then nodes and edges);
      if Neo4j is unreachable this is caught and `persisted = false`.
8. Controller responds **201** with `{ repository, persisted, nodeCount,
   relationshipCount, graph }` and deletes the temporary upload file.
9. `App.tsx` stores the graph and shows the status line; `GraphView` runs the force
   simulation and renders the interactive graph; clicking a node populates `DetailsPanel`.

**Reload a stored graph**

`Load stored graph` → `api.loadGraph()` → `GET /api/graph` →
`controller.getGraph()` → `graph.service.fetchGraph()` → Neo4j → the graph is re-rendered.

**Health check**

`GET /api/health` → `verifyConnection()` → `{ status, neo4j }`.

---

## 5. Data model summary

**Node types:** Repository, Directory, File, Class, Function, Method
(Variable reserved, not emitted by the extractor).

**Relationship types:** `CONTAINS`, `IMPORTS`, `CALLS`, `EXTENDS`.

**Node identity (repository-relative, unique within one repository):**

```
repository:<name>
directory:<relativePath>
file:<relativePath>
class:<relativePath>:<ClassName>
function:<relativePath>:<Name>
method:<relativePath>:<ClassName>:<Name>
```

Each node carries `id, type, name, filePath, startLine, endLine`; in Neo4j every node is
`:Entity:<Type>` plus a `repository` scoping property. Physical filesystem paths are never
exposed.

---

## 6. REST API surface

| Method | Path | Description |
| --- | --- | --- |
| GET | `/api/health` | Service + Neo4j status |
| POST | `/api/repositories/analyze` | multipart `file` = repository ZIP → graph |
| GET | `/api/graph` | Stored graph `{ nodes, relationships }` |
| GET | `/api/graph?repository=<name>` | Stored graph for one repository |
| GET | `/api/repositories` | Names of repositories with a stored graph |

---

## 7. Verification / evidence

- Backend type-checks clean (`npx tsc --noEmit`).
- A real repository (`sindresorhus/ky`) analyzed end-to-end through the HTTP API:
  - full repo (87 files): **148 nodes / 298 relationships**
    (Repository 1, Directory 8, File 87, Class 13, Function 23, Method 16;
    CONTAINS 145, IMPORTS 139, CALLS 8, EXTENDS 6);
  - subset (source/core + errors + utils): 59 nodes / 111 relationships.
- Persistence verified live against Neo4j: analyze → `persisted: true` (59/111);
  `GET /api/graph?repository=…` read back the same 59/111; `GET /api/repositories`
  returned the name.
- Frontend verified in a real browser (headless Chrome): graph renders, nodes are
  colour-coded, selecting a node shows details and incoming/outgoing relationships, and
  "Load stored graph" re-loads from Neo4j.

---

## 8. Known limitations / deferred

- Input: ZIP only (no RAR/7z, no Git URL yet).
- Languages: JavaScript/TypeScript only.
- Symbol resolution is best-effort: dynamic imports, re-exports, aliases, ambiguous names
  and external packages may be omitted.
- `EXTENDS` is matched by class name (same file first).
- Calls inside arrow functions / object methods are not attributed to a named caller.
- No authentication, no multi-user isolation (repository scoping only).
- Full re-analysis each time (no incremental update).
- Neo4j persistence is sequential and not wrapped in a transaction.
- No automated test suite (backend `test` script is a placeholder; validation is via demo
  scripts and manual end-to-end runs).

---

## 9. Next build targets

- Begin Module 2 scope from the proposal: **Guided Project Tour** and/or foundational
  **Contextual Navigation & Search** over the existing graph.
- Introduce automated tests (unit + API) to lock in the pipeline behaviour.
- Add incremental re-analysis groundwork (only re-parse changed files).
- Prepare for the PostgreSQL/auth layer described in the proposal.

---

## Sign-off

| | |
| --- | --- |
| Build closed by | Muhammad Abdullah |
| Date closed | 2026-10-09 |
| Next build | 02 (to be named at the next major update) |
