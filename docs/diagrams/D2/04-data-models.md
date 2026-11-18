# 04 — Data Architecture: verified Neo4j model + proposed relational model (Section F)

Legend: ✅ verified from actual code/Cypher · 🟡 partial · 🆕 proposed (no code) ·
❓ unresolved (see `05-decisions-open-questions.md`).

---

## F.1 Current Neo4j model — read out of the real queries

Source: `backend/src/services/graph.service.ts` (367 lines), `models/graph.types.ts`,
`config/env.ts`, `database/neo4j.ts`. There is no migration file, no schema script and no
constraint statement anywhere in the repository — this model is entirely implicit in the
write path.

### F.1.1 Nodes

| Label(s) actually written | Properties actually written | Created by | Emitted by |
| --- | --- | --- | --- |
| `:Entity:Repository` | `id` (`repository:<name>`), `type`, `name`, `filePath`, `startLine`, `endLine`, `category`, `inDefaultScope`, `sourceSnippet`, `repository` | `graph.service.ts:71-103` (`CREATE`) | `graph.builder.ts` |
| `:Entity:Directory` | same property set (`filePath` = relative dir path) | same | derived in `graph.builder.ts` |
| `:Entity:File` | same; `category` ∈ source/test/config/fixture/generated/declaration; `inDefaultScope` boolean | same | `entity.extractor.ts` + `scope.service.ts` |
| `:Entity:Class` | same | same | `entity.extractor.ts` |
| `:Entity:Function` | same **+ `sourceSnippet`** (≤ 700 chars, whitespace-collapsed, `…` when cut) | same | `entity.extractor.ts:138-178` |
| `:Entity:Method` | same; id class-qualified | same | `entity.extractor.ts` |
| `:Entity:Variable` | *allow-listed in `ENTITY_LABELS:19-27`* | — | **never emitted** (finding E14) |
| `:Entity` (bare) | fallback for any type outside the allow-list | `entityLabels():36-40` | defensive path |

Every node carries the **`repository` property**, which is the only scoping mechanism.

### F.1.2 Relationships

| Type | Direction | Properties | Provenance value | Written at |
| --- | --- | --- | --- | --- |
| `CONTAINS` | `(source)-[:CONTAINS]->(target)` | `line`, `filePath`, `resolution` | `derived` (structural ownership) | `graph.service.ts:105-127` |
| `IMPORTS` | file → file | same | `resolved` (import path) | same |
| `CALLS` | function/method → function/method | same | `resolved` (TS symbol resolver) | same |
| `EXTENDS` | class → class | same | `name-match` | same |
| `RELATIONSHIP` | fallback when the type is not allow-listed | same | — | `relationshipType():42-46` |

`ResolutionMethod` has exactly three values (`models/graph.types.ts:51-54`):
`derived` | `resolved` | **`name-match`**. There is no `unresolved` value — matching finding
E13: unresolvable edges are dropped before persistence, so the graph contains no evidence
of what could not be resolved.

### F.1.3 Identity, keys, and integrity — what is and is not enforced

| Concern | Reality (verified) | Consequence |
| --- | --- | --- |
| Node identity | Application-generated string ids, e.g. `function:src/x.ts:fn`, `method:src/x.ts:Klass:fn`, `directory:core`, `file:core/Ky.ts`, `repository:<name>` | Repository-relative and readable; **unique only within one repository name** |
| Uniqueness constraint | **None.** `CREATE` (never `MERGE`), and no `CREATE CONSTRAINT` exists in the codebase | Duplicate `(repository, id)` pairs are possible if a partial write fails midway |
| Indexes | **None.** Every `MATCH (n:Entity {repository:…})` / `{id:…, repository:…}` is a scan | Cost grows with total nodes in the database, not per repository (E5) |
| Write pattern | One `session.run` per node, one per edge, inside a single session (`71-127`) | 461 nodes + 1 148 edges ⇒ ~1 610 statements + 2 296 node lookups; explains the ~65 s observation |
| Re-analysis | `MATCH (n:Entity {repository:$repository}) DETACH DELETE n` first (`63-69`) | Idempotent per repository **name**; other repositories untouched — but names collide across users (E1) |
| Read pattern | `fetchGraph(repository?)`; **without** the parameter it returns all `:Entity` nodes (`151-152`) | Cross-tenant exposure once multiple users exist (E2) |
| Deletion of one repository | Only through re-analysis; there is no `DELETE /repository` path | UR-03 "repository deletion" has no implementation to reuse |
| Retrieval fidelity | `fetchGraph` rebuilds `evidence` only when `resolution` exists; re-attaches `category`, `inDefaultScope`, `sourceSnippet` when present (`173-189`) | ✅ round-trip verified by the gated test |
| Function context query | `fetchFunctionContext` collects `(caller)-[:CALLS]->(n)` and `(n)-[:CALLS]->(callee)` into **sets of names** (`286-316`) | Same-name callees merge; ids would be the safer key |

### F.1.4 What Neo4j owns vs what it must not be asked to own

✅ **Owns:** code structure — entities, typed edges, provenance, snippets, scope flags.
🆕 **Must not own (relational store's job):** identity, ownership, plans, entitlements,
subscription/payment state, usage/cost accounting, retention, audit history. Today Neo4j
is the *only* store, so `listRepositories()` (`337-345`) is doing an ownership-registry job
it cannot do — it returns bare names with no owner, timestamps or run history. That is the
exact seam where the relational database belongs.

---

## F.2 Proposed relational application database (ERD input)

📐 **PostgreSQL is a candidate, not an established dependency** — nothing in
`backend/package.json` implies a relational store today. The model below is the minimum
that satisfies UR-01…UR-09 and AR-01…AR-06 without inventing tables per screen.

### F.2.1 Entities, why each exists, and what kind of record it is

| Table | Why it is needed | Record kind | Status |
| --- | --- | --- | --- |
| `users` | Identity, profile fields, onboarding state, role | source of truth | 🆕 |
| `sessions` *(or `refresh_tokens`)* | Server-managed revocable auth state; required if D-01 picks sessions | source of truth | 🆕❓ |
| `projects` | The meeting groups work under projects; gives repositories a container | source of truth | 🆕❓ (D-14: projects vs repositories-as-top-level) |
| `repositories` | Ownership + lifecycle record for each registered repository; **this is where identity stops being a filename** | source of truth | 🆕 |
| `analysis_runs` | One row per pipeline execution: status, timings, counts, persistence flag | source of truth | 🆕 |
| `analysis_reports` | Stored AI report content linked to a run | source of truth (content) | 🆕 |
| `implementation_plans` | Stored generated plan + the user's feature text | source of truth (content) | 🆕 |
| `usage_events` | Per-operation metering, attribution and cost basis | transactional | 🆕 |
| `api_credentials` | Per-user provider credential metadata + encrypted material | source of truth (secret material is an encrypted blob) | 🆕 |
| `subscription_plans` | Plan catalogue + entitlement limits, configurable not hardcoded | source of truth | 🆕❓ (D-07 numbers) |
| `subscriptions` | A user's plan state over time with a state machine | source of truth | 🆕 |
| `payment_transactions` | Verified provider events, idempotency keys | source of truth (financial) | 🆕❓ (D-08) |
| `audit_events` | Who did what to whom, for privileged/security actions | audit | 🆕 |
| `pricing_configuration` | Currency + per-model token prices so cost is a *labelled estimate* | reference data | 🆕❓ (D-10) |

📐 Deliberately **not** created: a `profile` table (profile fields live on `users` until
there is a real second profile kind), a `storage_usage` table (usage is derived by
aggregation until proven too slow — see F.2.4), a `role_assignments` table (a `role`
column on `users` is enough for one admin role), a work-log table (the user-visible log is
a **derived view** over `analysis_runs` + reports), and per-screen tables.

### F.2.2 Keys, cardinalities and nullability (the load-bearing ones)

| Relationship | Cardinality | Keys / constraints | Notes |
| --- | --- | --- | --- |
| `users` 1 ─ * `projects` | mandatory | `projects.user_id → users.id` ON DELETE CASCADE | project belongs to exactly one user |
| `projects` 1 ─ * `repositories` | mandatory | `repositories.project_id → projects.id` CASCADE; **UNIQUE (project_id, repository_id)** | `repository_id` is the UUID minted by the app (F.3) |
| `users` 1 ─ * `repositories` | mandatory | `repositories.owner_user_id → users.id` RESTRICT | ownership denormalised onto the row so every repository query can enforce it without a join through projects |
| `repositories` 1 ─ * `analysis_runs` | mandatory | `analysis_runs.repository_id → repositories.id` CASCADE | history survives re-analysis |
| `analysis_runs` 1 ─ 0..1 `analysis_reports` | optional | `analysis_reports.analysis_run_id → analysis_runs.id` CASCADE; UNIQUE(analysis_run_id, report_type) | a run may have no report yet |
| `repositories` 1 ─ * `implementation_plans` | mandatory | `implementation_plans.repository_id → repositories.id` CASCADE; optional `created_by_run_id` | the plan is tied to the repository and to the run whose graph it used |
| `users` 1 ─ * `usage_events` | mandatory | `usage_events.user_id → users.id` CASCADE; index (user_id, created_at) | `repository_id`/`analysis_run_id` nullable (not every AI call is repository-scoped) |
| `users` 1 ─ * `api_credentials` | mandatory | **UNIQUE (user_id, provider)**; `material` encrypted; `state` active\|revoked | one live credential per provider |
| `users` 1 ─ 0..* `subscriptions` | optional | `subscriptions.user_id → users.id` CASCADE; partial unique: one `active` per user | history retained after cancel |
| `subscription_plans` 1 ─ * `subscriptions` | mandatory | `subscriptions.plan_id → subscription_plans.id` RESTRICT | plan rows are never deleted while referenced |
| `subscriptions` 1 ─ * `payment_transactions` | optional | `payment_transactions.subscription_id → subscriptions.id` RESTRICT; **UNIQUE (provider_event_id)** | idempotency anchor |
| `users` (actor) 1 ─ * `audit_events` | mandatory | `audit_events.actor_user_id → users.id` RESTRICT; `target_user_id` nullable | privileged reads/actions |

Important column-level rules:

- `users.password_hash` — an algorithmic hash, never a plaintext password; **no** plaintext
  provider key or token column anywhere.
- `analysis_runs`: `status` ∈ `queued|running|succeeded|failed`❓ (D-04 adds the first two),
  `started_at`, `finished_at`, `duration_ms`, `node_count`, `relationship_count`,
  `neo4j_persisted boolean` (mirrors the real `{ graph, persisted:false }` behaviour),
  `error_summary text nullable` (sanitised, never a stack trace with paths).
- `repositories`: `display_name` (what the user sees, may repeat), `repository_id` (UUID,
  globally unique), `retention_state` (F.4), `retained_bytes bigint` (0 when nothing is
  retained), `last_analyzed_at`.
- `usage_events`: `provider`, `model`, `feature`, `input_tokens` / `output_tokens`
  **nullable** (unknown ≠ 0 — E7), `attribution` ∈ `platform|user_provider_key`,
  `cost_basis` ∈ `actual|estimated|unknown`, `cost_amount`, `currency`,
  `pricing_version`, `status`, `retry_count`, `latency_ms`.
- `subscriptions`: `state` ∈ `pending|active|past_due|cancelled|expired`; `activated_at`,
  `current_period_end`, `cancel_at_period_end boolean`.

### F.2.3 Ownership and authorization implications (what each table buys you)

| Table | Unblocks requirement |
| --- | --- |
| `repositories.owner_user_id` | UR-03 ownership, UR-07 cross-user isolation, AR-02 scoping |
| `analysis_runs` | UR-04 history + duration, AR-04 status/error-rate analytics |
| `analysis_reports` / `implementation_plans` | UR-04 summaries, UR-05 download, quota over text |
| `usage_events` | UR-09 visibility, AR-04 usage analytics, AR-06 cost split |
| `api_credentials` | UR-08 BYOK with per-request scoping |
| `subscription_plans` + `plan_entitlement` limits | UR-06 server-side enforcement without hardcoded numbers |
| `payment_transactions` + unique event id | AR-05, D-08 idempotency |
| `audit_events` | AR-03, AR-01 privileged-action evidence |

### F.2.4 Where storage accounting comes from 📐

Do not build a `storage_usage` table on day one. Derive it:

```
retained_bytes     = SUM(repositories.retained_bytes)                    WHERE user_id = ?
repository_count   = COUNT(repositories)                                 WHERE user_id = ?
generated_text     = SUM(octet_length(analysis_reports.body))
                             + SUM(octet_length(implementation_plans.body))
ai_operations      = COUNT(usage_events) WHERE feature = ?  (not a byte metric)
```

Add a cached counter table only if these aggregates prove slow — which, at FYP scale, they
will not. This keeps quota, retention and deletion coherent: one source, three named
metrics, no double-counting (see Flow 7).

---

## F.3 Cross-database identity strategy (Neo4j ↔ relational) 📐

Foreign keys cannot span the two stores, so ownership is enforced in the **application
layer** and identity is minted in **one** place.

```
1. relational `repositories.repository_id` = UUID (server-generated) is the ONLY
   repository identity used downstream.
2. That UUID is written into Neo4j as the node property `repository`
   (graph.service.saveGraph already threads one repository value through every write)
   and is used in every MATCH ({repository: $uuid}).
3. `display_name` stays for the UI and may repeat across users — it is never a key.
4. Every graph operation goes through a guard:
      requireOwnedRepository(principal, repositoryId) → 403/404
   before Neo4j is touched at all. This is the only real isolation mechanism.
5. AI caches (report/summary) key on `repositoryId` + owner + model + promptVersion +
   signature, closing finding E4.
6. Run-level provenance: `analysis_runs.repository_id` ↔ the same UUID in Neo4j gives
   history and graph a shared join key without a cross-database FK.
```

Migration note (no code change now, it belongs to the build): today's stored graphs are
keyed by sanitized filename (`ingestion.service.ts:19-28`). Introducing UUIDs either
re-analyses old repositories or adds a one-off rename of the `repository` property — the
prototype has no live users, so **re-analysis is the cheaper path** 📐.

Consequences to state plainly in the diagrams: **user isolation does not exist today** —
there is no account or ownership model at all (F.1.3). It must not be implied anywhere.

---

## F.4 Retention and deletion policy (❓ D-05, defined here as a recommendation)

| Artifact | Today (verified) | Recommended target |
| --- | --- | --- |
| Uploaded ZIP | deleted in `finally` (`repository.controller.ts:126-133`) | stay transient; delete on run completion |
| Extracted source tree | deleted unless `KEEP_EXTRACTED=true`; also purged at startup (`server.ts:24-27`) | stay transient; retention only for a named debugging purpose with a TTL |
| Neo4j graph | retained indefinitely; replaced per repository on re-analysis | retained; deleted when the user deletes the repository or the run's retention window expires |
| `Function.sourceSnippet` | retained inside Neo4j and **returned by `GET /api/graph`** | retain (it is what makes AI work after the ZIP is gone) but **stop returning it to the client** (E3); cap by plan |
| AI reports / plans | in-process `Map` only; lost on restart (E9) | persist to relational text columns; cap size and age |
| Usage events | none | retain for billing/analytics period; aggregate then prune |
| Audit events | none | retain per operational need; never raw tokens or full keys |
| Credential material | none | encrypted at rest; hard-deleted on revoke with key rotation |

Deletion cascade to draw: user deleted → CASCADE projects → repositories → runs → reports /
plans; usage events CASCADE; Neo4j nodes removed by `repository` UUID; credentials
crypto-erased; audit events keep the actor reference as "deleted user" (audit records must
not vanish with the account).

---

## F.5 Credential security rules (binding for every diagram) 📐

1. **Passwords:** one-way hash with a proper password-hashing algorithm (bcrypt/scrypt/argon2
   family) + per-user salt. Never reversible encryption, never plaintext, never logged.
2. **Provider API keys (UR-08):** encrypted at rest; the encryption key lives outside the
   database (env/secret manager), rotates independently, and is never in source control.
   Encryption alone is not the whole answer — the design also needs access control on the
   decrypt path, redaction in every logger, an allow-list so key material can never be
   serialized into an API response, rotation, and hard deletion on revoke.
3. **Session tokens / bearer tokens:** stored as a digest, never raw, and never written to
   ordinary audit logs.
4. **In transit:** HTTPS everywhere; the credential endpoint is POST/PUT only and is not
   cacheable.
5. **Display:** a masked hint (provider + last 4 or fingerprint) is the maximum disclosure.
6. **Runtime use:** decrypted per request, held only in request scope, never in a cache key.
7. **Admin access:** an administrator can see *that* a credential exists, its provider,
   state and timestamps — never the material (AR-03).

➡️ Next: [`05-decisions-open-questions.md`](./05-decisions-open-questions.md)
