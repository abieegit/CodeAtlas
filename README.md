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
| `PORT`           | API port (default `5000`)                    |

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

## REST API

| Method | Path                             | Description                                   |
| ------ | -------------------------------- | --------------------------------------------- |
| GET    | `/api/health`                    | Service + Neo4j status                        |
| POST   | `/api/repositories/analyze`      | multipart `file` = repository ZIP → graph     |
| GET    | `/api/graph`                     | Stored graph `{ nodes, relationships }`       |
| GET    | `/api/graph?repository=<name>`   | Stored graph for one repository               |
| GET    | `/api/repositories`              | Names of repositories with a stored graph     |

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

## Tests / scripts (backend)

```bash
npm test                   # Vitest suite (25 tests, fixture-driven pipeline + API)
npm run test:watch         # re-run tests on change
npm run typecheck          # tsc --noEmit
npm run build              # tsc -p tsconfig.build.json (dist/ excludes tests)
npm run analyze            # analyze the bundled src/test-project sample
```

Relationships in the returned graph may carry an `evidence` object
(`{ filePath, line, resolution }`) recording how each edge was found
(`derived` | `resolved` | `name-match`). See `docs/build-logs/` for the
per-build history and `docs/diagrams/` for the system diagrams.
