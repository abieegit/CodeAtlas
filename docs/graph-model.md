# CodeAtlas — Graph Data Model

The CodeAtlas knowledge graph is a typed, directed property graph stored in Neo4j. This
document defines node identity, relationship semantics, discovery method, provenance, validation
rules, and known limitations. It is the authoritative reference for the model implemented under
`backend/src/parser/**` and `backend/src/services/**`.

> **Build 05 note:** the model below was **extended additively**, not redesigned. The
> node types, the four relationship types, the id scheme and every existing API response
> are unchanged; the new material arrives as optional fields and as file-level evidence
> (see [Build 05 additions](#build-05-additions-workflow-evidence)). That is deliberate —
> the D3 graph, filters, search, reports and function summaries all key on the types below.

## Node types

| Node | Identity (`id`) | Emitted when |
| --- | --- | --- |
| Repository | `repository:<name>` | always (one per analysed repository) |
| Directory | `directory:<relativePath>` | derived from file paths |
| File | `file:<relativePath>` | for each scanned source file |
| Class | `class:<relativePath>:<ClassName>` | `class` declaration |
| Function | `function:<relativePath>:<Name>` | function declaration, `const x = () => {}` / `const x = function () {}`, **hook-wrapped** `const x = useCallback(() => {}, [])` / `useMemo`, and **object methods** (`{ save() {} }`, `{ save: () => {} }`) — from Build 05 |
| Method | `method:<relativePath>:<ClassName>:<Name>` | class method |

`Variable` is a reserved node type but is **not** emitted by the extractor.

### Function source snippets

`Function` nodes additionally carry an optional `sourceSnippet` property: the function's
own source text, whitespace-collapsed and truncated to ~700 characters, captured from the
file content at extraction time. It exists so the analysis features (one-line function
summaries via an OpenAI-compatible LLM API) can reason about the actual implementation without the
uploaded ZIP, which is deleted after analysis. It is visualization/analysis metadata only —
node identity, relationships and graph semantics are unaffected.

### Identity rules

- IDs are **repository-relative** (physical filesystem paths are never exposed) and unique within
  one analysed repository.
- **Same-named functions/methods do not collapse**: functions in different files differ by
  `<relativePath>`; methods are **class-qualified**, so two classes in one file may share a method
  name.
- **Known collapse edge-case:** two same-named declarations of the *same kind* in *one* file
  (e.g. two `function foo` in `a.ts`) share an id and merge. This is accepted rather than
  synthetic-suffixing, to keep ids stable across repeated analysis.
- The `Repository` id derives from the upload file name via `sanitizeName`, so renaming the ZIP
  changes the Repository id (documented behaviour).

## Relationship types

Each edge is directed `source -> target`. `evidence.resolution` records **how** the edge was
discovered so the graph can justify itself rather than assert facts.

| Type | Direction / meaning | Discovery | `resolution` | Failure mode |
| --- | --- | --- | --- | --- |
| `CONTAINS` | structural ownership: Repository→Directory/File, Directory→Directory/File, File→Class/Function, Class→Method | derived from paths (`graph.builder`) and the AST (`relationship.extractor`) | `derived` | n/a (always local) |
| `IMPORTS` | a file imports a **local** file | `module-resolver` resolves the relative path | `resolved` | external/package or unresolved import → edge omitted |
| `CALLS` | a function/method calls another function/method | TypeScript Compiler API symbol resolution (`symbol.resolver`) | `resolved` | unresolved target → edge omitted (never fabricated) |
| `EXTENDS` | a class extends another class | superclass **matched by name**, same file first | `name-match` | unmatched name → edge omitted; may mis-target a same-named class elsewhere |

### Provenance (evidence)

`GraphRelationship.evidence = { filePath?, line?, resolution }`. `resolution` is one of:

- `derived` — structural ownership computed from paths / AST containment (no source location for
  path-derived Repository/Directory edges).
- `resolved` — a concrete target was resolved (relative import path, or a call via the TS symbol
  resolver).
- `name-match` — matched by symbol name only (`EXTENDS`).

Evidence is written as relationship properties in Neo4j and rebuilt by `fetchGraph`.

## Validation rules (`graph.builder`)

1. Nodes are de-duplicated by `id` (first wins).
2. Directory/Repository nodes are derived and linked with `derived` `CONTAINS` edges.
3. Edges whose `source` or `target` is not a node are dropped (dangling).
4. Self-loops (`source === target`) are dropped. **Build 05:** recursion is therefore not
   an edge, but it is no longer invisible — self-call lines are recorded in the file's
   `workflowEvidence.selfCalls` and reported as `provenance.selfCalls` on every workflow.
5. Edges are de-duplicated by `source|type|target`; evidence on the first occurrence is kept.
   **Build 05:** repeated call sites are merged into that one edge but retained in its
   `occurrences` list, so ordering and repetition survive without changing the edge shape.

## Build 05 additions (workflow evidence)

Optional additive fields only — every one is absent-safe for pre-Build-05 graphs.

| Field | Lives on | Contents |
| --- | --- | --- |
| `async`, `exported` | `Function`/`Method` nodes | declared modifiers, read from the AST |
| `occurrences[]` | `CALLS` relationships | one entry per concrete call site: `callId`, `line`, `column`, `branch`, `condition`, `awaited`, `sequence` |
| `workflowEvidence` | `File` nodes | bounded JSON: `routes`, `requests`, `mounts`, `units` (per-callable control flow), `unresolved`, `external`, `truncated` |

**Control flow (`units[]`).** Per callable: `branches` with kinds
`if.then | else-if | if.else | case | default | ternary.consequent | ternary.alternate |
try | catch | finally | loop` and the **condition text sliced from the source**, plus
`returns`, `throws`, `awaits`, `loops` line lists. A branch is evidence of where a call is
*written*; it is never an edge, and the graph never claims the guarded call executes.

**HTTP boundaries.** `routes[]` holds statically readable Express-style registrations
(`method`, declared `path`, `mountPath`, `fullPath`, `handler`, resolved `handlerId`,
`line`, `column`, `middleware[]`); `requests[]` holds client calls (`method`, `url`,
`urlStatic`, `client`, `callerId`, `line`). Route detection requires a router-shaped
receiver (`Router()`/`express()`-created or named `app`/`router`/`server`/`api`) **and** a
leading-slash literal path, so `map.get(k)` and `request(app).get("/x")` are not mistaken
for endpoints. Matching between the two is segment-wise with `:param` and `*` wildcard
support and reports `resolved` / `ambiguous` / `unresolved` — ambiguity is preserved.

**Unresolved honesty.** `unresolved[]` records calls with a caller but no resolvable
internal target, with `reason: not-resolved | target-not-in-graph`. These are **evidence,
not edges**: no `CALLS` edge, node or `ResolutionMethod` value is invented for them, and
`ResolutionMethod` still has exactly `derived | resolved | name-match`.

**Persistence.** All of the above round-trips through Neo4j (`workflowEvidence` JSON on
File nodes, `occurrences` JSON on relationships, `isAsync`/`isExported` on nodes), is size
capped on write, and is parsed defensively on read so one malformed property cannot break
graph retrieval.

**Compatibility rule.** Graphs stored before Build 05 simply lack these properties.
Workflow reconstruction detects that and reports `provenance.evidenceVersion: "none"`;
the remedy is an explicit re-analysis, never a silent inference.

## Known limitations

- Calls **into** `const`/arrow functions require the arrow-target mapping in `symbol.resolver`;
  calls **from** them are attributed via a VariableDeclarator caller.
- Calls inside object-literal methods are not attributed to a named caller.
- `EXTENDS` is name-based (same file first).
- Symbol resolution is best-effort: dynamic imports, re-exports, aliases and external packages may
  be omitted.
- Repository/Directory `derived` edges carry no `filePath`/`line`.

## Relevance & scope

Scanning and parsing are unchanged (all supported files minus ignored directories). Relevance is
applied as **properties** on the assembled graph — never by deleting data:

- Every `File` node gets a `category`: `source | test | config | fixture | generated |
  declaration`, decided by combined path **and** filename signals (`utils/classify.utils.ts`),
  not by folder names alone.
- Every node gets `inDefaultScope`. A file is in scope when it is `source` **or** it is imported
  (directly or transitively) by a source file — so a relevant module outside the main source
  directory is kept. A Directory is in scope when it contains an in-scope file; the Repository is
  in scope when any file is.
- The persisted graph (Neo4j) and the REST API always contain **all** files; the frontend's
  "Application ↔ Full" scope and the other filters only change what is **drawn**.

**Excluding during analysis** (ignored directories, unsupported extensions) means a file is absent
from the graph entirely. **Hiding in the UI** means the file is still in Neo4j and the API, just
not drawn. Filters are reversible and never delete graph data.
