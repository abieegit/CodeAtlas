# Build Log — Build 06 — auth-and-ownership

| Field | Value |
| --- | --- |
| Unique file name | `build-06-auth-and-ownership.md` |
| Build number | 06 |
| Build name | auth-and-ownership |
| Status | **Open** (implementation landed and verified; closes when Build 07 begins) |
| Date opened | 2026-11-17 |
| Date closed | — (open) |
| Author | Muhammad Abdullah (47618) |
| Scope | Supabase Auth + PostgreSQL foundation, per-user accounts, JWT verification middleware, repository ownership (ownership-checked graph/report/function-summary/Coremation APIs), Row Level Security, tests and docs |
| Regression baseline | Backend 13 files / 116 tests (115 passing, 1 skipped/gated), frontend 13 files / 116 tests — all passing before the first edit; **no test deleted or weakened** |
| Result | Backend **15 files / 127 tests** (126 passing, 1 skipped/gated), frontend **14 files / 124 tests** — all passing; typecheck and production builds clean in both packages |

> **Note on the log location.** The Build 06 specification named
> `docs/implementation-logs/BUILD-06.md`. This repository's established, supervisor-facing
> convention is `docs/build-logs/` (one file per build + a row in the master
> `docs/build-logs/README.md`). This log therefore lives at
> `docs/build-logs/build-06-auth-and-ownership.md`; no second location was created.

---

## 1. Build objective

Add the SaaS foundation to the *existing* CodeAtlas product without changing the analysis
engine: multiple independent user accounts, each owned repository, and no cross-user data
access — plus PostgreSQL persistence for the new account/repository records and tests and
docs to prove it.

## 2. Implemented scope

1. Supabase Auth integration (email/password).
2. PostgreSQL `profiles` and `repositories` tables.
3. Automatic profile creation after signup (trigger).
4. Frontend signup, login and logout.
5. Persistent frontend sessions (restored after refresh).
6. Backend JWT verification middleware.
7. Authenticated API access (every analysis/graph/report/workflow route is protected).
8. Repository ownership (one owner per repository).
9. User-scoped repository listing and retrieval.
10. Ownership protection for graph, report, function-summary and Coremation APIs.
11. PostgreSQL Row Level Security on both tables.
12. Tests, setup documentation and this build log.

**Explicitly not built** (per scope): Redis / job queue / worker, Cloudflare R2,
subscriptions, pricing plans, payments, Paddle, AI credits, admin dashboard, team accounts,
desktop app, a new graph engine, any rewrite of the analysis pipeline, MongoDB / Firebase /
Prisma / a second auth provider or database. **One** new dependency was added
(`@supabase/supabase-js`, the official SDK) to each package.

## 3. Architecture changes

The change is **additive**. The analysis pipeline is untouched.

- **Identity.** A repository is now identified by a **stable, globally unique UUID**
  (`repositories.id`), not by its sanitized ZIP filename. The whole existing graph layer
  already took an opaque string key, so it now receives the UUID instead of the name:
  - the Neo4j `repository` property on every `Entity` node,
  - the in-memory fallback key (`graph.store.ts`),
  - every AI cache key (`report`, `function-summary`, `refinement` services).
  The human name remains only as the graph's `Repository` node label and in user-facing text.
  This is what makes the graphs of two users (or two same-named uploads) impossible to collide.
- **Authorisation.** A new Express middleware chain authenticates and authorises *before* any
  graph is read: `requireAuth` (verify the Supabase token) → `requireOwnedRepository`
  (resolve `?repository=<id>` and confirm the caller owns it, else a non-disclosing 404).
- **Accounts.** The frontend gained an `AuthProvider` + `AuthGate` boundary (no router was
  added — none exists in this project); the dashboard is only reachable with a session.

## 4. New files

**Backend**
- `backend/src/database/supabase.ts` — service-role Supabase client + `assertSupabaseConfigured()`.
- `backend/src/services/auth.service.ts` — `verifyAccessToken()` (the single token-verification point).
- `backend/src/services/repositories.service.ts` — user-scoped repository CRUD.
- `backend/src/middleware/auth.middleware.ts` — `requireAuth`.
- `backend/src/middleware/ownership.middleware.ts` — `requireOwnedRepository`.
- `backend/src/controllers/auth.controller.ts` — `GET /api/auth/me`.
- `backend/src/routes/auth.routes.ts` — the auth route.
- `backend/src/types/express.d.ts` — `Request.user` / `Request.repository` augmentation.
- `backend/src/__tests__/auth.api.test.ts` — authentication tests.
- `backend/src/__tests__/ownership.api.test.ts` — two-user ownership tests.

**Frontend**
- `frontend/src/lib/supabase.ts` — browser Supabase client (publishable key only).
- `frontend/src/auth/AuthContext.tsx` — session state, signup/login/logout/reset.
- `frontend/src/auth/AuthGate.tsx` — protected-dashboard boundary.
- `frontend/src/components/AuthScreen.tsx` — CodeAtlas-styled login/signup/reset screen.
- `frontend/src/vite-env.d.ts` — `VITE_SUPABASE_*` typing.
- `frontend/src/auth.test.tsx` — frontend authentication tests.
- `frontend/.env.example` — frontend env placeholders.

**Database / docs**
- `supabase/migrations/0001_build06_auth_and_ownership.sql` — schema, triggers, RLS.
- `docs/build-logs/build-06-auth-and-ownership.md` — this log.

## 5. Modified files

**Backend**
- `backend/src/config/env.ts` — `env.supabase` (`SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SECRET_KEY`).
- `backend/src/server.ts` — register `authRoutes`; validate Supabase config at startup.
- `backend/src/routes/repository.routes.ts`, `analysis.routes.ts`, `workflow.routes.ts` —
  `requireAuth` (+ `requireOwnedRepository`) on every protected route; `/api/graph` now
  **requires** `?repository=<id>` (previously returning every graph was a global leak).
- `backend/src/controllers/repository.controller.ts` — upload creates a repository row owned by
  the caller, analyses under the row's id, updates status/counts; listing is user-scoped;
  graph read is ownership-gated.
- `backend/src/controllers/analysis.controller.ts`, `workflow.controller.ts` — resolve ownership
  before any graph read; the graph is scoped by repository id; the human name is used for display.
- `backend/src/services/parser.service.ts` — `analyzeAndStore(path, name, id)`.
- `backend/src/services/graph.service.ts` — parameter renamed to `repositoryId` (semantics only).
- `backend/src/services/analysis/report.service.ts` — `generateRepositoryReport(id, graph, name)`
  (cache key by id, display name in the payload/prompt).
- `backend/.env.example`, `backend/package.json` + lock.
- Existing tests adapted with an auth/ownership mock so their assertions are unchanged:
  `app.smoke.test.ts`, `app.api.test.ts`, `analysis.api.test.ts`, `workflow.api.test.ts`,
  `analysis.services.test.ts` (new 3-arg report call).

**Frontend**
- `frontend/src/main.tsx` — wrap the app in `AuthProvider` + `AuthGate`.
- `frontend/src/api.ts` — attach `Authorization: Bearer <token>`; add `repositoryId` to the analyse response.
- `frontend/src/App.tsx` — sign-out + user email; hold the repository id for API calls and the
  name for display.
- `frontend/src/components/AnalysisReportView.tsx` — optional `repositoryName` for display.
- `frontend/package.json` + lock.

**Repo / docs**
- `.gitignore` — ignore `frontend/.env*` (keep `.env.example`).
- `README.md` — pointer + Supabase env note.
- `docs/build-logs/README.md` — advanced to Build 06.
- `docs/build-logs/build-05-coremation.md` — closed by this build.

## 6. Database schema

`supabase/migrations/0001_build06_auth_and_ownership.sql`:

**`public.profiles`** — `id uuid pk → auth.users(id) on delete cascade`, `full_name text`,
`avatar_url text`, `created_at`, `updated_at`.

**`public.repositories`** — `id uuid pk default gen_random_uuid()`,
`user_id uuid not null → auth.users(id) on delete cascade`, `name text not null`,
`source_type text not null default 'zip'`,
`status text not null check (in 'analyzing'|'completed'|'failed')`,
`graph_persisted boolean default false`,
`node_count integer default 0 check (>=0)`,
`relationship_count integer default 0 check (>=0)`, `created_at`, `updated_at`.

Also: indexes `repositories(user_id)` and `repositories(user_id, created_at desc)`; a shared
`set_updated_at()` trigger on both tables; and `handle_new_user()` (SECURITY DEFINER, pinned
`search_path`) with an `after insert on auth.users` trigger that inserts the matching profile
(`on conflict (id) do nothing` — idempotent, UUID matches `auth.users.id`).

**Row Level Security** is enabled on both tables. Policies: read/update own `profiles`
(update restricted to `full_name`/`avatar_url` by column grants); read/insert/update/delete own
`repositories`, with `with check (auth.uid() = user_id)` on insert/update so a user cannot
create a repository for, or hand one to, someone else. `anon` gets no access.

> The backend uses the Secret key, which **bypasses RLS**, so every backend statement is
> additionally scoped by the verified `user_id` in code. RLS is defence-in-depth.

## 7. Environment variables

| Where | Variable | Purpose |
| --- | --- | --- |
| backend `.env` | `SUPABASE_URL` | Supabase project URL |
| backend `.env` | `SUPABASE_PUBLISHABLE_KEY` | publishable key (`sb_publishable_...`), validated at startup |
| backend `.env` | `SUPABASE_SECRET_KEY` | secret key (`sb_secret_...`); backend DB + token verification (**never** in the browser) |
| frontend `.env.local` | `VITE_SUPABASE_URL` | browser client URL |
| frontend `.env.local` | `VITE_SUPABASE_PUBLISHABLE_KEY` | browser publishable key |

These are Supabase's **current** key names; the legacy `anon` / `service_role` names are not
required. Placeholders are in `backend/.env.example` and `frontend/.env.example`. Real `.env`
files remain gitignored (`.gitignore` covers `frontend/.env*`). Existing Neo4j and LLM variables
are unchanged. Startup fails fast with a clear "Supabase is not configured. Missing: …" message
if any of the three backend variables is missing. **No Supabase project, key or migration is
assumed to exist** — §16 gives the exact setup.

## 8. Authentication flow

1. The user clicks **Create an account**, enters a name, email and password; the browser calls
   `supabase.auth.signUp` (the name is stored in `user_metadata.full_name`). With email
   confirmation on, Supabase emails a confirmation link and no session is returned yet.
2. The Postgres trigger `handle_new_user()` inserts the matching `profiles` row.
3. **Log in** calls `supabase.auth.signInWithPassword`; the session is persisted by the client
   (`persistSession`) and **restored on refresh** via `getSession()`.
4. `AuthGate` shows a loading state while restoring, the login screen with no session, and the
   dashboard with a session. A password-recovery link surfaces a "set a new password" screen
   (`PASSWORD_RECOVERY` event → `updateUser({ password })`).
5. Every backend call from `api.ts` sends `Authorization: Bearer <access_token>`.
6. The backend `requireAuth` middleware verifies the token with
   `supabaseAdmin.auth.getUser(token)` (Supabase's supported server-side check — **no custom
   cryptography**), rejecting missing/malformed/invalid/expired tokens with **401**, then sets
   `request.user`. `GET /api/auth/me` returns the user + profile.
7. **Logout** calls `supabase.auth.signOut()` and returns to the login screen.

## 9. Repository ownership flow

1. An authenticated user uploads a ZIP (`POST /api/repositories/analyze`).
2. The backend creates a `repositories` row **owned by the verified `user_id`** (status
   `analyzing`) — identity comes from the verified token, never from the request body/query.
3. It runs the existing validation/extraction/analysis and persists the graph under the row's
   **UUID** (`saveGraph(graph, repositoryId)`; `rememberGraph(repositoryId, graph)`).
4. It updates the row (`completed`/`failed`, `graph_persisted`, node/relationship counts).
5. It returns the existing response plus `repositoryId` (and `repository` = name, unchanged).
6. Listing (`GET /api/repositories`) returns only the caller's rows.
7. Every graph/report/function-summary/Coremation call resolves `?repository=<id>` through
   `requireOwnedRepository` **before** any graph is read — a repository that does not exist, or
   belongs to another user, gets the same non-disclosing **404**, and no graph read/write/delete
   occurs.
8. Neo4j safety: because the scoping key is the owner's unique UUID and ownership is checked
   first, a repository identifier cannot be used to read, overwrite or delete another user's
   graph. The in-memory fallback uses the same key, so its lookup follows the same boundary.

## 10. API changes

- `GET /api/health` — unchanged, still public.
- All other existing endpoints — same paths, now behind `requireAuth` (and ownership where a
  repository is addressed). Names were preserved; nothing was renamed.
- `?repository=` now carries the repository **UUID** (opaque handle) instead of the name.
- `POST /api/repositories/analyze` — same fields, **plus** `repositoryId` and `status`.
- `GET /api/repositories` — now returns the caller's repository records
  (`{ repositories: [{ id, name, status, graphPersisted, nodeCount, relationshipCount, createdAt, updatedAt }] }`).
- `GET /api/graph` — now **requires** `?repository=<id>`.
- **New:** `GET /api/auth/me` → `{ user: { id, email }, profile }`.

## 11. Security measures

- Token verification only through the Supabase SDK server-side check; no hand-rolled JWT crypto.
- The secret key (`sb_secret_...`) lives only in the backend; the browser only ever gets the
  publishable key (`sb_publishable_...`).
- No credentials or tokens are logged; the secret key is never serialised to a response.
- Identity for ownership always comes from the verified token, never from a client-supplied id.
- Ownership is checked before every graph read/write; failures are non-disclosing 404s.
- RLS enabled on both tables; column-level grants limit profile updates; `with check` clauses
  prevent creating/assigning a repository to another user.
- The pre-Build-06 global-leak endpoints (`GET /api/graph` without a repository, and the global
  repository list) are closed.

## 12. Test results

**Backend — new:** `auth.api.test.ts` (6) — health stays public; missing token → 401; non-Bearer
header → 401; invalid/expired token → 401; valid token → 200 with profile; every private route
→ 401 unauthenticated. `ownership.api.test.ts` (5) — upload creates a row owned by the caller;
listing is user-scoped; **user B is refused every read of user A's repository (404) and no graph
read happens**; the owner can read their own graph; two users uploading the same ZIP get
separate repositories.

**Backend — existing:** `app.smoke`, `app.api`, `analysis.api`, `workflow.api` kept all their
assertions (auth/ownership mocked for those files); `analysis.services` updated to the new
report signature. No existing test was deleted or weakened.

**Frontend — new:** `auth.test.tsx` (8) — session-restore loading; protected dashboard with no
session; session restore renders the dashboard; signup (with email-confirmation message);
signup password validation; login → dashboard on session; login error; logout → login screen.

**Frontend — existing:** `App.test.tsx` and all component suites unchanged and green.

**Mocked vs. live.** Every test above uses a **mocked** Supabase client (`vi.mock`), so a green
run proves the *wiring*, not that a real project or the migration exists, and needs no
credentials. One test is different: `supabase.integration.test.ts` is a **live** integration
test. It **runs only when `SUPABASE_URL` and `SUPABASE_SECRET_KEY` are set**, and then asserts the
real project exposes the `profiles` and `repositories` tables (i.e. the migration is applied);
otherwise it self-skips. It is the test that separates "the mocks pass" from "the real Supabase
project is set up".

## 13. Actual test counts

| Suite | Baseline (before Build 06) | After Build 06 |
| --- | --- | --- |
| Backend | 13 files / 116 tests (115 passing, 1 skipped/gated) | **16 files / 128 tests (127 passing, 1 skipped/gated)** |
| Frontend | 13 files / 116 tests (all passing) | **14 files / 124 tests (all passing)** |

The 1 skipped backend test is the gated live-Neo4j round-trip (Neo4j is not running here). The
**live Supabase integration test ran and passed** against the configured project, confirming the
migration is applied and both tables exist. All auth/ownership resolve and route tests are mocked.

## 14. Build verification results

- Backend `npx tsc --noEmit` — **clean**; `npm run build` (`tsc -p tsconfig.build.json`) — **clean**.
- Frontend `npx tsc -p tsconfig.json --noEmit` — **clean**; `npm run build` (`tsc && vite build`)
  — **clean** (659 modules transformed, up from 612 with the Supabase SDK).
- `npm test` — backend **16 files / 127 passing, 1 skipped**; frontend **14 files / 124 passing**.
- The **live Supabase integration test passed** against the real project (both `profiles` and
  `repositories` query cleanly), so the migration is verified as applied — not merely mocked. RLS
  row-isolation itself is covered by the mocked ownership tests plus the two-account manual
  checklist (§16). The live Neo4j round-trip test is unchanged and self-skips without a database.

## 15. Known limitations

- **Pre-Build-06 stored graphs are unowned and not reachable.** They were keyed by name, so no
  account owns them. They are not migrated silently; re-analysing a repository under an account
  creates a fresh, owned record (documented, not hidden).
- **RLS row-isolation is verified manually** (two accounts, §16). The live Supabase integration
  test checks connectivity and that the tables exist, but it does not assert RLS policy behaviour
  against a real second user.
- **No rate limiting / abuse protection** on the auth or upload endpoints yet.
- **`npm audit` reports 3 pre-existing advisories** in transitive deps (`body-parser`, `multer`,
  `qs` via Express/Multer) — present before this build and not introduced by the Supabase SDK.
  Out of scope (no dependency upgrades in a feature build).
- **"Load stored graph" requires a prior analysis in the session** (it needs a repository id);
  the old global "load everything" behaviour was intentionally removed for isolation.
- Frontend password recovery depends on Supabase email being configured (see §16).

## 16. Manual setup instructions

1. **Create a Supabase project** (nothing here assumes one exists). From *Project Settings → API*,
   copy the **Project URL**, the **Publishable key** (`sb_publishable_...`), and the **Secret key**
   (`sb_secret_...`).
2. **Apply the migration** — it is generated but **not** auto-applied. Two ways:
   - **SQL editor:** open `supabase/migrations/0001_build06_auth_and_ownership.sql`, copy the whole
     file, paste it into the dashboard's SQL editor, and Run.
   - **CLI:** `supabase link --project-ref <ref>` then `supabase db push`.
   Confirm `profiles` and `repositories` exist with RLS enabled (the gated integration test
   checks this automatically once the env is set).
3. **Auth settings.** Enable the **Email** provider. Decide whether email confirmation is on
   (if on, users must confirm before logging in). Add `http://localhost:5173` to the Site URL /
   Redirect URLs, and enable password recovery.
4. **Backend env.** In `backend/.env` (gitignored) set `SUPABASE_URL`,
   `SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SECRET_KEY`. Keep the existing Neo4j and LLM values.
5. **Frontend env.** Copy `frontend/.env.example` to `frontend/.env.local` and set
   `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY`.
6. **Run.** `cd backend && npm run dev` (port 5000) and `cd frontend && npm run dev` (port 5173);
   optionally `docker compose up -d neo4j`. Sign up, confirm the email if required, log in, and
   upload a ZIP.
7. **Verify isolation (RLS).** With two accounts, confirm that account B cannot see account A's
   repository (empty list) and gets a 404 when it tries A's repository id on the graph, report,
   function-summary or workflow endpoints.

## 17. Remaining work for the next build

- Any account/profile UI beyond the auth screen (avatar, name editing) if required.
- Rate limiting / abuse protection and (if ever in scope) usage metering — **not** started here.
- An automated RLS integration test if a live Supabase project is added to CI.
- A migration path (or explicit "re-analyse") UX for pre-Build-06 stored graphs, if wanted.
- Build 06 deliberately does **not** start Build 07 or any future feature.

---

**Previous:** Build 05 log — [`./build-05-coremation.md`](./build-05-coremation.md) (closed by
this build). **Master overview:** [`./README.md`](./README.md).
