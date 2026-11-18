# CodeAtlas — Final Year Project

CodeAtlas turns a JavaScript/TypeScript repository into an interactive knowledge graph so
a developer can understand an unfamiliar codebase quickly, plus AI explanations grounded in
what the static analysis proved.

```
Repository ZIP → Cloudflare R2 (private) → PostgreSQL job queue → analysis Worker
  → Scanner → AST Parser → Entity Extraction → Relationship Extraction
  → Graph Builder → Neo4j → REST API → React + D3
```

## 📌 The master document

**Everything about how the system works, what we have built, how it measures against the
approved proposal, and where the two disagree lives in one file:**

👉 **[`docs/build-logs/README.md`](docs/build-logs/README.md)** —
*CodeAtlas — Master System Flow & Proposal Alignment*

That file is updated build by build and is the document to read for supervisor updates. It
explains the technology stack and how it executes, every feature (including the Build 06
accounts/ownership layer and the Build 07 async upload + worker), and the complete flow of
execution of one repository, stage by stage.

## Quick start

```bash
# Terminal 1 — API (http://localhost:5000)
cd backend && npm install && npm run dev

# Terminal 2 — analysis worker (a SEPARATE process; required for uploads to run)
cd backend && npm run dev:worker

# Terminal 3 — dashboard (http://localhost:5173)
cd frontend && npm install && npm run dev

docker compose up -d neo4j     # or use Neo4j Desktop / Aura
```

Open <http://localhost:5173>, sign up / log in (Supabase Auth), then choose a `.zip` and click
**Analyze repository**. The upload is queued and the worker processes it in the background; each
repository is owned by the signed-in account. `backend/.env` (Neo4j, **Supabase** `SUPABASE_*`,
**Cloudflare R2** `R2_*`, and optional `LLM_API_KEY`) and `frontend/.env.local`
(`VITE_SUPABASE_*`) are required and gitignored — see the master document for every variable.
Build 07 requires a Supabase project with the migrations in `supabase/migrations/` applied, and a
private Cloudflare R2 bucket. In production the worker must run as a persistent process.

## Verify

```bash
cd backend  && npm test && npm run typecheck && npm run build
cd frontend && npm test && npx tsc -p tsconfig.json --noEmit && npm run build
```

## Repository map

| Path | What it is |
| --- | --- |
| [`docs/build-logs/README.md`](docs/build-logs/README.md) | **The master system flow document** (the one to read), plus per-build logs Build 01 → 07 (07 open) |
| [`CodeAtlas_F1_System_Guide.txt`](CodeAtlas_F1_System_Guide.txt) | File-by-file walkthrough of the whole codebase |
| [`docs/graph-model.md`](docs/graph-model.md) | Node types, id scheme, relationships, provenance |
| [`docs/diagrams/D1/`](docs/diagrams/D1/README.md) | Use case, architecture, class, ERD (Mermaid) — round 1 |
| [`docs/diagrams/D2/`](docs/diagrams/D2/README.md) | Architecture discovery & diagram specification pack (pre-draw.io review phase) |
| [`proposal/`](proposal) | Approved project proposal (the alignment baseline) |
| `backend/` | Express + TypeScript analysis pipeline, the analysis worker, Neo4j persistence, REST API |
| `frontend/` | React + D3 dashboard (Knowledge Graph, Execution Flows, Analysis Report, Coremation) |
