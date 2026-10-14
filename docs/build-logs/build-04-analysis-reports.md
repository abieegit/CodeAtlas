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
| Scope | F1 — Command Code Provider API integration: Analysis Report tab + function core-purpose summaries |

---

## 1. Build context — goals & targets

**Goals:** integrate the Command Code Provider API (analyses, prediction, reports) into the
existing prototype; add an **Analysis Report** tab next to Execution Flows that assesses the
uploaded repository's **scalability and sustainability**; extend the right details panel so
that clicking a **Function** node shows a short, concise line describing that function's core
purpose beneath its statistics. Keep every existing feature intact.

**Targets:**

| # | Target | Result |
| --- | --- | --- |
| T1 | Provider API integrated server-side, key never in source/docs/frontend. | Met |
| T2 | Analysis Report tab with scalability & sustainability factors. | Met (pending plan upgrade, see §4) |
| T3 | One-line core-purpose section for Function nodes, below the stats with a separator. | Met (pending plan upgrade, see §4) |
| T4 | Analysis grounded in measured graph metrics (no invented data). | Met |
| T5 | Existing functionality (graph, search, icons, flows, tests) preserved. | Met |
| T6 | Honest verification of the live API. | Met — 403 plan gate documented |

---

## 2. Features delivered

**Provider API integration (backend-only)**
- `services/analysis/llm.client.ts` — dependency-free OpenAI-compatible client for
  `https://api.commandcode.ai/provider/v1/chat/completions` (`Authorization: Bearer`),
  with timeouts, error mapping (401 invalid key / **403 plan gate** / 429 / 5xx) and a
  defensive JSON completion parser. No new npm dependencies.
- Configuration in `backend/.env` only (gitignored): `CMD_API_KEY`,
  `CMD_API_BASE_URL`, `CMD_ANALYSIS_MODEL` (default `deepseek/deepseek-v4-flash`),
  `CMD_API_TIMEOUT_MS`. The key is never referenced by the frontend, docs or source.

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
  recommendations, regenerate action, loading/error states (the plan-gate message is shown
  verbatim with its upgrade hint).
- API client (`api.ts`) additions with a summary cache.

---

## 3. Complete technology stack

Unchanged from Build 03 (no new dependencies — the Provider API uses Node 18's global
`fetch`). New configuration only: `CMD_API_KEY`, `CMD_API_BASE_URL`, `CMD_ANALYSIS_MODEL`,
`CMD_API_TIMEOUT_MS` in `backend/.env`.

---

## 4. Verification / evidence

- **Backend:** `npm test` → **11 files / 69 tests, all passing** — new suites for the digest
  (pure metrics), the LLM boundary (fenced-JSON parsing, factor/score normalization, caching,
  403 mapping, missing-key fast-fail, non-Function/unknown-node errors) and both routes via
  Supertest with mocked Neo4j + stubbed fetch. `npm run typecheck` and `npm run build` clean.
- **Frontend:** `npm test` → **12 files / 78 tests, all passing** — new suites for the report
  view (render, loading, error, regenerate) and the details-panel summary section (function
  only, separator position, error, no-fetch guards). Typecheck and production build clean.
- **Live Provider API:** the key authenticates — `GET /v1/models` → **200, 89 models**;
  `POST /v1/chat/completions` → **403 `upgrade_required`: "Your Go plan doesn't include API
  access"** — confirmed for paid and free model ids. The $1 Go plan is the only Command Code
  plan without Provider API access; the integration handles this by surfacing the actionable
  upgrade message in the UI.
- **End-to-end without the plan gate:** with a local OpenAI-compatible stub upstream (real
  backend, real Neo4j, real fetch path), `class-validator.zip` re-analyzed (**461 nodes /
  1 148 relationships**, function snippets persisted), `GET /api/analysis` returned the full
  normalized report (graph signature `461:1148`) and `GET /api/analysis/function` returned a
  one-line summary. Verified in Chrome: the **Analysis Report** tab renders summary, both
  scored sections, severity chips and recommendations, and clicking the `useContainer`
  function node shows the **Core purpose** line between the statistics and the relationship
  lists (screenshots taken).
- **Conclusion:** the pipeline is complete and verified end-to-end; the two AI features
  become live the moment the Command Code plan is upgraded (Provider plan from $15/mo
  pay-as-you-go, or GOAT $10/mo) — no code change is needed, only a funded key.

---

## 5. Known limitations / deferred

- The current Go plan cannot call the Provider API; until the plan is upgraded the two AI
  features return the documented upgrade message (everything else works as before).
- The report reflects the stored graph only — no execution of the analyzed code, no
  dependency vulnerability scanning (that stays with the future Module 3 scope).
- Reports and summaries are cached per repository/graph signature; regenerating after a
  re-analysis creates a new cache entry (old entries stay until process restart).
- `sourceSnippet` is truncated at ~700 characters; very long functions are summarised from
  their opening logic plus CALLS context.
- All Build 03 and earlier limitations apply unchanged.

---

## 6. Next build targets

- Upgrade the plan and capture the first real-model report + summaries as evidence.
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
