# CodeAtlas — F1 Prototype

CodeAtlas turns a JavaScript/TypeScript repository into an interactive
knowledge graph so a developer can understand a codebase quickly.

**F1 scope (current):** upload a repository ZIP → scan → parse (AST) →
extract entities and relationships → validate → store in Neo4j → expose via
REST → render an interactive React + D3 graph.

```
Repository ZIP → Scanner → AST Parser → Entity Extraction →
Relationship Extraction → Graph Builder → Neo4j → REST API → React + D3
```

## Node types
Repository, Directory, File, Class, Function, Method (Variables may exist
internally but are not shown initially).

## Relationship types
`CONTAINS`, `IMPORTS`, `CALLS`, `EXTENDS`.

## Prerequisites
- Node.js 18+
- Neo4j 5 (local via Docker, or Aura)

## Backend

```bash
cd backend
npm install
cp .env.example .env      # then edit if needed
npm run dev               # http://localhost:5000
```

Environment (`backend/.env`):

| Variable         | Description                                  |
| ---------------- | -------------------------------------------- |
| `NEO4J_URI`      | e.g. `neo4j://localhost:7687` or Aura `neo4j+s://...` |
| `NEO4J_USERNAME` | Neo4j username                               |
| `NEO4J_PASSWORD` | Neo4j password                               |
| `NEO4J_DATABASE` | Database name (local default: `neo4j`)       |
| `PORT`           | API port (default `5000`)                     |
| `LLM_API_KEY`    | LLM API key for the analysis features (any OpenAI-compatible endpoint; server-side only) |
| `LLM_API_BASE_URL` | OpenAI-compatible base URL (default `https://api.groq.com/openai/v1`) |
| `LLM_MODEL`      | Model id for the analysis features (default `openai/gpt-oss-120b`) |

> The analysis features call any OpenAI-compatible chat-completions endpoint
> (default: Groq). Without an `LLM_API_KEY` the Analysis Report tab and function
> summaries return a clear configuration message.

Neo4j via Docker:

```bash
docker compose up -d neo4j
```

## Frontend

```bash
cd frontend
npm install
npm run dev               # http://localhost:5173
```

The dev server proxies `/api` to `http://localhost:5000`.

## Views

The dashboard has three tabs over the loaded repository:

- **Knowledge Graph** — the interactive D3 map (zoom, pan, drag, select) with reversible filters
  (scope, node type, relationship type, directory, focus), a search bar that navigates to any
  node (offering to reveal filter-hidden results), an explicit **Fit graph** action, and an
  optional, experimental architectural icon overlay (visualisation-only). Selecting a
  **Function** node shows a one-line AI "Core purpose" summary beneath its statistics.
- **Execution Flows** — call-based pipelines derived client-side from `CALLS` edges
  (`deriveExecutionFlows`), animated step by step with Play/Pause.
- **Analysis Report** — scalability and sustainability factors for the stored repository,
  generated server-side through an OpenAI-compatible LLM API from measured graph metrics.

Both graph views read the graph already in memory; switching tabs issues no extra request.
Zoom, pan and dragged node positions persist across filter changes, searches, tab switches and
simulation settle; a fresh layout is auto-fitted once, only when a different repository is loaded.

## REST API

| Method | Path                             | Description                                   |
| ------ | -------------------------------- | --------------------------------------------- |
| GET    | `/api/health`                    | Service + Neo4j status                        |
| POST   | `/api/repositories/analyze`      | multipart `file` = repository ZIP → graph     |
| GET    | `/api/graph`                     | Stored graph `{ nodes, relationships }`       |
| GET    | `/api/graph?repository=<name>`   | Stored graph for one repository               |
| GET    | `/api/repositories`              | Names of repositories with a stored graph      |
| GET    | `/api/analysis?repository=`      | Scalability & sustainability report (AI)       |
| GET    | `/api/analysis/function`         | One-line core-purpose summary for a Function node |

Example:

```bash
curl -F "file=@repo.zip" http://localhost:5000/api/repositories/analyze
```

If Neo4j is unreachable the analyze endpoint still returns the graph with
`"persisted": false` (persistence is best-effort), so the pipeline can be
demonstrated without a database.

## Graph identity
Node ids are repository-relative and globally unique within one analyzed
repository, e.g.:

```
function:src/services/userService.ts:getUser
method:src/controllers/userController.ts:UserController:getUser
```

Physical filesystem paths are never exposed in the graph.

## Tests

```bash
# backend (Vitest + Supertest)
cd backend
npm test                   # 11 files / 69 tests: pipeline, resolver, scope, API, analysis, Neo4j-gated
npm run typecheck          # tsc --noEmit
npm run build              # tsc -p tsconfig.build.json (dist/ excludes tests)

# frontend (Vitest + Testing Library)
cd frontend
npm test                   # 12 files / 78 tests: viewport, search, icons, report, panels
npx tsc -p tsconfig.json --noEmit
npm run build
```

The Neo4j round-trip test is **gated**: it runs when Neo4j is reachable and skips otherwise.

## Graph semantics, provenance & scope

- Relationships carry an `evidence` object (`{ filePath, line, resolution }`) recording how each
  edge was found (`derived` | `resolved` | `name-match`).
- File nodes carry a `category` and an `inDefaultScope` flag; the UI filters (scope, node type,
  relationship type, directory, focus) are reversible and never delete graph data.
- The interface uses a monochrome black-and-white theme.

See [`docs/graph-model.md`](docs/graph-model.md), [`docs/build-logs/`](docs/build-logs/README.md),
and [`docs/diagrams/`](docs/diagrams/README.md).
