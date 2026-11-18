# CodeAtlas — Architecture Discovery & Diagram Specification (D2)

**Phase 1 deliverable: a technical specification to review before any draw.io diagram is
drawn.** No diagrams are produced in this phase. No application code was modified.

Produced by: repository inspection (actual source), tests, existing schemas and queries,
the approved FYP proposal, and the newly confirmed meeting requirements in the D2 prompt.

---

## 1. Source-of-truth rules applied

Priority used for every claim, highest first:

1. Actual source code and configuration (`backend/src/**`, `frontend/src/**`, `*.env`
   handling, `docker-compose.yml`, both `package.json`).
2. Tests and implementation evidence (`backend/src/__tests__/**` — 11 files / 73 tests;
   `frontend/src/**` tests — 12 files / 78 tests).
3. Existing database schema and queries (`services/graph.service.ts` — the only place
   Cypher is written).
4. Approved FYP proposal (`../../../proposal/CodeAtlas Project Proposal Final.docx`).
5. Newly confirmed meeting requirements (the D2 prompt).
6. Explicitly labelled recommendations and assumptions (marked 📐 **Design
   recommendation** or ⚠️ **Assumption** in every file).

Meeting requirements define **intended product behaviour**. They are never treated as
proof that something exists. Anything not found in source is reported as not implemented.

## 2. Status legend (used consistently in every file)

| Mark | Meaning |
| --- | --- |
| ✅ **Implemented & verified** | Exists in source and is exercised by tests or documented live evidence |
| 🟡 **Partially implemented** | Part of the behaviour exists; named gaps listed |
| 🆕 **Proposed** | Required by the meeting; **no code exists** |
| 🔌 **External integration** | Provided by a third party (Neo4j, LLM provider, payment gateway) |
| ❓ **Unresolved decision** | Cannot be answered from source or the proposal — needs the project owner |

## 3. What was inspected

Backend: `server.ts`, `config/env.ts`, `database/neo4j.ts`, `models/graph.types.ts`,
`utils/{file,ignore,classify}.utils.ts`, `types/unzipper.d.ts`,
`parser/{ast.parser,entity.extractor,relationship.extractor,symbol.resolver,module-resolver,graph.builder}.ts`,
`services/{repository,analysis,scope,ingestion,parser,graph}.service.ts`,
`services/analysis/{llm.client,repo-digest,report.service,function-summary.service}.ts`,
`controllers/{repository,analysis}.controller.ts`, `routes/{repository,analysis}.routes.ts`,
11 test files.
Frontend: `App.tsx`, `api.ts`, `types.ts`, `graphFilters.ts`, `executionFlows.ts`,
`graphLayout.ts`, `search.ts`, `archRoles.ts`, `nodeStyles.ts`, 9 components.
Infra: `docker-compose.yml`, both `package.json`, `.gitignore`.
Docs: the approved proposal, `../../build-logs/README.md` (master flow),
`../../graph-model.md`, `../` (existing Mermaid diagrams).

## 4. Files in this pack

| File | Contains | Required output section |
| --- | --- | --- |
| `README.md` (this file) | Method, legend, what was inspected, headline findings, approval pointer | — |
| [`01-audit-and-requirements.md`](./01-audit-and-requirements.md) | Component-by-component audit of the real code; confirmed product requirements with stable ids; evidence/traceability matrix | **A**, **B**, **I** |
| [`02-architecture-current-target.md`](./02-architecture-current-target.md) | Current architecture as built; target architecture with 19 logical modules marked implemented/proposed | **C**, **D** |
| [`03-execution-flows.md`](./03-execution-flows.md) | 10 canonical flows, one per real request boundary, each labelled verified or proposed | **E** |
| [`04-data-models.md`](./04-data-models.md) | Verified Neo4j model (from the actual Cypher) + proposed relational ERD + cross-database identity + credential rules | **F** |
| [`05-decisions-open-questions.md`](./05-decisions-open-questions.md) | Every unresolved decision: question, why it matters, options, recommendation, trade-off, whether it blocks a diagram | **G** |
| [`06-diagram-blueprints.md`](./06-diagram-blueprints.md) | Component/arrow/decision blueprint for each of the 10 diagrams, with the solid-vs-dashed status convention | **H** |
| [`07-engineering-review.md`](./07-engineering-review.md) | SOLID and security review with 17 numbered design findings (E1–E17) | **§10 of the prompt** |
| [`08-approval-gate.md`](./08-approval-gate.md) | What is established vs what needs a decision; the list of decisions that block diagram work | **J** |

## 5. Headline findings (read these first)

1. **The repository-analysis core is real and solid.** Upload → validate → extract →
   scan → Babel AST → entities → TypeScript symbol resolution → relationships →
   assemble → Neo4j → REST → D3 dashboard is implemented end to end and covered by
   151 passing tests. ✅
2. **Nothing in the business/product layer exists yet.** No authentication, no users, no
   projects, no ownership, no roles, no subscriptions, no payments, no usage metering,
   no credential storage, no admin interface, no relational database. All of §B and §C
   of the meeting requirements is 🆕 Proposed.
3. **The single biggest architectural obstacle to the meeting requirements is repository
   identity.** A repository is identified only by a sanitized version of the uploaded
   filename (`ingestion.service.ts:19-28,66`), and Neo4j writes delete every node with
   that same name before re-creating them (`graph.service.ts:63-69`). Two different users
   uploading different projects both named `app.zip` would silently destroy each other's
   graph. Ownership, quotas and admin isolation all depend on fixing this first.
   See E1 in `07-engineering-review.md`.
4. **Private source fragments are currently readable without authentication.** Function
   nodes persist a ≤700-character `sourceSnippet`, and `GET /api/graph` returns it to any
   caller. Fine for a local prototype; a hard requirement to fix before a multi-user
   product. See E2/E3.
5. **AI usage cannot be costed today.** The LLM client reads only
   `choices[0].message.content` and discards the provider's `usage` object
   (`llm.client.ts:22-31`), and the credential comes from a single global
   `env.llm.key` (`env.ts:34-39`). Per-user keys (requirement B7) and cost visibility
   (B8) both require changing this client's shape before any table is designed.
6. **Analysis runs synchronously inside one HTTP request** — the D2-era live evidence
   records a 53-node repository taking ~65 seconds to upload and analyse. Requirement B2
   asks for "processing status", which a single blocking request cannot provide. This
   drives the target architecture's job model, not a microservice split.
7. **A deployment diagram (Diagram 10) is not currently justifiable.** The only container
   definition is `neo4j:5` in `docker-compose.yml`; there is no Dockerfile for either
   application, no CI workflow in the repository, and no cloud or hosting decision.
   Recommendation: defer Diagram 10. See D-13.

## 6. Standing constraints honoured in this pack

- No microservices introduced; the target is a **layered monolithic backend** with
  separated modules, because nothing in the source or the proposal justifies otherwise.
- No invented class names, endpoints, tables, providers, prices or quotas. Numbers that
  exist (50 MB upload cap, 700-char snippet, 60 s timeout, ≤6 factors / ≤5 list items,
  score clamp 0–10) are read from source and cited.
- Activity history ≠ security audit log. API usage ≠ API cost ≠ profit. Graph storage ≠
  source-archive storage. Generated plan ≠ code change. Admin analytics ≠ access to
  private content. Each distinction is stated where it applies.
- Nothing is claimed to comply with a specific law; no legal requirement was established.

## 7. Next step

Review `08-approval-gate.md`. Answer the decisions marked **blocking** there, then this
pack becomes the input for the draw.io diagrams. **Diagram production has not started.**
