# 08 — Final Approval Gate (Section J)

**Stop point.** No draw.io file has been produced. This page states what is established
enough to draw immediately, what needs a decision from the project owner, and what happens
next.

---

## J.1 Established beyond doubt (safe to draw solid now)

| Area | Established fact | Evidence file |
| --- | --- | --- |
| Analysis core | Upload → validate → extract → scan → Babel → entities → TS symbol resolution → relationships → assemble → scope → Neo4j → REST → D3, all implemented | `01` §A.2, `03` Flow 2 |
| Persistence model | `:Entity:<Type>` nodes with ten properties; four relationship types with `line/filePath/resolution`; scoped `DETACH DELETE` then `CREATE`; no constraints or indexes | `04` §F.1 |
| AI layer | Digest of measured metrics → strict-JSON prompt → normalized six-section report with caps; one-line function summaries grounded in a persisted snippet + CALLS context; model/prompt-versioned caching with in-flight dedupe and invalidation on re-analysis | `01` §A.4, `03` Flows 2–4 |
| API surface | Seven endpoints, exact shapes, 400/404/502/503/504 behaviour | `01` §A.1, `../../build-logs/README.md` §7 |
| Test evidence | Backend 11 files/73 tests, frontend 12 files/78 tests; gated Neo4j round-trip; live Groq verification recorded in Build 04 | `01` §I.1 |
| Absence of the product layer | No auth, users, ownership, roles, relational store, plans, payments, metering, credentials, admin UI, queue, CI, app container | `01` §A.6 |
| Architecture shape | Layered monolith with clean module boundaries and no circular dependencies — and **nothing justifying microservices** | `02` §C, `07` Part 1 |
| Diagram 1 | Can be drawn today from verified components alone | `06` H Diagram 1 |

## J.2 Established as direction (draw dashed, grey, labelled "proposed")

All of `01` §B (UR-01…UR-09, AR-01…AR-06), the module map in `02` §D.3, the flows in `03`
§Flows 1, 5, 6, 7, 8, 9, 10, and the relational model in `04` §F.2 — every one of them is
**intended product behaviour with no code today**, and each carries a requirement id so a
diagram can cite it. The two application flows (user vs administrator) and the "admin
reaches the backend only through role-guarded APIs" rule are treated as confirmed direction,
not as open questions.

## J.3 NOT established — decisions needed from the project owner

Answer these before the target-state diagrams are drawn. The first two change *what the
project is*, so they come first.

| ID | Decision needed | Why it cannot be answered from source | Blocking |
| --- | --- | --- | --- |
| **D-16** | Do registration, plans, quotas, BYOK billing, admin analytics and payments belong in this FYP, or is the analysis layer (proposal Modules 3, 5, 6 — currently 0 %) still the deliverable? | Eleven of nineteen target modules are platform work that the approved proposal (v1.3) does not list, and it places SSO/billing-class capabilities out of scope. Only the owner + supervisor can widen the scope | **Diagrams 2, 3, 4, 9; the §B requirement set; the proposal change record** |
| **D-03** | Approve the repository identity change: application-minted UUID as the only repository key (replacing the filename-derived name), with ownership enforced in the application layer | A technical necessity (finding E1), but it changes stored data and the Neo4j model, so it needs approval before it appears in a diagram as the target | **Diagrams 2, 5, 7, 8** |
| **D-01** | Choose the authentication design: server-managed sessions vs token pair vs external identity provider | Nothing exists to inspect; the proposal puts enterprise SSO out of scope | **Diagrams 2, 3, 8** |
| **D-06** | Merge "implementation plan" into proposal Module 3 (one evidence path, two outputs) or build them as separate features | Both are 0 % today; the brief explicitly makes this an owner decision | **Diagrams 5, 6, 8, 9** |
| **D-07** | Plan catalogue with real prices and limits, or configurable placeholders | A `$12 Pro starting point` was discussed but is not an approved price, and no quota number exists. Inventing either is forbidden | **Diagram 9** |
| **D-08** | Is payment processing in scope at all, and with which provider? Recommended: keep it out and simulate the verified-event boundary | No provider appears in source, proposal or the meeting record | **Diagram 9** |
| **D-04** | Approve moving analysis to a job/status model inside the monolith | Today's blocking request cannot express "processing status" (UR-03); this is a real behavioural change | **Diagrams 3, 5** |
| **D-05 / D-09** | Retention policy for uploaded source, and where retained bytes live (local disk vs object storage) | Uploads are currently deleted after the response, so there is nothing to quota; the choice changes the storage box on Diagram 2 | **Diagrams 2, 3, 9** |
| **D-10 / D-15** | Cost basis (actual vs labelled estimate, and the pricing source) and the platform-key fallback policy when a user has no key | The provider's `usage` payload is discarded today (E7), so no cost figure is obtainable | **Diagram 9; AR-06 wording** |
| **D-11** | Administrator interface as a separate client build vs role-gated routes in the same SPA | The meeting requires separation; the implementation form is not decided | **Diagrams 2, 4** |
| **D-02 / D-12 / D-14** | Admin role storage; analytics freshness (query-time vs rollups); whether "Project" is a real grouping concept | Design-level; recommendations are in `05` §G and can proceed as labelled assumptions | No |
| **D-13** | Whether a deployment diagram is required at all | No Dockerfile, no CI, no hosting decision — the only container is Neo4j | **Diagram 10** (recommend deferring) |

## J.4 Two items to log even if everything else is approved

1. **Proposal alignment.** If D-16 is approved in any form, the approved proposal needs a
   change record (v1.4) and the master document
   [`../../build-logs/README.md`](../../build-logs/README.md) needs a new §6 warning row
   ("product/SaaS layer requirements added by meeting, absent from v1.3") plus a §5
   parallel-track re-score. Keeping that file truthful is the standing rule for this project.
2. **Accuracy of the graph stays an open evaluation.** E13 (`unresolved` edges silently
   omitted) is both a proposal-method gap and a blocker for any precision/recall claim in
   WBS 3.11. It should land in an early build, before change-impact traversal depends on
   traversal completeness.

## J.5 What happens after approval

1. Owner answers §J.3 (a short reply per id is enough — "approved / deferred / different
   option").
2. This pack is amended in place: statuses move from 🆕/❓ to settled, and each
   blueprint in `06` gets its "as approved on <date>" note.
3. Only then are the draw.io files produced, from `06-diagram-blueprints.md`, following the
   solid/dashed convention in `06` §H.0 and the ten consistency checks in `06` §H.1.
4. Order suggested by dependency: **1 (current architecture) → 7 (Neo4j model) → 8 (ERD) →
   2 (target) → 6 (class/module) → 5 (processing/AI) → 3 (user workflow) → 4 (admin
   workflow) → 9 (subscription/usage/payment) → 10 only if D-13 is resolved.**
   Diagram 1 needs no approvals and can be drawn immediately if you want a first artefact.

## J.6 Standing statements in this pack (so reviewers cannot misread it)

- No class, endpoint, table, provider, identity product, price or quota was invented.
  Every number cited (50 MB upload cap, 700-char snippet, 60 s timeout, ≤6 factors, ≤5 list
  items, score clamp 0–10, default score 5, prompt version `v2`) is read from source.
- No proposed feature is presented as implemented.
- Activity history, audit events, AI reports and user-visible work logs are four distinct
  record kinds.
- API usage, API cost, platform infrastructure cost and profit are four distinct quantities.
- Graph storage, retained source/archive storage and generated-text storage are three
  distinct metrics.
- A generated implementation plan is advice, not a code change; CodeAtlas does not modify
  or deploy code.
- Administrators get aggregated analytics by default; record access is separate and
  privileged; private source content and credential material are not reachable at all.
- No API key or password is ever exposed to a client, a log, a report or a cache key.
- No legal compliance is claimed; applicable regulatory requirements were not established.
- The working analysis pipeline is preserved; it is not redesigned to fit the business
  features.

**➡️ End of Phase 1 discovery. Awaiting approval on §J.3 before any diagram is drawn.**
