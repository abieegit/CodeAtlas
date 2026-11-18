# D2 Diagram 1 — Current System Architecture (verified)

**As of Build 04, 2026-10-20.** Every box below is drawn from source in this repository —
see `../01-audit-and-requirements.md` §I.1 for the file/line evidence of each one. No
proposed component appears here.

| Style | Meaning on this diagram |
| --- | --- |
| Solid box | ✅ implemented & verified in source |
| Rounded/cylinder | 🔌 external system actually used today |
| Dashed red | a real **absence** that must not be mistaken for a feature |

```mermaid
%%{init: {'flowchart': {'htmlLabels': true, 'curve': 'linear'}}}%%
flowchart TB
    USER(["Developer — no account exists"]):::absent

    subgraph CLIENT["Browser — user client :5173 (React 18 + D3 7 + Tailwind 3 + Vite 5)"]
        APP["App.tsx — graph, selection, repository name, busy state"]
        UP["UploadPanel"]
        GV["GraphView + graphLayout + nodeStyles<br/>zoom · pan · drag · select · fit · icon overlay"]
        FP["FilterPanel + graphFilters (reversible)"]
        SP["SearchPanel + search (client-side)"]
        EF["ExecutionFlowsView + executionFlows<br/>flows derived CLIENT-side from CALLS"]
        ARV["AnalysisReportView (6 sections)"]
        DP["DetailsPanel + Legend<br/>Function 'Core purpose' below stats"]
        APIC["api.ts<br/>in-browser summaryCache key = repository:nodeId"]
    end

    PROXY["Vite dev proxy — /api → http://localhost:5000 (dev only)"]

    subgraph BACKEND["Backend — ONE layered Express 5 + TypeScript monolith :5000"]
        SRV["server.ts<br/>cors() bare · express.json() · /api routers · JSON 404 · error handler"]

        subgraph HTTPL["Interface layer"]
            RT1["repository.routes.ts<br/>Multer disk storage, field 'file', 50 MB limit"]
            RT2["analysis.routes.ts"]
            CTRL1["repository.controller<br/>health · analyze · getGraph · getRepositories"]
            CTRL2["analysis.controller<br/>report · function summary · LlmError→HTTP"]
        end

        subgraph INGEST["Ingestion"]
            ING["ingestion.service<br/>sanitizeName · zip-slip skip · single-root detect"]
            UTILS["utils/file.utils<br/>isZipArchive (PK bytes) · isPathInside · remove*"]
            IGN["utils/ignore.utils"]
        end

        subgraph PIPE["Analysis pipeline — analysis.service (4 phases, per-file try/catch)"]
            PARSER["parser.service<br/>analyze + persist (best effort) + AI cache invalidate"]
            SCAN["repository.service — scan .ts .tsx .js .jsx"]
            AST["ast.parser — Babel, plugins by extension"]
            ENT["entity.extractor — File/Class/Function/Method<br/>+ sourceSnippet ≤700 chars"]
            SYMR["symbol.resolver — ONE TypeScript program<br/>innermost call wins"]
            MODR["module-resolver — relative ESM imports only"]
            RELX["relationship.extractor<br/>CONTAINS · IMPORTS · CALLS · EXTENDS + evidence"]
            BUILD["graph.builder — Repository + Directory, dedupe, drop dangling"]
            SCOPE["scope.service + classify.utils — category · inDefaultScope"]
        end

        subgraph AIL["AI explanation layer (backend-only)"]
            DIG["repo-digest — pure metrics of the stored graph"]
            RPT["report.service — prompt v2 · normalize+cap<br/>cache = repository:model:version:signature"]
            FNS["function-summary.service<br/>cache = repository:model:version:nodeId"]
            CLI["llm.client — chat/completions<br/>AbortController timeout · 401/403→502 · 429→503 · empty→502"]
        end

        GS["graph.service<br/>saveGraph · fetchGraph · fetchFunctionContext · listRepositories · verifyConnection"]
        ENV["config/env.ts — loads backend/.env once<br/>LLM key is a GLOBAL singleton"]
        DRV["database/neo4j.ts — driver singleton<br/>disableLosslessIntegers"]
    end

    subgraph PERSIST["Persistence & external systems"]
        NEO4J[("Neo4j 5 — :Entity:&lt;Type&gt; nodes<br/>CONTAINS/IMPORTS/CALLS/EXTENDS + evidence props")]:::ext
        FS[("Local filesystem<br/>backend/uploads → backend/extracted<br/>DELETED after the response")]:::ext
        LLM[("LLM provider — OpenAI-compatible<br/>Groq default · model openai/gpt-oss-120b")]:::ext
    end

    NOAUTH["❗ NO auth, NO principal, NO ownership, NO rate limit, NO audit log<br/>GET /api/graph without ?repository returns EVERY repository (E2)<br/>Function sourceSnippet is returned to any caller (E3)"]:::absent

    USER --> APP
    APP --> UP & GV & FP & SP & EF & ARV & DP
    APP --> APIC
    APIC --> PROXY --> SRV
    SRV --> RT1 & RT2
    RT1 --> CTRL1
    RT2 --> CTRL2

    CTRL1 --> ING
    ING --> FS
    CTRL1 -.->|uses| UTILS
    CTRL1 --> PARSER
    SCAN -.->|uses| IGN
    PARSER --> PIPE
    SCAN --> AST --> ENT --> RELX
    RELX --> MODR
    RELX --> SYMR
    RELX --> BUILD --> SCOPE
    SCOPE --> PARSER
    PARSER --> GS

    CTRL2 --> GS
    CTRL2 --> RPT
    CTRL2 --> FNS
    RPT --> DIG
    RPT --> CLI
    FNS --> GS
    FNS --> CLI
    CLI --> LLM
    GS --> DRV --> NEO4J
    ENV -.->|config| CLI
    ENV -.->|config| DRV
    ENV -.->|config| RT1
    SRV -.- NOAUTH

    classDef ext fill:#eef3f7,stroke:#334155,stroke-width:1.5px;
    classDef absent fill:#fff5f5,stroke:#b91c1c,color:#7f1d1d,stroke-dasharray:5;
    style CLIENT fill:#f8fafc,stroke:#64748b
    style BACKEND fill:#f8fafc,stroke:#64748b
    style PERSIST fill:#f8fafc,stroke:#64748b
    style PIPE fill:#eef2ff,stroke:#4f46e5
    style AIL fill:#f0fdf4,stroke:#16a34a
    style INGEST fill:#fefce8,stroke:#ca8a04
    style HTTPL fill:#fdf2f8,stroke:#db2777
```

## Reading notes (what a reviewer should take from this)

1. **One process, one deployment.** The backend is a layered monolith — Interface →
   pipeline/AI services → persistence. Nothing here is a separate service, and
   `../02-architecture-current-target.md` §D.1 recommends it stays that way.
2. **The backend owns all graph semantics.** The client only renders what the API returns;
   the sole exception is `executionFlows.ts`, which derives *display* pipelines from the
   `CALLS` edges it was given (that's the W8 gap in the master doc, not a second graph
   builder).
3. **Two outbound dependencies only**: Neo4j (bolt) and the LLM provider (HTTPS). Both are
   reachable only from the backend — no client arrow touches them.
4. **The red dashed box is part of the architecture picture**, not an editorial comment: it
   is why the whole target layer in `D2` is blocked on identity decisions (E1, E2, E3).
5. **Persistence is best-effort** — `parser.service` returns the graph with
   `persisted:false` if Neo4j is down, so the pipeline is demonstrable without a database.

➡️ Target-state diagrams (2, 3, 4, 8, 9) stay undrawn until
[`../08-approval-gate.md`](../08-approval-gate.md) §J.3 is answered.
