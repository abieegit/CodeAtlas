# Build Log — Build 04 — analysis-reports

| Field | Value |
| --- | --- |
| Unique file name | `build-04-analysis-reports.md` |
| Build number | 04 |
| Build name | analysis-reports (provisional, to be confirmed at the next meeting) |
| Status | Open |
| Date opened | 2026-10-13 |
| Date closed | — (open) |
| Author | Muhammad Abdullah (47618) |
| Scope | F1 — external LLM API integration: Analysis Report tab + function core-purpose summaries |

---

## 1. Build context — goals & targets

**Goals:** integrate an external LLM API into the existing prototype; add an **Analysis Report** tab next to Execution Flows that assesses the
uploaded repository's **scalability and sustainability**; extend the right details panel so
that clicking a **Function** node shows a short, concise line describing that function's core
purpose beneath its statistics. Keep every existing feature intact.

**Targets:**

| # | Target | Result |
| --- | --- | --- |
| T1 | LLM API integrated server-side, key never in source/docs/frontend. | Met |
| T2 | Analysis Report tab with scalability & sustainability factors. | Met (live once an `LLM_API_KEY` is set) |
| T3 | One-line core-purpose section for Function nodes, below the stats with a separator. | Met (live once an `LLM_API_KEY` is set) |
| T4 | Analysis grounded in measured graph metrics (no invented data). | Met |
| T5 | Existing functionality (graph, search, icons, flows, tests) preserved. | Met |
| T6 | Honest verification of the live API. | Met — 403 plan gate documented |

---

## 2. Features delivered

**LLM API integration (backend-only)**
- `services/analysis/llm.client.ts` — dependency-free OpenAI-compatible client for any
  `POST <base-url>/chat/completions` endpoint (`Authorization: Bearer`), defaulting to
  Groq (`https://api.groq.com/openai/v1`), with timeouts, error mapping (401 invalid
  key / 403 denial / 429 / 5xx) and a defensive JSON completion parser. No new npm
  dependencies.
- Configuration in `backend/.env` only (gitignored): `LLM_API_KEY`, `LLM_API_BASE_URL`
  (default Groq), `LLM_MODEL` (default `openai/gpt-oss-120b`), `LLM_API_TIMEOUT_MS`.
  The key is never referenced by the frontend, docs or source.
- Originally the Command Code Provider API (https://api.commandcode.ai/provider/v1) was
  used, but the $1 Go plan cannot access it (403 `upgrade_required` — see §4), so on
  2026-10-14 the configuration was generalised to any OpenAI-compatible endpoint
  (`cmdApi`/`CMD_*` → `llm`/`LLM_*`); the client code itself never depended on the
  provider specifics.

**Repository report (`GET /api/analysis?repository=<name>`)**
- `services/analysis/repo-digest.ts` (pure): builds a token-bounded digest of *measured*
  graph metrics — node/relationship counts, files by category, fan-in/fan-out leaders,
  largest files, busiest directories, import-cycle count.
- `services/analysis/report.service.ts`: strict-JSON prompt → normalized report
  (`summary`, `scalability {score 0-10, verdict, factors[title/detail/severity]}`,
  `sustainability {…}`, `recommendations[]`), cached per repository + graph signature so
  re-opening the tab never re-bills the API.

**Function core-purpose summaries (`GET /api/analysis/function?repository=&nodeId=`)**
- Function entities now capture a compact `sourceSnippet` (whitespace-collapsed, ≤ 700
  chars) at extraction time (`entity.extractor`), persisted to Neo4j and read back — so the
  model sees the real implementation although the ZIP is deleted after analysis.
- `services/analysis/function-summary.service.ts` grounds the prompt in the snippet plus
  CALLS context (callers/callees, via `fetchFunctionContext`) and returns ONE sentence
  (≤ 25 words). Cached per repository+node.
- Details panel: clicking a **Function** node shows a `Core purpose` section below the
  statistics, separated by a divider; loading/error states; existing stats and relationship
  lists unchanged. Non-function nodes and repository-less sessions show nothing.

**Frontend**
- New **Analysis Report** tab next to Execution Flows (`AnalysisReportView.tsx`): summary,
  two scored sections with severity-tagged factors (restrained monochrome + red for high),
  recommendations, regenerate action, loading/error states (the backend error message is
  shown verbatim).
- API client (`api.ts`) additions with a summary cache.

---

## 3. Complete technology stack

Unchanged from Build 03 (no new dependencies — the LLM API uses Node 18's global
`fetch`). New configuration only: `LLM_API_KEY`, `LLM_API_BASE_URL`, `LLM_MODEL`,
`LLM_API_TIMEOUT_MS` in `backend/.env`.

---

## 4. Verification / evidence

- **Backend:** `npm test` → **11 files / 69 tests, all passing** — new suites for the digest
  (pure metrics), the LLM boundary (fenced-JSON parsing, factor/score normalization, caching,
  403 mapping, missing-key fast-fail, non-Function/unknown-node errors) and both routes via
  Supertest with mocked Neo4j + stubbed fetch. `npm run typecheck` and `npm run build` clean.
- **Frontend:** `npm test` → **12 files / 78 tests, all passing** — new suites for the report
  view (render, loading, error, regenerate) and the details-panel summary section (function
  only, separator position, error, no-fetch guards). Typecheck and production build clean.
- **Live Command Code Provider API (2026-10-13, historical):** the key authenticates —
  `GET /v1/models` → **200, 89 models**; `POST /v1/chat/completions` → **403 `upgrade_required`:
  "Your Go plan doesn't include API access"** — confirmed for paid and free model ids. The $1
  Go plan is the only Command Code plan without Provider API access, which motivated the
  2026-10-14 switch to a generic OpenAI-compatible provider (Groq by default, §2).
- **End-to-end without the plan gate:** with a local OpenAI-compatible stub upstream (real
  backend, real Neo4j, real fetch path), `class-validator.zip` re-analyzed (**461 nodes /
  1 148 relationships**, function snippets persisted), `GET /api/analysis` returned the full
  normalized report (graph signature `461:1148`) and `GET /api/analysis/function` returned a
  one-line summary. Verified in Chrome: the **Analysis Report** tab renders summary, both
  scored sections, severity chips and recommendations, and clicking the `useContainer`
  function node shows the **Core purpose** line between the statistics and the relationship
  lists (screenshots taken).
- **Conclusion:** the pipeline is complete and verified end-to-end; the two AI features go
  live the moment a funded `LLM_API_KEY` (`LLM_API_BASE_URL`, `LLM_MODEL`) is set in
  `backend/.env` — no code change is needed.

### Spec alignment pass (2026-10-15)

A later detailed specification for Build 04 was audited against the implementation. What
already satisfied it: tab placement beside Execution Flows, the Function-only `Core
purpose` section with divider below unchanged statistics, trusted stable-ID source
resolution inside Neo4j (no client-supplied paths), backend-only provider client with
env auth and 60 s timeout, bounded measured-metrics digest, strict JSON validation,
backend-only gitignored key (no committed copy of any key exists in the repo).

Gaps that were closed in this pass:

- Report now carries the six required sections: Scalability, Sustainability,
  **Architectural strengths** (`strengths`), **Risks & weaknesses** (`risks`, severity
  chips), prioritized Recommendations, and **Assessment limitations & uncertainties**
  (`limitations`) — all normalized and capped at 5 server-side
  (`report.service.ts`, prompt version `v2`).
- Cache keys now include the model id and prompt version; the content signature includes
  relationship-type counts; concurrent duplicate requests share one in-flight promise
  (report and function summaries both) instead of double-billing.
- 429 responses map to a retriable 503 ("rate limit").
- Prompt-injection defense: both system prompts state that repository content is data and
  instructions inside it are never followed.
- Stale "Command Code Provider API" copy replaced with provider-neutral wording
  (`AnalysisReportView.tsx`, `analysis.controller.ts`, `api.ts`).
- Tests: backend 11 files / **70 tests** passing; frontend 12 files / **78 tests**
  passing (new report-section, 429 and in-flight-dedupe cases); typecheck and
  production builds clean on both packages.
- Live verification with a funded key remains pending: the previously shared `gsk_` key
  is treated as exposed (it was shared in chat) and must be revoked and replaced directly
  in `backend/.env` before any live testing; Neo4j was not running during this pass.

---

## 5. Known limitations / deferred

- Without `LLM_API_KEY` set the two AI features return the documented configuration
  message (everything else works as before). No funded key has been verified live yet —
  the end-to-end evidence above uses a local stub upstream.
- The report reflects the stored graph only — no execution of the analyzed code, no
  dependency vulnerability scanning (that stays with the future Module 3 scope).
- Reports and summaries are cached per repository/graph signature; regenerating after a
  re-analysis creates a new cache entry (old entries stay until process restart).
- `sourceSnippet` is truncated at ~700 characters; very long functions are summarised from
  their opening logic plus CALLS context.
- All Build 03 and earlier limitations apply unchanged.

---

## 6. Next build targets

- Set a funded `LLM_API_KEY` and capture the first real-model report + summaries as evidence.
- Relevance scoring / centrality layered on the categories (Module 1 completion).
- CI (GitHub Actions) with coverage gates; incremental re-analysis groundwork.
- Module 2 scope: guided project tour and/or contextual search.

---

## Related documentation (kept consistent with this build)

- Build-log standard & index: [`./README.md`](./README.md)
- Graph model (function `sourceSnippet`): [`../graph-model.md`](../graph-model.md)
- System diagrams: [`../diagrams/`](../diagrams/README.md)

---

## Sign-off

| | |
| --- | --- |
| Build opened by | Muhammad Abdullah |
| Date opened | 2026-10-13 |
| Status | Open — closes when Build 05 begins |
