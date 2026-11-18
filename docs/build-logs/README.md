# CodeAtlas — System Overview (natural-language guide for AI tools)

CodeAtlas takes a JavaScript/TypeScript project (as a `.zip`), works out how that
project is built — its files, folders, classes, functions, methods and how they
connect — and turns the result into an interactive graph a developer can explore in
the browser. On top of that graph it adds an AI explanation layer that describes what
the static analysis already proved. The AI never decides what is in the graph; it only
reads measurements and code snippets the graph produced, and puts them into words.

This document is written in plain, natural language in three sections:

1. **The technology stack and how it executes** — what each technology is and the order
   in which the pieces pass work to each other.
2. **Every feature explained** — what each part of the product does, one by one.
3. **The complete project workflow** — the full journey of one repository, start to finish.

A note on current state: the project is at **Build 07 (upload-and-async-analysis)**. Uploads are
now **asynchronous**: a logged-in user's ZIP is stored in **private Cloudflare R2 storage** and
queued as a row in a PostgreSQL `analysis_jobs` table; a **separate worker process** claims the
job, runs the existing analysis pipeline and persists the graph, while the dashboard shows the
job's **real** status (surviving a refresh) before opening the finished graph. CodeAtlas remains
multi-user (**Supabase Auth**, per-user repository ownership, Row Level Security). The old
**Execution Flows** tab was removed in Build 05. Because the worker is a separate process, the
in-memory graph fallback is per-process: **an asynchronously analysed graph is served from Neo4j**
(the fallback still covers same-process synchronous use).

**Build logs:** Build 01 `build-01-prototype-test01.md` · 02 `build-02-kg-relevance-ui.md` ·
03 `build-03-graph-navigation.md` · 04 `build-04-analysis-reports.md` · 05 `build-05-coremation.md`
(closed) · 06 `build-06-auth-and-ownership.md` (closed) · 07
[`build-07-upload-and-async-analysis.md`](./build-07-upload-and-async-analysis.md) (current).

---

## Section 1 — Technology Stack and How It Executes

### 1.1 The stack at a glance

| Layer | Technology | What it is used for |
| --- | --- | --- |
| Language / runtime | TypeScript on Node.js 18+ | One typed language from the API down to the browser |
| Web API | Express 5 + CORS | Serves the REST endpoints the dashboard calls |
| Upload handling | Multer 2 | Receives the uploaded ZIP file (50 MB limit) |
| Archive extraction | `unzipper` 0.12 | Unpacks the ZIP safely into a folder on disk |
| Code parsing | Babel (`@babel/parser`, `@babel/traverse`) | Reads each source file into an abstract syntax tree (AST) |
| Symbol resolution | TypeScript Compiler API | Builds one type-aware program so calls resolve to the real target |
| Graph database | Neo4j 5 + `neo4j-driver` 6 | Persists the graph (entities + typed relationships) |
| Config | `dotenv` | Loads `backend/.env` once, independent of the working directory |
| Accounts + database | Supabase **PostgreSQL** + `@supabase/supabase-js` 2.119 | Auth users, `profiles`, and `repositories` (ownership); scoped by Row Level Security |
| Authentication | Supabase **Auth** | Email/password signup, login, logout, session restore, and server-side access-token verification (JWT) |
| Object storage | Cloudflare **R2** (S3-compatible) + `@aws-sdk/client-s3` | Private storage of uploaded ZIPs; downloaded by the worker |
| Job queue + worker | PostgreSQL `analysis_jobs` + a separate Node worker | Durable async jobs, claimed atomically with `FOR UPDATE SKIP LOCKED` |
| AI layer | Any OpenAI-compatible `chat/completions` endpoint (Groq by default, model `openai/gpt-oss-120b`) via the built-in `fetch` | Turns measured graph facts into readable text; no SDK, no extra packages |
| Frontend | React 18 + D3 7 + Tailwind CSS 3, built by Vite 5 | Interactive force-directed graph and the tabbed dashboard |
| Testing | Vitest (backend + frontend), Supertest, Testing Library, jsdom | Automated tests for the pipeline, API, persistence and UI |
| Infrastructure | Docker Compose (Neo4j only) | One command to start a local Neo4j for the demo |

There are **three processes and three services**:

- `backend/` (**API**) — Express REST API + analysis engine, runs on **http://localhost:5000**.
- `backend/` (**worker**) — a **separate `node dist/worker.js` process** that runs queued jobs;
  it must run persistently in production.
- `frontend/` — the browser dashboard, runs on **http://localhost:5173** (its dev server
  proxies any `/api/...` request to port 5000, so there are no CORS problems in development).
- **Supabase** — Auth + PostgreSQL (accounts, ownership, and the `analysis_jobs` queue).
- **Cloudflare R2** — private object storage for the uploaded ZIPs.
- **Neo4j** — runs on Bolt port **7687** (HTTP console on 7474). It is required for asynchronous
  graphs to be served back, because the in-memory fallback is per-process.

### 1.2 How the stack executes (the hand-offs, in order)

Think of it as a relay where each technology hands its output to the next:

1. **React (browser)** sends the chosen ZIP to the backend with `POST /api/repositories/analyze`.
2. **Vite's dev proxy** forwards that `/api` call to the **Express** server on port 5000.
3. **Express** routes the request; the **Multer** middleware streams the file into a temp
   uploads folder.
4. The backend validates that it is really a ZIP (file-name extension **and** the `PK`
   magic bytes), then **`unzipper`** extracts it into a fresh folder, skipping any entry
   that would escape the target folder (zip-slip protection).
5. **Babel** parses each source file into an AST and the **entity extractor** turns the AST
   into graph nodes (File, Class, Function, Method).
6. The **TypeScript Compiler API** builds a single program over all files, so the
   **relationship extractor** can resolve what each import and each call really points to,
   and produce graph edges (CONTAINS, IMPORTS, CALLS, EXTENDS).
7. The **graph builder** assembles everything: it adds the Repository node and derived
   Directory nodes, de-duplicates nodes, and drops dangling/duplicate/self edges. A final
   **scope pass** tags each file with a category and whether it is in the default view.
8. The finished graph is handed to the **Neo4j driver**, which writes it (scoped to this
   repository). If Neo4j is unreachable, this step is skipped and the graph is kept **in
   memory** instead — either way the graph is still returned.
9. **Express** returns the graph as JSON; **React + D3** render it as an interactive
   force-directed graph.
10. Later, when the user opens an AI feature, the **backend** reads the stored graph (from
    Neo4j, or from the in-memory fallback), builds a small measured summary, and sends it
    to the **OpenAI-compatible LLM endpoint**. The model replies with text, which the
    frontend displays. The model is never allowed to invent graph content.

A key architectural rule runs through all of this: **the backend builds the graph, the
frontend only renders what the API returns.** The frontend never constructs graph
semantics on its own. Physical machine paths are also kept separate from the
repository-relative paths used in graph IDs, so no machine-specific path ever leaks into
the graph.

---

## Section 2 — Every Feature Explained

### 2.1 ZIP upload and safe ingestion
The user picks a `.zip` in the **UploadPanel** and clicks **Analyze repository**. The
backend rejects anything that is not a genuine ZIP up front (checking both the file
extension and the `PK` magic bytes), so a `.rar`, `.7z` or renamed file returns a clear
HTTP 400 instead of a confusing parser error. A valid archive is extracted into a
timestamped folder; every entry is checked so a malicious `../../` path (zip-slip) is
skipped. If the archive contains a single top-level folder (the usual "project folder"
layout), the analyser descends into it to find the real repository root. After analysis
the temp upload and the extraction folder are deleted (set `KEEP_EXTRACTED=true` to keep
them for debugging).

### 2.2 The static analysis pipeline (the core engine)
This turns source code into a graph, in four phases:

- **Phase 1 — parse and extract entities.** Every `.ts/.tsx/.js/.jsx` file is parsed with
  Babel (plugins chosen by file extension). Each file always yields a **File** node;
  classes, function declarations, class methods, and — importantly — `const x = () => {}`
  / `const f = function () {}` / hook-wrapped `const x = useCallback(() => {}, [])`
  declarations all become **Function** entities. Function nodes also capture a short
  `sourceSnippet` of their real code, so the AI features can describe the implementation
  even after the ZIP has been deleted.
- **Phase 2 — build a type program.** One TypeScript Compiler API program is created over
  all files, which is what lets calls resolve through real type information rather than
  string matching.
- **Phase 3 — extract relationships.** Edges are emitted with provenance: **CONTAINS**
  (file → class, class → method, file → function), **IMPORTS** (a relative import resolved
  to a real file, including ESM `.js` imports that point at `.ts` sources), **CALLS**
  (each call resolved to its true target; nested calls like `outer(inner())` resolve to the
  innermost one), and **EXTENDS** (matched by class name, same file first). Each edge
  records *how* it was found: `derived`, `resolved`, or `name-match`.
- **Phase 4 — assemble and validate.** The graph builder creates the Repository node,
  derives Directory nodes from file paths, de-duplicates nodes, and removes dangling
  edges, self-loops and duplicates. Then the scope pass annotates relevance.

Fault tolerance is built in: a file that fails to parse is logged and skipped rather than
aborting the whole run, and an error in one file's relationships cannot stop the others.
Unresolved imports and calls are simply omitted or recorded — never guessed.

### 2.3 Workflow evidence (Build 05 groundwork)
Rather than adding new node or edge types, each **File** node carries a bounded JSON blob
called `workflowEvidence`. It contains Express route registrations (`router.get("/x", …)`),
`app.use("/prefix", router)` mounts, outbound HTTP requests (`fetch`, axios-style), the
control-flow shape of each callable (if/else-if/else, switch, ternary, try/catch/finally,
throw, return, loops — with the real condition text sliced from the source), unresolved
calls (with a reason), and recursive "self calls". Every `CALLS` edge also keeps every
concrete call site as an `occurrence` (line, column, branch kind, condition, awaited flag,
and source-order sequence). Storing this as evidence means the graph, filters, search and
reports stay exactly as they were — nothing existing breaks.

### 2.4 Neo4j persistence with an in-memory fallback
The finished graph is written to Neo4j. Labels and relationship types come from
allow-lists, so code content can never inject Cypher. Re-analysing a repository deletes
only that repository's nodes first, so writing is idempotent and other repositories are
untouched. Persistence is **best-effort**: if Neo4j is down, the write is skipped with a
warning and the graph is still returned (with `persisted: false`). To keep the features
working in that case, the backend also keeps the most recent graphs **in memory**
(`graph.store.ts`, up to 8 repositories); the graph-read functions fall back to that
in-memory copy when Neo4j is unavailable or empty. This is why the app is fully usable
without a database.

### 2.5 The REST API
A small, predictable JSON API: health check; ZIP analysis; read-back of a stored graph
(optionally scoped to one repository); the list of stored repositories; the four AI/
workflow endpoints (report, function summary, workflow list, workflow detail, workflow
refinement). Details are listed in Section 3.

### 2.6 Knowledge Graph tab (the main view)
A D3 force-directed graph: zoom, pan, drag nodes, click to select, and neighbour
highlighting that dims everything unrelated. Labels are shown for all nodes on small
graphs and thinned to the important types on large ones. There is an explicit **Fit
graph** action, and view state (zoom, pan, dragged positions) persists across filter
changes, searches and tab switches; a fresh layout is auto-fitted once, only when a
different repository is loaded.

- **Filters** (reversible, never mutate the source graph): scope Application ↔ Full,
  node type, relationship type, directory, and a "focus selected plus neighbours" mode.
- **Search**: find any node by name or path, jump to it, and — if it is currently hidden
  by filters — offer to reveal it by relaxing exactly the filters that exclude it.
- **Architectural icon overlay** (experimental, visualisation-only): small heuristic icons
  for roles like database / auth / api, clearly labelled as guesses that may be wrong.
- **Details panel**: clicking a node shows its type, file path, line range, and its
  outgoing and incoming relationships (each clickable, so you can walk the graph). For a
  **Function** node it also shows an AI **Core purpose** line (see 2.8).

### 2.7 Analysis Report tab (AI)
The backend measures the stored graph (node/relationship counts, files per category,
fan-in/fan-out leaders, largest files, busiest directories, import-cycle count) into a
compact digest, then asks the LLM for a structured **scalability and sustainability
report**: a summary, two 0–10 scores with verdicts and severity-tagged factors,
strengths, risks, prioritised recommendations, and explicit limitations. The result is
normalised and capped server-side. The profile is grounded only in measured metrics — the
model is told never to invent files or numbers.

### 2.8 "Core purpose" function summaries (AI)
When a Function node is selected, the backend takes that function's captured
`sourceSnippet` plus its callers and callees (from CALLS edges) and asks the LLM for a
single-sentence, ≤ 25-word description of the function's purpose. This is the other
grounding route: it reasons over the real implementation text, not just counts.

### 2.9 Coremation tab (candidate workflows, Build 05)
Coremation reconstructs **candidate workflows** deterministically from the graph and the
workflow evidence, and animates a simulated walk along one path. It shows a selector of
candidate workflows, an SVG diagram laid out by graph depth, a path switcher (main /
branch / error paths), playback controls (play, pause, replay, reset, prev/next step,
speed), a moving marker, step details with branch condition and `file:line`, a provenance
panel, and a text alternative for accessibility. A client request can be followed across
the HTTP boundary into its route handler and onward, so one workflow can span frontend and
backend. Anything unresolved or ambiguous is drawn dashed and labelled, so a guess can
never look like a fact. There is also an optional **"Improve labels (AI)"** action that
asks the LLM to *re-word* titles and labels only — it can never add, remove, reorder or
rename steps, and the deterministic workflow is returned unchanged if the key is missing,
the provider errors, or the output fails validation.

### 2.10 AI safeguards and cost control (applies to 2.7–2.9)
The API key lives only in the gitignored `backend/.env` and is read only in the backend.
Both system prompts declare repository content to be **data** whose embedded instructions
must never be followed (prompt-injection defence). Report and summary results are cached
by repository + model id + prompt version (+ a graph signature for reports), concurrent
duplicate requests share one in-flight call, and a successful re-analysis invalidates the
caches — so a changed graph can never serve stale AI output. Provider errors map to clear
messages (401/403 → configuration message, 429 → retriable 503, timeouts → 504). Because
reasoning-capable models otherwise spend the token budget on hidden reasoning and return
empty text, every request sends `reasoning_effort: "low"`.

### 2.11 Automated tests
Vitest suites cover the backend (API smoke and validation, a fixture-driven pipeline,
module resolution, classification, scope, graph building, LLM boundary, and a gated live
Neo4j round-trip that self-skips when the database is down) and the frontend (pure filter/
search/layout/coremation logic plus component interaction tests). They now also cover
authentication and two-user ownership, using mocked Supabase clients so **no real credentials
are needed** to run them. The suites currently run **15 backend files / 127 tests** (126
passing, 1 gated Neo4j round-trip skipped) and **14 frontend files / 124 tests**, all green.

### 2.12 Accounts, authentication and session (Build 06)
A user creates an account (name, email, password) or logs in on a CodeAtlas-styled screen;
Supabase sends a confirmation email when confirmation is enabled. The session is persisted and
restored after a browser refresh, so a logged-in user returns straight to the dashboard. A
"forgot password" link sends a reset email, and the recovery link opens a "set a new password"
screen. Logout clears the session and returns to the login screen. The dashboard is a protected
boundary: without a session, only the login screen is reachable.

### 2.13 Repository ownership and multi-tenancy (Build 06)
Every uploaded repository is owned by the signed-in user, stored in Supabase PostgreSQL
(`repositories`, with the account in `profiles`). The repository's **UUID is the stable, unique
identifier** used to scope the graph in Neo4j, the in-memory fallback and the AI caches — the
human name is display only. Every graph, report, function-summary and Coremation request first
verifies that the caller owns the repository (else a non-disclosing 404), so one account can
never read, re-analyse or delete another account's data. The previous password-less,
single-tenant behaviour (a global graph endpoint and a global repository list) is gone.

### 2.14 Asynchronous upload and the analysis worker (Build 07)
A ZIP upload no longer waits for analysis. The API stores the archive in **private Cloudflare R2**
(key `repositories/{userId}/{repositoryId}/source.zip`) and creates an `analysis_jobs` row, then
answers **202** with the repository and job ids. A **separate worker process** claims the pending
job atomically (`FOR UPDATE SKIP LOCKED`, via the `claim_analysis_job` SQL function), downloads
the ZIP, extracts it safely, runs the existing analysis pipeline, persists the graph and updates
the job's real **stage** and **progress** in PostgreSQL. Jobs retry in a bounded way (default 3
attempts); a job whose worker died is recovered after a stale timeout; permanent failures (an
unreadable archive, or one with no supported files) are not retried. The dashboard shows the job's
persisted status (queued / processing / completed / failed) with its real stage, and resumes
tracking after a refresh — never a simulated progress bar. There is **no Redis or other queue
infrastructure**; PostgreSQL is the queue.

---

## Section 3 — The Complete Project Workflow (start to finish)

This is the whole journey of one repository through the system.

**Step 1 — Start the system.** Two terminals are used (there is no root `package.json`):
the backend (`cd backend && npm run dev` → port 5000) and the frontend
(`cd frontend && npm run dev` → port 5173). Neo4j is started separately
(`docker compose up -d neo4j`, Neo4j Desktop, or Aura). If Neo4j is not running, everything
still works — only persistence is skipped. The required `backend/.env` holds the Neo4j
connection details, the optional `LLM_API_KEY` (with `LLM_API_BASE_URL`, `LLM_MODEL`,
`LLM_API_TIMEOUT_MS`), and the `SUPABASE_URL` / `SUPABASE_PUBLISHABLE_KEY` /
`SUPABASE_SECRET_KEY` values (Supabase's current key names); `frontend/.env.local` holds
`VITE_SUPABASE_URL` / `VITE_SUPABASE_PUBLISHABLE_KEY`. Use `127.0.0.1` rather than `localhost`
for Neo4j to avoid an IPv6 connection-refused.

**Step 1b — Create an account and log in.** The dashboard is protected. A new user signs up
(name, email, password) and confirms their email if confirmation is enabled; returning users
log in, and the session is restored automatically after a refresh. Only then is the dashboard
reachable.

**Step 2 — Upload and queue.** The user chooses a `.zip` and clicks **Analyze repository**. The
browser sends the Supabase access token and POSTs the file to `/api/repositories/analyze`; Vite
proxies it to Express; the backend verifies the token, checks the ZIP extension and `PK` magic
bytes, creates a repository record owned by that account, uploads the archive to **private
Cloudflare R2** storage and creates an `analysis_jobs` row — then replies **202** with the
repository and job ids. No analysis happens in this request.

**Step 3 — The worker processes the job.** A **separate worker process** atomically claims the
pending job (`FOR UPDATE SKIP LOCKED`), downloads the ZIP from R2, extracts it with `unzipper`
(zip-slip protected, descending into a single top-level folder if present), and updates the job's
real stage and progress in PostgreSQL as it goes (downloading → extracting → parsing →
persisting). It then runs the pipeline (Step 4) and persists the graph (Step 6).

**Step 4 — Analyse the code.** The pipeline orchestrator runs four phases: it scans the
source files (skipping `node_modules`, `dist`, `.git`, etc.), Babel-parses each one and
extracts entities; it builds one TypeScript program; it extracts relationships (CONTAINS,
IMPORTS, CALLS, EXTENDS) with provenance; and it assembles and validates the graph
(Repository + Directory nodes, de-duplication, dangling/self/duplicate edge removal). It
also captures workflow evidence per file (routes, requests, control flow, call
occurrences) and a source snippet per function.

**Step 5 — Annotate relevance.** A final pass tags each File node with a category
(source / test / config / fixture / generated / declaration) and marks every node with
whether it belongs in the default "Application" view. This only annotates — it never
removes anything.

**Step 6 — Persist (best effort).** The worker writes the graph to Neo4j, scoped to this
repository. If Neo4j is unreachable the write is skipped and the job records
`graphPersisted: false` — note the worker's in-memory copy is **not** visible to the API process,
so asynchronous graphs need Neo4j.

**Step 7 — Track and render.** The dashboard polls `GET /api/jobs/<id>` and shows the job's real
status, stage and progress (a refresh resumes it from the backend). On completion it loads
`GET /api/graph?repository=<id>` and renders the **Knowledge Graph** tab: the force simulation
settles, the view auto-fits once, and the user can zoom, pan, drag, click, filter, and search.

**Step 8 — Explore the graph.** Clicking a node opens the **Details panel** with its
metadata and its outgoing/incoming relationships, each clickable to keep walking the
graph. Filters and search make large graphs manageable; the experimental icon overlay can
be toggled for a visual hint of architectural roles.

**Step 9 — Read the AI report.** Switching to the **Analysis Report** tab asks the backend
to build the metrics digest and generate the scalability/sustainability report. The
backend reads the stored graph (Neo4j or the in-memory fallback), grounds the prompt in
the measured numbers, calls the LLM, normalises the JSON reply, and returns it. The tab
shows the six sections with severity chips and a regenerate action; the result is cached
until the graph changes.

**Step 10 — Summarise a function.** Selecting a **Function** node triggers a request for a
one-line **Core purpose** summary, grounded in that function's captured source snippet and
its CALLS context. It appears below the node's statistics, with loading and error states,
and is cached per repository + node.

**Step 11 — Reconstruct and play a workflow (Coremation).** Opening the **Coremation**
tab asks the backend to reconstruct candidate workflows from the graph and its evidence.
The backend finds entry candidates (route handlers and exported callables that start
something), walks the ordered, branch-aware CALLS occurrences (breaking cycles and
respecting hard limits), follows a client request through its route into the handler, and
returns the workflows with full provenance. The tab renders the workflow, lets the user
switch between its main/branch/error paths, and animates a simulated traversal with a
moving marker. Playback is entirely local — animation never issues a request. An optional
**Improve labels (AI)** action asks the model to re-word titles and labels only, validated
field by field; structure always comes from the deterministic reconstruction.

**Step 12 — Reload later.** The user can leave and come back: **Load stored graph** calls
`GET /api/graph?repository=<id>`, which — after checking that the caller owns that repository —
reads the graph back from Neo4j (or the in-memory fallback) so the same graph re-renders.

**In one line:** sign up and log in (Supabase Auth) → upload a ZIP owned by your account → store
it in private Cloudflare R2 and queue a PostgreSQL job → a separate worker claims it and safely
extracts → parse with Babel and resolve symbols with the TypeScript Compiler API → build and
validate a typed knowledge graph with call occurrences and workflow evidence → persist it to Neo4j
→ the dashboard tracks the job's real status and loads the graph when it completes → explore it as
an interactive graph, read an AI scalability/sustainability report, get AI one-line function
summaries, and animate deterministically reconstructed candidate workflows — with the AI strictly
describing what static analysis already proved.

> **Compatibility note.** Graphs persisted **before Build 06** were keyed by repository name and
> are therefore unowned: no account can reach them, and re-analysing a repository under an
> account creates a fresh, owned record. This is intentional — nothing is migrated silently.
