# CLAUDE.md

## Maintaining This Document

You should **ALWAYS** proactively update this file when:
- A discussion reveals patterns, decisions, or context worth preserving
- Architecture or coding conventions change
- New services, modules, or significant features are added
- Existing documentation becomes outdated or misleading

Updates should be minimal and surgical—add only what's necessary to keep the document accurate and useful. Don't duplicate information that can be easily discovered from the code itself.

## Commands

```bash
# Testing - ALWAYS specify filename first to avoid scanning all files
pnpm -F @teloi/web test:browser src/path/to/file.test.tsx
pnpm -F @teloi/web test:browser src/path/to/file.test.tsx -t "test name pattern"
pnpm -F @teloi/web test:browser      # Run ALL browser tests (slow, avoid unless needed)

# Type checking
pnpm -F @teloi/web typecheck

# GitHub
gh api repos/:owner/:repo/issues/17  # Look up issue details
```

## Rules

**Always create a new branch** before starting work on a new feature. Never commit directly to main, and never mix unrelated work into an existing feature branch.

**Comments** should explain **why**, not **what**. The code already shows what it does—comments that repeat the code are noise. Write comments only for:
- Non-obvious reasoning or edge cases ("We check X before Y because Z can cause...")
- Workarounds for external limitations ("CodeMirror doesn't expose X, so we...")
- Important constraints or invariants that aren't obvious from the code

Use the AskUserQuestion tool to ask as many follow-ups as you need to reach clarity.

When working on keyboard shortcuts, always check `docs/shortcuts.md` first to understand which level (app, context, or editor) the shortcut belongs to.

**TDD-first (MANDATORY)**: You MUST write tests **before** implementing ANY feature code. Do NOT write implementation until tests exist. This is non-negotiable—no exceptions.

**ALWAYS** use the `test-architect` sub-agent (Task tool with `subagent_type: "test-architect"`) for ANY test-related work—writing new tests, modifying existing tests, fixing failing tests. Never write test code directly. If you catch yourself about to write implementation before tests exist, STOP and write tests first.

**NEVER claim a task is complete without verification.** Before saying you're done, you MUST verify the solution actually works—run the tests, run the typecheck, or whatever proves it's not broken. "I think this should work" is not verification. Actual passing output or it didn't happen.

**Always** strictly follow logging standards in `docs/logging.md`. Use "Wide Events" and `Effect.annotateLogs`.

## Project Structure
This is a pnpm monorepo with:
- `apps/web` - SolidJS web application (`@teloi/web`)
- `packages/typescript-config` - Shared TypeScript config

### Tech Stack
- **Framework**: SolidJS
- **Styling**: Tailwind CSS v4
- **Editor**: CodeMirror 6
- **Build**: Vite
- **Testing**: Vitest with Playwright for browser tests
- **State**: LiveStore (local-first SQLite with event sourcing)

### Commands
- `pnpm -F @teloi/web dev` - Start dev server
- `pnpm -F @teloi/web dev --port 3001` - Dev server on specific port
- `pnpm -F @teloi/web build` - Build (also runs typecheck)
- `pnpm -F @teloi/web test:browser` - Run browser tests

## Architecture Overview

**Component Hierarchy**:
- **App**
  - **Sidebar** (navigation, page list)
  - **EditorBuffer**: is akin to page view of a node.
    Subscribes to buffer, renders title and children as tree.
    - **Title**
      Unfocused/focused same as Block
    - **Block**
      - `Unfocused`: plain text render
      - `Focused`: **TextEditor**
        - Thin wrapper around CodeMirror 
      - Child blocks (also Block components)

**Text Content Architecture**:
- **LiveStore**: Structure (nodes, parent_links, ordering), selection state, UI state
- **Yjs**: Text content per node (`YjsT` service, `y-indexeddb` persistence)
- Split/merge update both; typing only touches Yjs

### LiveStore Integration
Local-first SQLite database with event sourcing:
- Schema defined in `apps/web/src/livestore/schema.ts`
- Events materialize into SQLite tables (nodes, parent_links, client documents)
- `StoreT` service provides typed queries and subscriptions via Effect streams

### Schema System (`apps/web/src/schema/`)
Typed domain models using Effect Schema:
- `Model.DocumentName` enum defines document types (Window, Pane, Buffer, Block, Selection)
- `Id` module provides branded ID types for type-safe entity references
- `Entity` module defines reusable entity structures

### Runtime
`apps/web/src/runtime.ts` - Creates a `ManagedRuntime` with full service layer composition:
- BlockLive → BufferLive → WindowLive → NodeLive → StoreLive (via `Layer.provideMerge`)
- LiveStore initialized from `livestore/store.ts`
- Exported as `BrowserRuntime` and provided via SolidJS context

### Navigation
URL format: `/workspace/<nodeId>` (workspace name hardcoded for now)

**Key services:**
- `URLServiceB` (`services/browser/URLService.ts`) - Low-level URL access with `getPath()`, `setPath()`, and popstate stream
- `NavigationT` (`services/ui/Navigation/`) - Orchestrates URL ↔ buffer sync

## Coding Pattern

**Effect-TS** use it extensively for types programming, also use utils from there.
- **Services** are used to abstract functionality like modules. They are defined as `Context.Tag` with explicit interfaces.
  `apps/web/src/services/`
  Three-tier service organization:
  - **external/** - External integrations (LiveStore database wrapper via `StoreT`)
  - **domain/** - Business logic services (e.g., `NodeT` for node operations)
  - **ui/** - UI-specific services (e.g., `BufferT` for editor buffer state)
- **Layers** (`Layer.effect`) compose services with dependency injection. Currently there is one layer: `BrowserLayer` in `runtime.ts`.
- **Errors** are typed with `Data.TaggedError` for discriminated unions
