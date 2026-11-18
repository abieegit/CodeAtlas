# D2 Diagram 7 — Current Neo4j Data Model (verified from the real Cypher)

Every label, property, direction and behaviour below was read out of
`backend/src/services/graph.service.ts`, `models/graph.types.ts` and
`backend/src/parser/graph.builder.ts`. There is **no schema file and no migration** in this
repository — this model exists only as the write path.

## 1. The graph as it is actually stored

```mermaid
%%{init: {'flowchart': {'htmlLabels': true, 'curve': 'linear'}}}%%
flowchart LR
    REPO(":Repository<br/>id = repository:&lt;name&gt;<br/>name · repository"):::n
    DIR(":Directory<br/>id = directory:&lt;relDirPath&gt;"):::n
    FILE(":File<br/>id = file:&lt;relFilePath&gt;<br/>category · inDefaultScope"):::n
    CLASS(":Class<br/>id = class:&lt;relFile&gt;:&lt;ClassName&gt;"):::n
    FUNC(":Function<br/>id = function:&lt;relFile&gt;:&lt;Name&gt;<br/>sourceSnippet ≤ 700 chars"):::n
    METH(":Method<br/>id = method:&lt;relFile&gt;:&lt;Class&gt;:&lt;Name&gt;"):::n
    VAR(":Variable — allow-listed<br/>but NEVER emitted (E14)"):::ghost

    REPO -->|CONTAINS · derived| DIR
    REPO -->|CONTAINS · derived| FILE
    DIR  -->|CONTAINS · derived| DIR
    DIR  -->|CONTAINS · derived| FILE
    FILE -->|CONTAINS · derived| CLASS
    FILE -->|CONTAINS · derived| FUNC
    CLASS-->|CONTAINS · derived| METH
    FILE -->|IMPORTS · resolved| FILE
    FUNC -->|CALLS · resolved| FUNC
    METH -->|CALLS · resolved| FUNC
    FUNC -->|CALLS · resolved| METH
    CLASS-->|EXTENDS · name-match| CLASS

    classDef n fill:#eef2ff,stroke:#4f46e5,stroke-width:1.5px;
    classDef ghost fill:#fafafa,stroke:#9ca3af,color:#4b5563,stroke-dasharray:4;
```

All nodes also carry the `:Entity` super-label (plus their type label), and the ten
properties written verbatim by `saveGraph`: `id`, `type`, `name`, `filePath`, `startLine`,
`endLine`, `category`, `inDefaultScope`, `sourceSnippet`, `repository`.

## 2. Relationship properties (provenance)

```mermaid
%%{init: {'flowchart': {'htmlLabels': true, 'curve': 'linear'}}}%%
flowchart LR
    A("(source node)"):::n ==>|"edge properties:<br/>line · filePath · resolution"| B("(target node)"):::n
    R1["resolution = derived — structural ownership computed from paths"]:::p
    R2["resolution = resolved — import path or TypeScript symbol resolver"]:::p
    R3["resolution = name-match — EXTENDS by class name only"]:::p
    R4["❗ no 'unresolved' value exists — unresolvable edges are dropped<br/>before persistence (E13)"]:::bad

    R1 -.-> A
    R2 -.-> A
    R3 -.-> A
    R4 -.- B
    classDef n fill:#eef2ff,stroke:#4f46e5;
    classDef p fill:#f0fdf4,stroke:#16a34a;
    classDef bad fill:#fff5f5,stroke:#b91c1c,stroke-dasharray:5;
```

## 3. Identity, keys and integrity — the verified state

| Concern | Reality in code | Draw consequence |
| --- | --- | --- |
| Node id | Application-generated **string**, repository-relative | ids are unique **only within one `repository` value** |
| Uniqueness constraint | **None** — `CREATE`, never `MERGE`; no `CREATE CONSTRAINT` anywhere | Partial/duplicate writes are possible; nothing enforces `(repository, id)` |
| Indexes | **None**; every `MATCH (n:Entity {repository:…})` / `{id:…}` is a scan | Write path is ~1 statement per node + 2 lookups per edge (E5) |
| Scoping mechanism | The `repository` **property** — value = sanitized filename (E1) | Same name across users ⇒ mutual deletion. Identity change D-03 is blocking |
| Re-analysis | `MATCH (n:Entity {repository:$r}) DETACH DELETE n` then re-create | Idempotent per name; other repositories untouched |
| Unscoped read | `fetchGraph()` with no argument returns **all** `:Entity` nodes | `GET /api/graph` can expose every repository (E2) |
| Content exposure | `fetchGraph` re-attaches `sourceSnippet` to returned nodes | Private source fragments leave the server (E3) |
| Function context | `fetchFunctionContext` collects `(caller)-[:CALLS]->(n)` and `(n)-[:CALLS]->(callee)` into a **set of names** | Same-name callees merge (E17) |
| Ownership registry | `listRepositories()` = `DISTINCT r.name` on `:Repository` | No owner, timestamps or run history — the relational layer's job |

## 4. Proposed overlay (draw dashed grey, blocked)

```mermaid
%%{init: {'flowchart': {'htmlLabels': true, 'curve': 'linear'}}}%%
flowchart LR
    subgraph NOW["✅ current"]
        N1["repository = sanitized filename"]
        N2["no constraint · no index · CREATE per node/edge"]
        N3["resolution ∈ derived|resolved|name-match"]
    end
    subgraph TARGET["🆕 proposed — DO NOT DRAW SOLID"]
        T1["repository = application-minted UUID ❓D-03"]
        T2["MERGE + UNIQUE (repository,id) + index on repository"]
        T3["resolution gains 'unresolved' + a count (E13)"]
        T4[":Route / :APIEndpoint entities — proposal M1 gap"]
        T5["sourceSnippet no longer serialized to clients (E3)"]
    end
    N1 -.->|migration = re-analyse| T1
    N2 -.-> T2
    N3 -.-> T3
    classDef plain fill:#f8fafc,stroke:#64748b;
    style TARGET fill:#fafafa,stroke:#9ca3af,stroke-dasharray:6
```

Blocked by **D-03** (identity) and **D-05** (retention). Nothing in §4 may appear as solid
until `../08-approval-gate.md` §J.3 is answered.

➡️ Diagram index and render steps: [`README.md`](./README.md)
