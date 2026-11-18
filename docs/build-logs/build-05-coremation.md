# Build Log — Build 05 — coremation

| Field | Value |
| --- | --- |
| Unique file name | `build-05-coremation.md` |
| Build number | 05 |
| Build name | coremation |
| Status | **Closed** — closed by Build 06 (auth-and-ownership) on 2026-11-17 |
| Date opened | 2026-10-22 |
| Date closed | 2026-11-17 |
| Author | Muhammad Abdullah (47618) |
| Scope | Graph-correctness repairs (callback attribution, call occurrences, control-flow and unresolved-call evidence), frontend↔backend HTTP boundary extraction, deterministic workflow reconstruction, bounded Groq refinement, Coremation tab with animated candidate workflows |
| Regression baseline | Backend 11 files / 73 tests, frontend 12 files / 78 tests — all passing before the first edit; **no test deleted or weakened** |
| Result | Backend **13 files / 116 tests**, frontend **14 files / 120 tests** — all passing; typecheck clean both packages; production builds clean both packages |

---

## 1. Build context — goals & targets

**Goal (from the meeting):** add **Coremation** — evidence-backed, animated workflow
visualisation for an analysed repository, placed next to the report tab, where static
analysis is the source of truth and the LLM is only a constrained wording layer.

| # | Target | Result |
| --- | --- | --- |
| T1 | Coremation beside Analysis Report, additive, existing screens untouched | **Met** — verified by frontend tests incl. a tab-order assertion and a switch-back regression test |
| T2 | Fix the graph-correctness limits that make workflow claims unsafe (callback entities, caller attribution, call occurrences, unresolved honesty) | **Met** — defects N1/N2/E13 closed with tests; one latent attribution bug found mid-build and fixed (§5) |
| T3 | Control-flow evidence (if/else-if/else, switch, ternary, try/catch/finally, throw, return, loop, await) captured with real source conditions | **Met** — bounded, additive, persisted |
| T4 | Link frontend requests to backend routes from source evidence only | **Met** — route + request extraction, mount prefixes, conservative matcher keeping ambiguity |
| T5 | Deterministic workflow reconstruction with bounded traversal, before any LLM call | **Met** — 12 workflows reconstructed from CodeAtlas's own 525-node graph, 12/12 spanning frontend→backend |
| T6 | Groq refinement bounded, validated, cached, optional, never structural | **Met** — unknown step keys/paths dropped and counted; structure asserted unchanged in tests |
| T7 | Works with no `LLM_API_KEY` and when the provider fails | **Met** — fallback tests at service and API level; UI keeps deterministic labels and says why |
| T8 | Animation local-only; never triggers backend/model calls; cleans up timers | **Met** — tests assert zero requests during playback and `cancelAnimationFrame` on unmount |
| T9 | No new dependency; no unrelated refactor | **Met** — `package.json` files unchanged (SVG + existing d3-free view code) |
| T10 | Backward-compatible API and stored graphs | **Met additively** — 7 existing endpoints untouched; pre-Build-05 graphs are detected and reported as `evidenceVersion: "none"` requiring re-analysis |

---

## 2. Features delivered (everything present at close of build)

**All Build 01–04 features remain:** ZIP upload + validation, scanning, AST parsing, entity
and relationship extraction, symbol resolution, graph assembly/validation, Neo4j
persistence + retrieval, knowledge-graph tab (filters, search, viewport, icons),
Execution Flows, Analysis Report, function core-purpose summaries, 7 original REST
endpoints.

**New in Build 05**

- **Shared callable model** — `backend/src/parser/callable.ts`. One definition of what a
  callable is, used by entity extraction, call attribution and control-flow capture
  (previously these three could disagree — they did). Recognises direct function
  declarations, `const x = () => {}`, **hook-wrapped** `const x = useCallback(() => {}, [])`
  / `useMemo`, class methods, object methods and object-property functions. An anonymous
  callback with no addressable owner (e.g. a `.map()` body) now stops attribution instead
  of blaming the enclosing component.
- **Every call site survives.** `CALLS` edges keep `occurrences` (`callId`, line, column,
  branch, condition, `awaited`, caller-global `sequence`). One edge per caller/target is
  preserved so existing consumers are unaffected, and repeated calls to the same target
  are no longer collapsed. Recursion is still **not** an edge (the existing self-loop rule
  and its test stay intact) but is no longer invisible: self-call lines are recorded in
  `workflowEvidence.selfCalls` and surfaced as `provenance.selfCalls`.
- **Control-flow evidence** — `backend/src/parser/control-flow.extractor.ts` records, per
  callable: branch kinds with the **real condition text sliced from source**
  (`if.then`, `else-if`, `if.else`, `case`, `default`, `ternary.*`, `try`, `catch`,
  `finally`, `loop`), plus return / throw / await / loop lines. Bounded per file and unit.
- **Unresolved-call evidence** — calls that could not be resolved are recorded with
  `reason: "not-resolved" | "target-not-in-graph"`; they are **never** turned into
  `CALLS` edges (the existing `unresolved` fixture test still asserts zero non-CONTAINS
  edges).
- **HTTP boundary extraction** — `backend/src/parser/boundary.extractor.ts`: Express-style
  `router.get("/x", handler)` registrations (method, declared path, handler name, resolved
  handler **entity id** across files, middleware, line/column), `app.use("/api", router)`
  mounts, and client requests (`fetch`/axios-style) with method, assembled URL,
  `urlStatic`, caller entity and line. Same-file string constants (`const BASE = "/api"`)
  are substituted; anything unresolvable stays marked so.
- **Request↔route matching** — `backend/src/services/workflow/route-matching.ts`: segment
  matching with route params (`:id`) and wildcard (`*`) segments, mount-prefix joining, and
  four outcomes — `resolved`, **`ambiguous` (kept ambiguous, never guessed)**, `unresolved`,
  no-match.
- **Workflow reconstruction** — `backend/src/services/workflow/workflow.service.ts`:
  bounded traversal (max 10 depth, 24 steps, 40 edges, 12 workflows, 8 paths, cycle-broken)
  producing typed `Workflow` objects — steps (`entry`/`function`/`route`/`error`), edges
  (`call`/`http`/`branch`/`throw`), paths (`main`/`branch`/`error` plus a clearly labelled
  "All reachable steps (guard conditions ignored)" traversal), per-step source refs, and
  `provenance` carrying fingerprint, resolved/unresolved counts, branch count, HTTP
  boundary count, limits and `evidenceVersion`.
- **Groq refinement** — `backend/src/services/workflow/refine.service.ts`: one bounded
  request per workflow (compact step/path/edge evidence, allowed ids enumerated in the
  prompt), strict JSON parse, **field-by-field validation** (unknown step keys and path ids
  dropped and counted, lengths clipped, non-strings rejected), wording-only output,
  cache key `repository|workflow|graphFingerprint|model|promptVersion`, in-flight
  dedupe, `invalidateRefinements(repository)` wired into re-analysis.
- **Three new endpoints** — `GET /api/workflows`, `GET /api/workflows/:workflowId`,
  `POST /api/workflows/:workflowId/refine` (additive; `workflowRoutes` mounted in
  `server.ts`).
- **Coremation tab** — `frontend/src/components/CoremationView.tsx` + `coremation.ts`
  (pure layout/playback/label helpers). Workflow selector, SVG diagram with layered layout,
  text badges (`ENTRY`/`CALL`/`ROUTE`/`ERROR`) and dashed styling for anything not
  resolved, path switcher (mutually exclusive branches never animated together), Play /
  Pause / Replay / Reset / Prev-step / Next-step / Speed (0.5, 1, 2×), moving request
  marker, active step + edge highlighting, step details with branch condition and
  `file:line`, provenance panel, text alternative, reduced-motion support, honest
  "simulated traversal of a statically reconstructed candidate workflow — not a captured
  runtime request" labelling, loading/empty/error/retry states, and refinement banner.
- **Evidence persistence** — `graph.service.ts` writes and re-reads the new node properties
  (`isAsync`, `isExported`, `workflowEvidence` JSON, size-capped, defensively parsed on
  read) and relationship property `occurrences`, so reloaded graphs keep the workflow data.

---

## 3. Complete technology stack

**Unchanged.** No dependency was added, upgraded or removed in this build —
`backend/package.json` and `frontend/package.json` are byte-identical to the baseline
(TypeScript 5.9/5.6, Express 5.2, Multer 2.4, `unzipper` 0.12, `@babel/parser`+`traverse`
7.29, `neo4j-driver` 6.2, React 18.3, D3 7.9, Tailwind 3.4, Vite 5.4, Vitest 5.0/2.1,
Supertest 7, Testing Library 16, Groq via `fetch`).

New **internal** tech only: SVG rendering with hand-rolled layered layout (no graph
library), `requestAnimationFrame` playback with an injected clock in tests, and JSON
evidence properties stored inside existing Neo4j nodes/relationships.

---

## 4. Flow of execution (current system, Build 05)

```
Browser: tab "Coremation" → fetchWorkflows(repository)
  → GET /api/workflows?repository=
  → workflow.controller.listWorkflows
  → graph.service.fetchGraph(repository)              (Neo4j read, evidence re-parsed)
  → workflow.service.buildWorkflows(repository, graph) (deterministic, bounded)
  → summarizeWorkflow[] → JSON list
select workflow → GET /api/workflows/:id → full Workflow (steps, edges, paths, provenance)
"Improve labels" → POST /api/workflows/:id/refine
  → refine.service.refineWorkflow → cache? → llm.client.chatComplete → Groq
  → parseJsonCompletion → validateRefinement (drop unknown ids, clip lengths)
  → wording only; on any failure: deterministic workflow + refinement.state
Animation: local requestAnimationFrame only — advance()/markerPosition() in coremation.ts
```

Analysis pipeline with the new evidence stages (replaces the Build 04 §2.2 description):

```
ZIP → validate → safe extract → scan → [Phase 1] Babel parse + entities
  (+ hook/object callables, async/exported)
 → [Phase 2] one TypeScript program → symbol resolver
 → [Phase 3] relationships + per-call occurrence evidence (branch, condition,
   sequence, awaited) + unresolved-call collector
 → [Phase 3b] control-flow units + route/request/mount/external evidence
   → attached to File nodes as bounded workflowEvidence
 → [Phase 4] buildGraph (Repository/Directory, dedupe, occurrences preserved)
 → scope annotation → Neo4j (node + relationship evidence properties)
 → REST → Knowledge Graph / Execution Flows / Analysis Report / Coremation
```

---

## 5. Verification / evidence

**Automated (all re-run 2026-10-22, results copied from output, not memory):**

| Check | Command | Result |
| --- | --- | --- |
| Backend tests | `cd backend && npm test` | **13 files / 116 tests passed** (73 baseline + 43 new) |
| Frontend tests | `cd frontend && npm test` | **14 files / 120 tests passed** (78 baseline + 42 new) |
| Backend typecheck | `npm run typecheck` | clean |
| Frontend typecheck | `npx tsc -p tsconfig.json --noEmit` | clean |
| Backend build | `npm run build` | clean (exit 0) |
| Frontend build | `npm run build` | clean (`built in 18.15s`) |

New suites: `coremation.pipeline.test.ts` (26 tests — callbacks, attribution, occurrences,
branch kinds + real conditions, unresolved honesty, recursion-as-evidence, routes, mounts,
requests, request→handler chaining, ambiguity preserved, no-workflow repository,
non-router `.get()` decoys, provenance/fingerprint),
`workflow.api.test.ts` (15 tests — list/get/refine endpoints, 400/404 paths,
guard-ignoring path offering, legacy-graph flag, cache single-call proof, invalid-JSON
fallback, no-secret leakage, validator unit tests including "model cannot add structure or
code"), `frontend/src/coremation.test.ts`
(20 tests — layout determinism, non-overlap, playback maths, speed, marker
interpolation, label/badge rules, reduced motion),
`components/CoremationView.test.tsx` (19 tests — states, controls, path exclusivity, AI
label attribution, marker movement with **zero** network calls, timer cleanup),
plus 3 new `App.test.tsx` tests (tab position after Analysis Report, clean switch back to
the D3 graph, no request before a repository is known).

**Real-code verification (CodeAtlas analysed with its own pipeline, 2026-10-22):**
525 nodes / 959 relationships; **235 `CALLS` edges all carrying occurrences**;
13 routes (all 9 real CodeAtlas endpoints with resolved handler entity ids, plus fixture
routes), 13 requests, 5 mounts, 288 control-flow units, 703 branch records,
1 014 recorded unresolved calls; **12 workflows reconstructed**, **all 12 spanning
frontend → route → handler**, e.g.

```
GET /api/analysis → getAnalysisReport   (19 resolved calls, 7 guarded, 1 HTTP boundary)
  Main path: GET /api/analysis:19 → signatureOf:256 → buildRepoDigest:257
             → chatComplete (await):259 → reportPrompt:262 → normalizeReport:267
             → parseJsonCompletion:270
GET /api/analysis/function → getFunctionSummary
  Main path: :71 → fetchFunctionContext (await):78 → chatComplete (await):110
GET /api/health → health   :34 → verifyConnection (await):39
```

**Defect found and fixed during verification (this build):** the first boundary run
reported **64 "routes"**, most of them false positives (`record.get("n")`,
`byId.get("/settings")`, `request(app).get("/api/x")` from tests, `map.get(k)`). Cause:
route detection keyed on the method name alone. Fixed by requiring a router-shaped
receiver (declared via `Router()`/`express()`/`application()`, or named
`app`/`router`/`server`/`api`) **and** a leading-slash path; a regression fixture
(`test-fixtures/route-decoys`) locks it. Routes went **64 → 13, all genuine**.

**Second finding fixed mid-build:** `enclosingCallableId` originally stopped at a plain
`const value = compute(...)` declarator, which silently dropped attribution for every
call inside a variable initialiser (including `const extracted = await extractZip(...)`
in the real upload handler) — three test failures pointed straight at it; the walk now
continues outward.

**Not verified live:** no Groq request was made in this build (unit tests stub `fetch`
only — no key is used, none is stored anywhere). Manual UI playback in a real browser is
listed as the remaining evidence task.

---

## 6. Known limitations / deferred

- **Static only.** The animation is a simulated traversal of a candidate path; there is
  no runtime instrumentation, so nothing here proves a request executed. Labelled as such
  in the UI.
- **Route coverage is what the pattern check supports:** `router.get("/literal", …)`-style
  registrations on a recognisable router object. Dynamic paths (`router.get(name)`),
  framework metaprogramming, Nest/Fastify/Koa styles and serverless route manifests are
  **not** extracted — nothing is guessed instead.
- **Requests** are recognised from `fetch` and axios-style calls with statically
  resolvable or partially resolvable URLs; `${BASE}/orders/${id}` is recorded with a `*`
  wildcard and `urlStatic: false`, and a URL with no static part at all is recorded as
  unresolved. Wrapped SDK clients and `XMLHttpRequest` are not modelled.
- **Mount resolution** covers `x.use("/prefix", importedRouter)` in the same file. A router
  mounted indirectly (re-exported, built in a loop, applied by a framework plugin) keeps
  its declared path with no prefix.
- **Ambiguity is preserved, not resolved:** several matching handlers stay `ambiguous`;
  Coremation shows both candidates instead of picking one.
- **Sequence is source order, not runtime order.** No branch-predicate evaluation, no
  constant propagation, no data flow: `if (isAdmin)` is recorded as a condition string,
  not evaluated.
- **`unresolvedCalls` is a whole-graph count** (1 014 on this repository, mostly external
  package calls) shown for honesty about completeness, not a per-workflow number.
- **Old stored graphs** (analysed before Build 05) have no evidence: workflows report
  `evidenceVersion: "none"` and the UI tells the user to re-analyse. Nothing was migrated.
- **No authorization** — same as every existing endpoint; workflow routes inherit the
  current development-mode convention rather than inventing a weak auth layer
  (`08-approval-gate.md` D-01/D-03 still open).
- **No source viewer.** Uploads are deleted after analysis, so step navigation shows
  `file:line` plus a clear unavailable explanation rather than opening a file.
- **Deferred:** workflow persistence to a relational store, per-user scoping, export of a
  workflow as Markdown, and cross-repository flow comparison.

---

## 7. Next build targets

1. Manual browser verification of Coremation playback on a real uploaded repository, plus
   one live Groq refinement captured as evidence (key rotated first — Build 04 caveat
   still open).
2. Consume Coremation's evidence path for the proposal's **Module 3**: requirement →
   candidate entity (LLM) validated against the graph → traversal of the now-ordered,
   branch-aware call graph → change-impact + debt/risk report.
3. Optional: `GET /api/workflows/export` (Markdown/JSON) as the first slice of Module 6.
4. Reduce `unresolvedCalls` noise by classifying external-package calls as a distinct
   boundary kind rather than "unresolved".

---

## Related documentation (kept consistent with this build)

- Master flow + proposal alignment: [`README.md`](./README.md) §2, §3, §4, §5, §6, §7, §9
- Graph model (new evidence fields): [`../graph-model.md`](../graph-model.md)
- Diagram pack: [`../diagrams/D2/`](../diagrams/D2/README.md)
- Build 04 log (closes here): [`./build-04-analysis-reports.md`](./build-04-analysis-reports.md)

---

## Proposal alignment (required section 10)

| Aspect | Position after Build 05 |
| --- | --- |
| Module advanced | **Module 1** (routes + control-flow evidence, honest unresolved handling), **Module 2** (guided-trace gap narrowed: candidate paths are now ordered, branch-split and cross-boundary), **Module 4** (requests/routes become first-class searchable evidence) |
| Proposal gaps closed | **W6** API routes now extracted (within the supported pattern); **W4** unresolved relationships are recorded, not silent; **W8** flows are no longer only client-side heuristics — a server-side reconstruction now exists |
| Proposal gaps **not** closed | **Module 3 remains unbuilt** — Coremation is *adjacent* groundwork (paths + branches), **not** the Change-Impact Analyzer: no natural-language requirement intake, no requirement-specific debt/risk score; **Module 5** and **Module 6** still 0 % |
| New scope beyond the proposal | Coremation itself (animated candidate-workflow visualisation) is **not** in proposal v1.3 — it is a meeting-confirmed feature. Needs a proposal change record to stay aligned |
| Warning ids | Resolved: W4, W6 (pattern-scoped), W8 (narrowed). New: **W17** (Coremation is extra scope), **W18** (static-only animation must never be described as a runtime trace), **W19** (route/request coverage is pattern-bound; dynamic registrations unsupported) |

## Sign-off

| | |
| --- | --- |
| Build opened by | Muhammad Abdullah |
| Date opened | 2026-10-22 |
| Status | Open — closes when Build 06 begins |
