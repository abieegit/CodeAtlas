# Architecture Diagram — CodeAtlas

Layered architecture as described in the proposal's *System Architectural Design*, with the
F1 prototype's implemented path highlighted. Solid boxes are implemented in F1; dashed boxes
are planned.

```mermaid
flowchart TB
    subgraph Client["Client Layer — Browser"]
        UI["React + TypeScript + Tailwind"]
        D3["D3.js interactive knowledge graph"]
        Monaco["Monaco code viewer (planned)"]
        Views["Views: Map · Guided Tour · Impact Report · Search · Security Report · Export"]
    end

    subgraph APILayer["API Layer — Node.js / Express"]
        REST["REST API (Express)"]
        Auth["Auth — JWT / Firebase (planned)"]
        Jobs["Background jobs — BullMQ / Redis (planned)"]
    end

    subgraph Analysis["Analysis Layer"]
        AST["AST Parsing Engine — Babel Parser + TypeScript Compiler API"]
        Incr["Incremental Update Service (planned)"]
        KG["Knowledge Graph Construction + Validation"]
        Rules["Rule Engine — anti-patterns / code smells (planned)"]
        Vuln["Vulnerability Layer — OWASP Dependency-Check · TruffleHog · AST rules (planned)"]
        PySvc["Python Analysis Service — NetworkX · Node2Vec · Louvain (planned)"]
    end

    subgraph AILayer["AI Layer"]
        LLM["LLM API — OpenAI / Anthropic (planned)"]
        RAG["Graph RAG context grounding (planned)"]
    end

    subgraph Data["Data Layer"]
        Neo[("Neo4j knowledge graph")]
        PG[("PostgreSQL — users, project metadata (planned)")]
        Redis[("Redis — job queue (planned)")]
    end

    Ext1["GitHub (planned)"]
    Ext2["OWASP Dependency-Check / TruffleHog (planned)"]

    UI --> REST
    Views --> REST
    D3 --> REST
    REST --- Auth
    REST --- Jobs
    REST --> AST
    Jobs --> AST
    AST --> Incr
    AST --> KG
    AST --- Rules
    AST --- Vuln
    KG --> Neo
    Rules -.-> Neo
    Vuln -.-> Neo
    PySvc -.-> Neo
    REST --> Neo
    REST -.-> PG
    Jobs -.-> Redis
    REST -.-> LLM
    LLM -.-> RAG
    RAG -.-> Neo
    Ext1 -.-> REST
    Ext2 -.-> Vuln
```

## Layers

| Layer | Responsibility | F1 status |
| --- | --- | --- |
| **Client** | Browser UI — graph visualization, source inspection, reports. | React + D3 implemented. |
| **API** | Express REST API; auth and background jobs in the proposal. | REST implemented; auth/jobs planned. |
| **Analysis** | AST parsing, graph construction, rule/security analysis, graph algorithms. | AST engine + graph construction implemented; rules/security/Python planned. |
| **AI** | Grounded LLM for explanation and remediation; no model training. | Planned. |
| **Data** | Neo4j graph; PostgreSQL metadata; Redis queue. | Neo4j implemented. |

## F1 end-to-end pipeline (implemented)

The prototype's concrete, verified flow:

```mermaid
flowchart LR
    U["Repository ZIP"] --> SCAN["Repository Scanner<br/>findSourceFiles"]
    SCAN --> PARSE["AST Parser<br/>parseFile (Babel)"]
    PARSE --> ENT["Entity Extraction<br/>File/Class/Function/Method"]
    PARSE --> REL["Relationship Extraction<br/>CONTAINS · IMPORTS · CALLS · EXTENDS"]
    ENT --> BUILD["Graph Builder<br/>validate + dedupe"]
    REL --> BUILD
    BUILD --> NEO[("Neo4j<br/>:Entity:Type")]
    BUILD --> API["Express REST API"]
    NEO --> API
    API --> FE["React + D3<br/>interactive graph"]
```

### Design principles (from the system guide)

- The **backend builds the graph**; the frontend only renders what the API returns.
- Graph IDs use **repository-relative paths**; physical filesystem paths are never exposed.
- **One bad file never aborts analysis** (per-file fault tolerance).
- **Persistence is best-effort** — if Neo4j is down the graph is still returned
  (`persisted: false`).

### Verification tooling (F1)

The prototype is covered by an automated test suite and three quality gates:

- **Vitest + Supertest** — specs in `backend/src/__tests__` driven by fixture repositories in
  `backend/src/test-fixtures`.
- **Gates** — `npm test`, `npm run typecheck` (`tsc --noEmit`), and `npm run build`
  (`tsc -p tsconfig.build.json`, which excludes tests/fixtures from `dist`).
- **Edge provenance** — every relationship records how it was found (`resolution` =
  `derived` | `resolved` | `name-match`, plus `filePath` / `line`), persisted as Neo4j
  relationship properties.
- **Relevance scope** — `classify.utils` + `scope.service` annotate every node with a `category`
  (File nodes) and `inDefaultScope` flag; the frontend filters are reversible and never delete
  graph data.
- **Dark UI** — the interface uses a near-black navy theme with a restrained cyan accent and a
  selection-only glow.
