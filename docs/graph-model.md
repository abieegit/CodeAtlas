# CodeAtlas — Graph Data Model (F1)

The CodeAtlas F1 knowledge graph is a typed, directed property graph stored in Neo4j. This
document defines node identity, relationship semantics, discovery method, provenance, validation
rules, and known limitations. It is the authoritative reference for the model implemented under
`backend/src/parser/**` and `backend/src/services/**`.

## Node types

| Node | Identity (`id`) | Emitted when |
| --- | --- | --- |
| Repository | `repository:<name>` | always (one per analysed repository) |
| Directory | `directory:<relativePath>` | derived from file paths |
| File | `file:<relativePath>` | for each scanned source file |
| Class | `class:<relativePath>:<ClassName>` | `class` declaration |
| Function | `function:<relativePath>:<Name>` | function declaration, or `const x = () => {}` / `const x = function () {}` |
| Method | `method:<relativePath>:<ClassName>:<Name>` | class method |

`Variable` is a reserved node type but is **not** emitted by the extractor.

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
4. Self-loops (`source === target`) are dropped.
5. Edges are de-duplicated by `source|type|target`; evidence on the first occurrence is kept.

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
