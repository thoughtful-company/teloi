---
paths:
  - "docs/**"
---

# Documentation Rules

Read this before editing any file in `docs/`.

## Document Types

### Concept docs (`docs/concepts/`)

Describe the **target architecture** — what the system *will be*, not what it is today. No current-state caveats, no "currently X but planned Y" hedging. If the design is decided, write it as fact.

### Spec docs (`docs/specs/`)

Design documents that capture reasoning, tradeoffs, and open questions. Open questions are expected here, but must be kept current:
- Remove questions that have been resolved (move decisions to the appropriate concept doc or the spec's own "Strategic Decisions" section)
- Add new open questions as they're identified
- A stale open question is worse than no documentation — it misleads future readers into thinking something is still up for debate

### Other docs (`docs/`)

Operational references (testing, logging, shortcuts, navigation). Describe current behavior accurately. Update when behavior changes.

## General Rules

1. **Don't mix target and current state.** Pick one. Concept docs = target. Operational docs = current.
2. **Decisions need reasoning.** When documenting a design decision, include *why* — especially when alternatives were considered and rejected.
3. **No duplicating CLAUDE.md.** If something is a coding convention or workflow rule, it goes in CLAUDE.md. Docs are for design and architecture.
