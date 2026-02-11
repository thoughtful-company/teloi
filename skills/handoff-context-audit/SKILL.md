---
name: handoff-context-audit
description: Audit a handoff before implementation by reading handoff.md, mapping affected code areas, loading required project docs, and reporting context/state/questions without making any code changes. Use when a user asks for a read-only intake pass, handoff verification, or pre-implementation status check.
---

# Handoff Context Audit

## Overview

Perform a strict read-only intake from `handoff.md` and related files.
Do not implement, edit, or run change-making commands in this workflow.

## Required Sequence

1. Read `handoff.md` in the project root.

2. Before any deeper investigation, identify every area referenced by the handoff.
Map domains such as tests, keyboard shortcuts, commands, services, UI, logging, and any other touched subsystem.

3. Load required docs based on touched areas.
Always re-read `CLAUDE.md` and explicitly reflect on which rules apply.
If tests are mentioned, read `docs/testing.md`.
If keyboard shortcuts are mentioned, read `docs/shortcuts.md`.
If logging is mentioned, read `docs/logging.md`.
Read any additional area-specific docs that are directly relevant.

4. Read every file referenced in the handoff.
Form an independent understanding from code and docs instead of trusting the handoff blindly.

5. Stop at reporting.
Do not make code changes, do not run implementation steps, and do not execute fix-oriented actions.

## Reporting Contract

Report exactly these sections to the user:

1. `Context`
Summarize what the previous session was doing in 2-3 sentences.

2. `Current state`
State what is done and what remains.
Cite specific file paths and line numbers for each important claim.

3. `What I found`
Call out anything inconsistent between handoff claims and actual code/docs.
If everything checks out, say that explicitly.

4. `Questions`
List ambiguities that require user decisions.
Ask before assuming when multiple interpretations are plausible.

5. `Gaps`
Identify missing but useful information from the handoff or `CLAUDE.md`.
Suggest concrete updates to improve future handoffs when warranted.

## Non-Goals

Do not patch files.
Do not run tests except when a user explicitly asks for execution during this audit phase.
Do not propose implementation details unless the user asks for a plan after the report.
