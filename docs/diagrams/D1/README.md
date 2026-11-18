# CodeAtlas — System Diagrams

System diagrams for the CodeAtlas FYP, aligned with the final proposal
(`proposal/CodeAtlas Project Proposal Final.docx`) and cross-checked against the
implemented F1 prototype source and `CodeAtlas_F1_System_Guide.txt`.

## Contents

| File | Diagram |
| --- | --- |
| [`01-use-case.md`](./01-use-case.md) | Use Case diagram |
| [`02-architecture.md`](./02-architecture.md) | Architecture diagram |
| [`03-class.md`](./03-class.md) | Class diagram |
| [`04-erd.md`](./04-erd.md) | ERD / graph data model |

## Sources

- **Primary (target system):** `proposal/CodeAtlas Project Proposal Final.docx`
  — six-module MVP, layered architecture, tech stack, roles.
- **Implemented prototype (F1):** `README.md`, `CodeAtlas_F1_System_Guide.txt`,
  `backend/src/**`, `frontend/src/**`.

The proposal describes the full CodeAtlas platform; the current prototype implements
only **Module 1 (AST-based knowledge graph)** end to end. Each diagram marks what is
implemented versus planned, so the document reflects both the design and the build
status.

## Implementation-status legend

- **Solid** — implemented in the F1 prototype and verified in source.
- **Dashed / marked "planned"** — specified in the proposal, not yet built in F1.

## Rendering

The diagrams are written in **Mermaid** inside Markdown.

- **VS Code:** open the file and use Markdown Preview (`Ctrl+Shift+V`) — Mermaid
  renders natively.
- **GitHub:** renders automatically when the file is pushed.
- **Export to image:** `npx -y @mermaid-js/mermaid-cli -i 01-use-case.md -o 01-use-case.svg`
  (repeat per file; swap `-o` extension for `.png`).

## Notes on scope

- F1 supports **JavaScript/TypeScript** only, matching the proposal's language lock.
- F1 has **no authentication and no multi-user isolation**; the proposal adds
  JWT/Firebase auth and PostgreSQL for accounts/metadata.
- F1's pipeline is the **AST engine + graph + interactive map**. Guided tour,
  change-impact analysis, contextual search, vulnerability analysis, export, and the
  LLM layer are proposal features planned for later phases.
- Variables/objects are reserved node types in the code but are not currently emitted
  by the entity extractor.
