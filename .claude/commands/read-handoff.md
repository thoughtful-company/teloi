Read `handoff.md` in the project root. This is a context handoff from a previous Claude session.

**Before doing anything else**, identify every area of the codebase the handoff touches (tests, commands, services, UI, etc.) and read the corresponding docs and guidelines:

- If tests are mentioned: read `docs/testing.md`
- If keyboard shortcuts are mentioned: read `docs/shortcuts.md`
- If logging is mentioned: read `docs/logging.md`
- Always re-read `CLAUDE.md` — reflect on which rules apply to the work described

Then read every file mentioned in the handoff to form your own understanding of the current state.

---

**Report to the user** (do NOT take any action beyond reading):

1. **Context**: What was the previous session doing? Summarize in 2-3 sentences.
2. **Current state**: What's done, what's left? Reference specific files and line numbers.
3. **What I found**: Anything that looks off, inconsistent, or different from what the handoff claims. If everything checks out, say so.
4. **Questions**: Anything ambiguous, unclear, or that could go multiple ways. Ask before assuming.
5. **Gaps**: Information that was missing from the handoff or from CLAUDE.md but would have been useful. Suggest updates if warranted.
