---
name: export-context
description: Generate a self-contained handoff prompt for starting a fresh chat on one concrete problem while preserving useful context from the current conversation. Use when the user asks to export context, create a handoff, reset conversation scope without losing understanding, or summarize active debugging/discovery work into a reusable prompt.
---

# Export Context

## Overview

Create a prompt another Codex instance can use to continue the same problem with clean context boundaries.
Treat the result as a handoff, not an execution spec.

## Workflow

1. Determine scope from user input.
If the user supplies a topic, use it. If not, scope to the most recent active problem.

2. Detect mode from user phrasing.
Treat `--skip` or `-s` as skip mode. Otherwise use interactive mode.

3. Run mode behavior.
In interactive mode, think out loud about scope, identify ambiguities, ask clarifying questions, and iterate until the user confirms understanding. In skip mode, generate directly, but still ask if scope is genuinely ambiguous.

4. Build the handoff content.
Write conversational prose that explains what was being attempted, what is broken or confusing, and what has been learned so far.
Mention relevant files with why each one matters.
Include approaches discussed only if the human explicitly mentioned them, and frame them as hypotheses to re-evaluate.

5. Exclude unhelpful material.
Do not include direct solutions.
Do not include irrelevant solved tangents.
Do not include formal ticket boilerplate unless it materially improves clarity.

6. Emit the required template exactly and save it to `handoff.md` in the project root.

## Output Template

Use this structure:

```md
[Context from a previous Claude session]

<Prose explaining the problem — what we were working on, what's weird, relevant files woven in. Conversational, not clinical.>

---

[Human notes]

<Empty space for the human to add context, corrections, or steering before pasting.>

---

The above is a handoff, not a spec. Read the mentioned files, form your own understanding, and check with the human if anything seems off or unclear before diving in.
```

After writing `handoff.md`, provide a short verification summary with:

- `TL;DR:` one sentence describing what the prompt is about.
- `Caveats:` uncertainties, assumptions, and places where the handoff may be wrong.
