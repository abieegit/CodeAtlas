# Build Log — Build 07 — upload-and-async-analysis

| Field | Value |
| --- | --- |
| Unique file name | `build-07-upload-and-async-analysis.md` |
| Build number | 07 |
| Build name | upload-and-async-analysis |
| Status | **Open** (implementation landed and verified; closes when Build 08 begins) |
| Date opened | 2026-11-18 |
| Date closed | — (open) |
| Author | Muhammad Abdullah (47618) |
| Scope | Asynchronous repository upload: private Cloudflare R2 storage + a durable PostgreSQL job queue + a separate analysis worker, with real job status in the frontend that survives refreshes |
| Regression baseline | Backend 16 files / 128 tests (127 passing, 1 skipped/gated), frontend 14 files / 124 tests — all passing before the first edit; **no test deleted, weakened or skipped** |
| Result | Backend **20 files / 152 tests (151 passing, 1 skipped/gated)**, frontend **15 files / 128 tests** — all passing; typecheck and production builds clean in both packages; worker compiles to `dist/worker.js` |

---

## 1. Audit findings (Phase 1)

The full audit is in the approved plan (`~/.commandcode/plans/build-07-upload-and-async-analysis.md`).
Key facts, verified against the real code:

- **Upload** was `POST /api/repositories/analyze` → `requireAuth` → Multer (`dest: uploadsDir`,
  50 MB) → `analyzeRepositoryUpload` (`repository.controller.ts`).
- **Analysis ran inside the HTTP request**: the controller `await`ed
  `analyzeAndStore(repositoryPath, repositoryName, repositoryId)`.
- **Reusable pieces existed already**: `extractZip` (zip-slip protected), `analyzeRepository`
  (pure), `analyzeAndStore`, `saveGraph`/`fetchGraph`, `requireAuth` / `requireOwnedRepository`,
  `findRepositoryForUser`, `supabaseAdmin`.
- **Missing**: any queue/worker/background process, object storage, `analysis_jobs`, and any way
  for the frontend to see a job after a refresh. Extraction had no size/count/timeout caps beyond
  zip-slip.
- **Two things to document, not fix**: (a) `graph.store.ts` is a per-process `Map`, so a separate
  worker's in-memory graph is invisible to the API (async graphs require Neo4j); (b) the upload
  endpoint's response contract changes to 202.
- **No blocking architecture or security issue.**

## 2. Final architecture

Three processes + three services:

```
Frontend (Vite/React) ─┐
                        ├─ Express API (port 5000) ──┬─ Supabase PostgreSQL (jobs, ownership)
Worker (node dist/worker.js) ───────────────────────┤─ Cloudflare R2 (private ZIP storage)
                                                     └─ Neo4j (graph, unchanged)
```

- **API** validates + queues; it never runs analysis.
- **Worker** claims jobs atomically and runs the existing pipeline.
- **PostgreSQL is the queue** (`analysis_jobs`), claimed with `FOR UPDATE SKIP LOCKED` inside a
  SQL function — no Redis/BullMQ/Kafka.

## 3. Files created and modified

**Created (backend)**
- `src/services/storage.service.ts` — R2 (S3-compatible) client + key/put/get/delete helpers.
- `src/services/jobs.service.ts` — job CRUD, atomic claim (`rpc`), retry, exhaust.
- `src/controllers/jobs.controller.ts` — job status / list / retry.
- `src/routes/jobs.routes.ts` — `/api/jobs*`.
- `src/worker.ts` — the separate worker process.
- `src/__tests__/upload.api.test.ts`, `jobs.api.test.ts`, `jobs.claim.test.ts`, `worker.test.ts`.

**Created (frontend / db / docs)**
- `frontend/src/components/JobStatusPanel.tsx` (+ `JobStatusPanel.test.tsx`).
- `supabase/migrations/0002_build07_async_analysis.sql`.
- `docs/build-logs/build-07-upload-and-async-analysis.md`.

**Modified (backend)**
- `src/config/env.ts` (R2 + worker blocks), `src/server.ts` (register jobs routes, R2 warning),
  `src/controllers/repository.controller.ts` (upload → queue), `src/services/repositories.service.ts`
  (`source_object_key` field, `setRepositorySourceKey`, `deleteRepository`),
  `src/services/ingestion.service.ts` (`sanitizeRepositoryName` exported for the upload path),
  `package.json` (worker scripts, `@aws-sdk/client-s3`), `.env.example`.
- Tests adapted only where the contract changed: `app.api.test.ts`, `ownership.api.test.ts`
  (upload now expects **202**; the async mocks were added).

**Modified (frontend)**
- `src/api.ts` (queue response, `fetchJob`/`listJobs`/`retryJob`, repository summaries),
  `src/App.tsx` (queue → poll → load graph, resume on refresh), `src/App.test.tsx`.

**Modified (repo/docs)**
- `docs/build-logs/README.md`, root `README.md`.

## 4. Database migration details

`supabase/migrations/0002_build07_async_analysis.sql` (additive; **not applied by the assistant**):

- **New table `analysis_jobs`** — `id`, `repository_id` (FK, cascade), `user_id` (FK, cascade),
  `status` (pending/processing/completed/failed), `progress` (0–100), `stage`, `error_message`,
  `attempt_count`, `max_attempts` (default 3), `locked_at`, `started_at`, `completed_at`,
  `created_at`, `updated_at`. Indexes on `(status, created_at)`, `(user_id, created_at desc)`,
  `repository_id`. Reuses `set_updated_at()` from Build 06.
- **New column `repositories.source_object_key`** — the private R2 object key (nullable).
- **RLS** on `analysis_jobs`: owners may `select` their own rows; **no client insert/update/delete**
  policies (only the service role writes). `grant select … to authenticated`.
- **Function `claim_analysis_job(p_stale_seconds int)`** (`SECURITY DEFINER`) — in one transaction
  it (a) recovers stale `processing` jobs (→ `pending` if attempts remain, else `failed`), then
  (b) atomically claims one pending job with `FOR UPDATE SKIP LOCKED`, incrementing `attempt_count`
  and stamping `locked_at`/`started_at`. Executable **only** by `service_role`.
- Idempotent (safe to re-run).

## 5. Exact environment variables added

| Variable | Where | Purpose |
| --- | --- | --- |
| `R2_ACCOUNT_ID` | backend `.env` | Cloudflare account id |
| `R2_ACCESS_KEY_ID` | backend `.env` | R2 S3-compatible access key |
| `R2_SECRET_ACCESS_KEY` | backend `.env` | R2 S3-compatible secret |
| `R2_BUCKET_NAME` | backend `.env` | private bucket name |
| `R2_ENDPOINT` | backend `.env` | `https://<ACCOUNT_ID>.r2.cloudflarestorage.com` |
| `WORKER_POLL_INTERVAL_MS` | backend `.env` | optional, default 3000 |
| `WORKER_STALE_SECONDS` | backend `.env` | optional, default 900 |

Placeholders were added to `backend/.env.example` only; the real `.env` was **not** modified.

## 6. Cloudflare R2 manual setup

1. Cloudflare dashboard → **R2** → **Create bucket** (name e.g. `codeatlas-uploads`).
2. Keep the bucket **private** (do not enable public access / R2.dev).
3. **R2 → API → Manage API tokens → Create API token** (Object Read & Write, scoped to the bucket).
   Copy the Access Key ID and Secret Access Key.
4. Set in `backend/.env`:
   ```
   R2_ACCOUNT_ID=<account id>
   R2_ACCESS_KEY_ID=<token access key id>
   R2_SECRET_ACCESS_KEY=<token secret>
   R2_BUCKET_NAME=codeatlas-uploads
   R2_ENDPOINT=https://<ACCOUNT_ID>.r2.cloudflarestorage.com
   ```
5. **Verify server-side connection**: start the worker (`npm run dev:worker`). It calls
   `assertR2Configured()` at startup and fails fast with a clear message if any variable is
   missing. (No live upload/retrieval was executed in this build — see §11/§14.)

## 7. Worker startup instructions

```powershell
# Terminal 1 — API
cd backend; npm run dev

# Terminal 2 — worker (separate process)
cd backend; npm run dev:worker      # dev (ts-node-dev)
cd backend; npm run build; npm run worker:start   # production (node dist/worker.js)

# Terminal 3 — dashboard
cd frontend; npm run dev
```

The worker polls (default 3 s), processes jobs **sequentially**, and shuts down gracefully on
Ctrl-C / SIGTERM. **In production it must run as a persistent process** (a VM/container/forever
service) — a serverless request/response deployment cannot host a continuously polling worker.

## 8. API endpoints

| Method | Path | Notes |
| --- | --- | --- |
| GET | `/api/health` | public, unchanged |
| POST | `/api/repositories/analyze` | **changed**: validates, stores to R2, queues job, returns **202** `{ repositoryId, repositoryName, jobId, status }` |
| GET | `/api/jobs/:jobId` | owner's job: status, progress, stage, safe error, timestamps |
| GET | `/api/jobs?limit=20` | owner's jobs, newest first |
| POST | `/api/jobs/:jobId/retry` | re-queue a failed, owned job with attempts left (else 409) |
| GET | `/api/repositories` | owner's repositories (unchanged shape) |
| GET | `/api/graph?repository=<id>` | unchanged; now works once the job completes |
| (existing) | `/api/analysis`, `/api/analysis/function`, `/api/workflows*`, `/api/auth/me` | unchanged |

## 9. Job lifecycle

```
create (pending, stage queued, progress 0)
   → claim (processing, attempt_count += 1, locked_at set)          [atomic SQL]
   → downloading 10 → extracting 25 → parsing 50 → persisting_graph 90
   → completed 100
   ↘ failed (retryable)  → POST /retry → pending (while attempt_count < max_attempts)
   ↘ failed (permanent: bad archive / no JS-TS files) → attempt_count = max_attempts (no retry)
```

- Stale `processing` jobs (worker died) are recovered on the next claim (default 900 s).
- Progress values are **real stage boundaries only** — no invented percentages.
- The repository row is rolled back if the ZIP never reaches storage, so nothing is left
  permanently "queued".

## 10. Security and ownership verification

- **Auth**: every job route is behind `requireAuth`; the user id always comes from the verified
  token.
- **Ownership**: a job/repository that is missing or foreign returns the same non-disclosing 404
  (proved for `GET /api/jobs/:id`, `POST /api/jobs/:id/retry`, and the graph route).
- **Object keys are server-derived** (`repositories/{userId}/{repositoryId}/source.zip`) and stored
  on the repository row — never accepted from the client. The bucket is private and no public URL
  is produced.
- **Clients cannot set** `user_id`, `status`, `attempt_count`, `locked_at` or object keys; there
  are no client write policies on `analysis_jobs`.
- **RLS** is enabled for the new table; the service role (which bypasses RLS) still scopes every
  statement by owner in code.
- **Logs** never contain secrets, tokens, source contents or object bodies.
- **RLS policy behaviour and live R2** were **not** verified end-to-end in this build (mocked
  tests only) — see §14.

## 11. Tests executed and actual results

| Suite | Before Build 07 | After Build 07 |
| --- | --- | --- |
| Backend | 16 files / 128 tests (127 passing, 1 skipped) | **20 files / 152 tests (151 passing, 1 skipped)** |
| Frontend | 14 files / 124 tests | **15 files / 128 tests** |

- The 1 skipped backend test is the gated live-Neo4j round-trip (Neo4j not running).
- New backend suites: `upload.api` (6), `jobs.api` (8), `jobs.claim` (3), `worker` (7).
  R2, Supabase and the analysis pipeline are **mocked** — no real credentials or bucket needed.
- New frontend suite: `JobStatusPanel` (4).
- Existing suites updated only for the 202 contract (`app.api`, `ownership`); everything else
  (auth, ownership, knowledge graph, report, Coremation, Neo4j/in-memory) is unchanged and green.
- **Not covered by automated tests**: real R2 put/get, real Postgres `FOR UPDATE SKIP LOCKED`
  atomicity, RLS row isolation, and graceful-shutdown timing (all manual — §14).

## 12. Frontend production build result

`cd frontend && npm run build` → **clean** (`tsc && vite build`, 694 modules, dist emitted).

## 13. Backend TypeScript result

`cd backend && npx tsc --noEmit` → **clean**; `npm run build` (`tsc -p tsconfig.build.json`) →
**clean**, and `dist/worker.js` is produced.

## 14. Known limitations

- **Async graphs require Neo4j** to be readable: the in-memory fallback is per-process, so the
  worker's memory is not visible to the API. With Neo4j down, a completed job's graph is not
  served by the API (the worker still records `graphPersisted: false`).
- **Live R2 and live SQL claim/RLS are not automatically tested** — the suites mock them. They are
  covered by the manual checklist (§6/§15) only.
- **Cross-process AI-cache invalidation**: the worker clears its own caches, not the API's. Report
  cache keys include the graph signature (so reports stay correct); function summaries for an
  already-selected node may be briefly stale after a re-analysis.
- Graph writes remain idempotent but **not transactional** across nodes.
- Single worker only; claiming is still safe for more than one, but no autoscaling coordination.
- No size/count/timeout hardening was added to `extractZip` in this build (zip-slip protection is
  unchanged and intact).

## 15. Remaining manual steps

1. **Apply the migration** to the Supabase project (SQL editor or `supabase db push`) — **not done
   automatically**, by design.
2. **Configure Cloudflare R2** (§6) and set the `R2_*` variables in `backend/.env`.
3. **Run the three processes** (§7) and confirm a real end-to-end upload → worker → graph.
4. **Verify RLS** with two accounts (B cannot see A's jobs/repository).
5. Production: provision a **persistent worker** host.

## 16. Git

Committed on `main` and pushed to `origin` (see the commit shown in `git log` for Build 07).
Working tree clean after commit. No real credentials or generated secrets are committed.

---

**Previous:** Build 06 log — [`./build-06-auth-and-ownership.md`](./build-06-auth-and-ownership.md).
**Master overview:** [`./README.md`](./README.md).
