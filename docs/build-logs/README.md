# CodeAtlas — Build Logs

This folder keeps a running, one-file-per-build record of major CodeAtlas increments.
A new log is opened at each major update (typically after a supervisor meeting) and
closed when the next build begins, so the project always has a dated history of what
was built, why, and the state of the system at that point.

## Naming convention

```
build-<NN>-<build-name>.md
```

- `<NN>` — zero-padded, strictly increasing build number (`01`, `02`, `03`, …).
- `<build-name>` — short lowercase-hyphenated build name (e.g. `prototype-test01`).

Example: `build-01-prototype-test01.md`

Every file name is therefore unique; the build number and build name are also repeated
in the metadata header inside the file.

## Required sections in each log

Each build log must contain, in order:

1. **Metadata header** — unique file name, build number, build name, status, dates, author.
2. **Build context** — the meeting goal and the targets agreed for this build.
3. **Features delivered** — every feature present in the system at close of build.
4. **Complete technology stack** — languages, runtime, libraries (with versions), database, tooling.
5. **Flow of execution** — end-to-end runtime flow of the current system.
6. **Supporting detail** — data model, API surface, architecture pointers.
7. **Verification / evidence** — what was actually verified and how.
8. **Known limitations / deferred** — what is intentionally not done yet.
9. **Next build targets** — what the following build is expected to cover.

## Index

| Build | Name | File | Status | Date |
| --- | --- | --- | --- | --- |
| 01 | prototype-test01 | [build-01-prototype-test01.md](./build-01-prototype-test01.md) | Closed | 2026-10-09 |
| 02 | kg-relevance-ui | [build-02-kg-relevance-ui.md](./build-02-kg-relevance-ui.md) | Closed | 2026-10-13 |

## Related documentation

- System diagrams: [`../diagrams/`](../diagrams/README.md)
- F1 system guide: [`../../CodeAtlas_F1_System_Guide.txt`](../../CodeAtlas_F1_System_Guide.txt)
- Project proposal: [`../../proposal/CodeAtlas Project Proposal Final.docx`](../../proposal/CodeAtlas%20Project%20Proposal%20Final.docx)
