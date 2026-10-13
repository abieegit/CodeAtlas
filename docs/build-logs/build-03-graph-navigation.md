# Build Log — Build 03 — graph-navigation

| Field | Value |
| --- | --- |
| Unique file name | `build-03-graph-navigation.md` |
| Build number | 03 |
| Build name | graph-navigation (provisional, to be confirmed at the next meeting) |
| Status | Open |
| Date opened | 2026-10-13 |
| Date closed | — (open) |
| Author | Muhammad Abdullah (47618) |
| Scope | F1 — graph search, persistent navigation, architectural icon overlay |

---

## 1. Build context — meeting goal & targets

**Goal:** three incremental improvements to the existing F1 prototype (no rewrite, stack
unchanged): (1) search for graph entities and navigate to results; (2) an optional, toggleable
icon overlay for major architectural components; (3) find and fix the actual cause of the
reported delayed viewport reset so user navigation persists.

**Targets set for this build:**

| # | Target | Result |
| --- | --- | --- |
| T1 | Diagnose the exact cause of the ~3-second viewport reset. | Met |
| T2 | Fix it structurally (no timers/concealment); zoom, pan and dragged positions persist. | Met |
| T3 | Explicit Fit Graph action; fresh layout only for a new repository, fitted once. | Met |
| T4 | Graph search (6 entity types, case-insensitive partial, client-side). | Met |
| T5 | Selecting a result locates, navigates, highlights and opens details. | Met |
| T6 | Filter-hidden results are explained and can be revealed explicitly. | Met |
| T7 | Toggleable architectural icon overlay with warning; visualisation-only. | Met |
| T8 | Controls integrated into the compact sidebar; no unrelated redesign. | Met |
| T9 | Regression tests per phase; reproducible viewport test (not visual inspection). | Met |
| T10 | No changes to AST pipeline, graph schema, Neo4j persistence or the uploaded ZIP. | Met |

**Out of scope (unchanged):** guided tour, change-impact analysis, contextual search as a
feature (search here is navigation, not ranked retrieval), vulnerability analysis, AI/LLM,
auth/billing. Six node types, four relationship types, API paths and persistence unchanged;
no new dependencies.

---

## 2. Root cause of the reported viewport reset

Two compounding defects in `GraphView.tsx`:

1. **`simulation.on("end", fitToView)`** — d3 fires `end` every time a simulation run cools
   below `alphaMin`: once on the initial layout (~5 s) and again ≈3 s after every node drag
   (which reheats with `alphaTarget(0.3)`). Each firing ran a 500 ms transition that
   overwrote the user's zoom/pan — the reported "reset after approximately three seconds".
2. **Full re-initialisation on any filter change** — the effect keyed on `[graph, onSelect]`
   and App passed `visibleGraph` (a new object identity per filter change). Every re-run
   wiped the SVG, re-cloned nodes **without coordinates** (dragged positions lived only in
   the old simulation clones), reset zoom to identity and scheduled another delayed end-fit.

### Fix (structural)

- The unconditional end-fit is gone. A fresh layout is auto-fitted **once**, guarded by an
  interaction flag (`wheel`/`pointerdown`/`dblclick` listeners registered before d3-zoom's,
  because d3-zoom calls `stopImmediatePropagation`), so navigation is never overridden.
- Zoom transform is preserved across re-renders (captured per `zoom` event, re-applied after
  rebuild). Node coordinates persist in an id-keyed position map (recorded on effect cleanup,
  re-seeded on rebuild, same layout key only); preserved layouts reheat gently (`alpha 0.3`).
- `layoutKey` (repository name) decides fresh vs preserved: a new repository resets
  positions, transforms to identity and auto-fits once.
- GraphView exposes an imperative handle: `fitToView()` (Fit Graph button) and
  `revealNode(id)` (search navigation; pending reveals are consumed after filter-driven
  re-renders). The graph stays mounted when the Execution Flows tab is shown, so tab
  switching also preserves the view.
- jsdom/test hardening: `zoom.extent` uses a live-size accessor (default extent reads
  `viewBox.baseVal`, absent in jsdom); translateExtent left at its unbounded default.

---

## 3. Features delivered (current system)

**Graph search (Feature 1)**
- `search.ts` (pure `searchGraph`): case-insensitive partial matching on name and file path
  across Repository, Directory, File, Class, Function, Method; ranked (name-prefix →
  name-contains → path-only, then alphabetical, stable ids); default limit 20.
- `SearchPanel.tsx` in the sidebar (graph view only): results show name, type and file path;
  useful no-results state; clear button.
- Selecting a visible result selects the node, pans/zooms the viewport to it (`revealNode`,
  no simulation restart), highlights it plus immediate neighbours and opens the details panel.
- If the node is hidden by filters, the row explains why (`hiddenReasons`: node-type, scope,
  directory, focus) and offers **Reveal & select**, which applies `revealNodeInFilters` — the
  minimal filter changes that make the existing node visible. No duplicates are created.

**Architectural icon overlay (Feature 2)**
- `archRoles.ts` (pure `classifyArchitecturalRole`): deterministic keyword rules over
  name+path with fixed precedence (payment → auth → login → database → users → api →
  external), word-boundary guards against substring collisions, and test/spec/fixture
  exclusion. Ambiguous nodes stay unclassified. Applied only to existing nodes
  (Directory/File/Class/Function/Method).
- Icons are stroke-based SVG `<symbol>` artwork declared once in `<defs>` and referenced per
  node with `<use>` (badge + icon), so ordinary nodes stay lightweight.
- **Icons: On/Off** toggle in the sidebar toolbar (`aria-pressed`). Toggling runs a DOM-only
  effect: it never restarts the simulation, never moves the viewport and never touches graph
  data, ZIP or source files. While enabled, a restrained red note explains that
  classifications are heuristic guesses that may be wrong and may affect readability.
- Visualisation-only: no AST/parser changes, no graph entities, no Neo4j writes.

**Persistent navigation (Feature 3)** — see section 2. Adds the explicit **Fit graph**
action; zoom/pan survive selection, details-panel updates, search, icon toggles, tab
switches and filter changes; dragged nodes stay where released.

**Dashboard integration (Feature 4)**
- Search input, toolbar (Fit graph, Icons toggle) and the existing filter panel grouped in
  the sidebar; details panel unchanged; monochrome theme preserved; accessible states
  (`aria-label`, `aria-pressed`, `role="note"`, `role="status"`).

**Preserved from Build 02:** ZIP ingestion, AST extraction (Babel + TS resolver) with
evidence, relevance scope, Neo4j persistence, REST API, React + D3 graph, reversible
filters, execution-flows view, automated suites.

---

## 4. Complete technology stack

Unchanged from Build 02 (see [`build-02-kg-relevance-ui.md`](./build-02-kg-relevance-ui.md)
section 3): Node 18+, Express 5, Babel/TypeScript Compiler API, neo4j-driver, Vitest,
Supertest; Vite 5, React 18, D3 7, Tailwind 3, Testing Library. **No dependencies added.**

---

## 5. Flow of execution (new/changed paths)

**Search navigation** — query typed → `searchGraph` (client-side, over the full loaded
graph) → result click → if visible: `setSelected` + `GraphView.revealNode(id)` (viewport
transition to the node's current simulation coordinates, scale ≥ 1); if hidden:
`revealNodeInFilters` → `setFilters` → GraphView rebuilds with preserved coordinates → the
pending reveal is applied after the rebuild → details panel opens.

**Layout lifecycle** — analyze/load sets `layoutKey = repository`; GraphView compares it with
the previous key: changed → clear position map, identity transform, full-strength simulation,
one guarded auto-fit on settle; unchanged → re-seed coordinates, restore transform, gentle
reheat, no auto-fit.

**Icon overlay** — toggle flips `showIcons` → DOM-only effect removes/adds `g.ca-icon-badge`
elements (`circle` + `use href="#ca-icon-<role>"`) on classified node groups.

---

## 6. Data model summary & 7. REST API surface

**Unchanged from Build 02** (six node types, four relationship types, evidence, categories;
`/api/health`, `/api/repositories/analyze`, `/api/graph[?repository=]`, `/api/repositories`).

---

## 8. Verification / evidence

- **Frontend tests:** `npm test` → **11 files / 70 tests, all passing** — including the
  reproducible viewport regression suite (`GraphView.test.tsx`, 10 tests: user zoom survives
  the full settle window; transform restored after same-layout re-render; one-time auto-fit
  for fresh layouts; coordinates persist; new layout on key change; imperative fit/reveal;
  icon toggles preserve viewport/positions/data), search ranking/limit/no-results,
  hidden-reason + reveal helpers, SearchPanel behaviour, and App-level integration
  (search → details; reveal → details) with a mocked API client.
- **Backend tests:** `npm test` → **8 files / 48 tests, all passing** (includes the live
  Neo4j round-trip). Type-check and production build clean on both packages
  (frontend bundle 231.36 kB / 76 kB gzip).
- **Real repository end-to-end (HTTP):** `class-validator.zip` → `POST
  /api/repositories/analyze` → **461 nodes / 1 148 relationships, persisted: true**,
  categories `{ source 147, test 3, config 2 }`, all 1 148 relationships carry evidence;
  `GET /api/graph?repository=class-validator` returned the identical 461/1 148 with evidence
  and scope intact; `GET /api/repositories` listed it.
- **Real-browser session (Chrome via CDP, dev servers):** upload → analyze → graph renders
  (461 node groups); search "Validator" returned 13 ranked results across all six types;
  clicking the `Validator.ts` file result opened the details panel for
  `class:src/validation/Validator.ts:Validator` with evidence-bearing relationships; icon
  overlay On rendered 6 badges (`IsJWT*` → auth, `IsMongoId*` → database) reused from the 7
  `<symbol>` defs; **zoom (k=2) + node drag, then 6 s wait → k still 2** (the pre-fix code
  reset the viewport here); Fit graph refit the whole graph (k ≈ 0.112); screenshot taken.
- **Classifier corrections driven by the live session:** `stripEmptyErrors` matched the
  `stripe` keyword (substring) and `IsPassportNumber` matched `passport`; the rules now use
  word boundaries for `stripe|paypal|braintree|cart` and drop the standalone `passport`
  keyword; both cases are locked in by regression tests.

---

## 9. Known limitations / deferred

- Icon classification is name/path heuristic: it can be wrong even with boundaries (e.g.
  Passport.js vs passport documents remains ambiguous); the UI warns about this while the
  overlay is enabled. The overlay adds one badge per classified node (O(matched nodes) DOM).
- Search caps at 20 results with a refine hint; path-only matches rank below name matches.
- Reveal makes a node visible by adjusting filters; it does not reorder the layout (nodes
  keep positions via the position map).
- No coverage thresholds or CI yet; tests run manually. Resize handling is unchanged
  (dimensions re-read on re-render; fit uses live dimensions on demand).
- All Build 02 limitations still apply (heuristic classification of files, name-based
  `EXTENDS`, ZIP-only input, no auth, full re-analysis, sequential Neo4j writes).

---

## 10. Next build targets

- CI (GitHub Actions) running tests/typecheck/build for both packages with coverage gates.
- Incremental re-analysis groundwork; PostgreSQL/auth layer per the proposal.
- Relevance scoring (centrality/fan-in) layered on the categories.
- Module 2 scope: guided project tour and/or contextual navigation & search as a ranked
  retrieval feature (this build ships navigation search only).

---

## Related documentation (kept consistent with this build)

- Build-log standard & index: [`./README.md`](./README.md)
- Graph model: [`../graph-model.md`](../graph-model.md)
- System diagrams: [`../diagrams/`](../diagrams/README.md)
- F1 system guide: [`../../CodeAtlas_F1_System_Guide.txt`](../../CodeAtlas_F1_System_Guide.txt)

---

## Sign-off

| | |
| --- | --- |
| Build opened by | Muhammad Abdullah |
| Date opened | 2026-10-13 |
| Status | Open — closes when Build 04 begins |
