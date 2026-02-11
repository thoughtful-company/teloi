# CLAUDE.md

1. Each time you are tasked with a problem, think deeply and carefully.
  a. When **approaching a problem** that is more complex than usual, analyze it with greater depth.
  b. When you **present a solution** to me
    - Make sure you considered multiple approaches.
    - Include potential edge cases and tradeoffs.
    - Solution must solve the exact problem specified (no more, no less)
  c. When I describe a problem, you should ONLY explain what you find. Don't start fixing things unless I explicitly ask you to. If I want you to fix something, I'll tell you directly - "fix it", "implement it", or give similar clear instruction.
2. Only perform the exact task given, using the most surgical, concise and elegant fix that changes as little code as possible. 
3. Every change must be intentional, minimal, and clean.
4. I am also a human and I often make mistakes and understand something not right. You should **be direct with me** and do not optimize for politeness.

## Maintaining This Document

You should **ALWAYS** proactively update this file when:
- A discussion reveals patterns, decisions, or context worth preserving
- Architecture or coding conventions change
- New services, modules, or significant features are added
- Existing documentation becomes outdated or misleading

Updates should be minimal and surgical—add only what's necessary to keep the document accurate and useful. Don't duplicate information that can be easily discovered from the code itself.

## Commands

```bash
# Development (not recommended for AI - prefer testing and typecheck)
pnpm dev:web              # Start web app dev server (localhost:3003)

# Testing - ALWAYS specify filename first to avoid scanning all files
pnpm -F @teloi/web test:browser src/path/to/file.test.tsx
pnpm -F @teloi/web test:browser src/path/to/file.test.tsx -t "test name pattern"
pnpm -F @teloi/web test:browser      # Run ALL browser tests (slow, avoid unless needed)

# Type checking
pnpm -F @teloi/web typecheck

# Linting
pnpm eslint .             # Lint entire repo

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

**Look before you theorize**: Don't make assertions or claims about how the code works until you've actually explored the relevant files. Speculation without investigation is bullshit—read the code first, then form opinions.

When working on keyboard shortcuts, always check `docs/shortcuts.md` first to understand which level (app, context, or editor) the shortcut belongs to.

**TDD-first (MANDATORY)**: You MUST write tests **before** implementing ANY feature code. Do NOT write implementation until tests exist. This is non-negotiable—no exceptions.

**Use `test-architect` for writing new tests** (Task tool with `subagent_type: "test-architect"`). For debugging flaky/failing tests, work directly—debugging is interactive and benefits from direct investigation. **Always read `docs/testing.md`** before writing, modifying, moving, or debugging any test code—whether directly or via an agent.

**Before saying you're done**: Always remind the user if any implemented functionality is not covered by tests. This is mandatory—never skip this check.

**Always** strictly follow logging standards in `docs/logging.md`. Use "Wide Events" and `Effect.annotateLogs`.

**No event suppression hacks**: Never use boolean flags to conditionally suppress/gate events or callbacks (e.g., `if (ready) dispatch(...)`). If the architecture requires such a hack, the approach is wrong—find a cleaner solution where the correct state exists from the start.

**No mocks in tests**: Never use mocks, stubs, or fakes. Tests should use real service implementations with test fixtures/data. If something is hard to test without mocks, that's a design smell—fix the design.

**No click-to-focus in tests**: Never use `USER_CLICKS_BLOCK` just to focus/activate a block. Use `SELECTION_IS_SET_TO` first, then `ACTIVE_ELEMENT_IS` — selection before activation, so the editor mounts with the cursor already in place.

## Deprecated Tests

All test files under `apps/web/src/__tests__/` are **deprecated**. Do not modify them. They need to be refactored and moved to colocated `__tests__/` directories next to the code they test (e.g., `src/commands/editor/__tests__/`).

## Unit Tests

Unit tests (`*.unit.test.ts`) run in Node via `@livestore/adapter-node` with in-memory storage. Use `makeAdapter({ storage: { type: "in-memory" } })` + `createStorePromise` for `StoreT`, and `makeAutomergeLive({ workspaceName: "...", persist: false })` for `AutomergeT`. Compose layers with `Layer.provideMerge` and run via `ManagedRuntime`. Cleanup goes in `beforeEach` (never `afterEach`), same as browser tests. See `test-utils/unit/setup.ts` for the shared setup function.

## Known System Resiliency Issues

**CodeMirror `EditorSelection.cursor()` returns a `SelectionRange`, not an `EditorSelection`**. Passing it directly as `selection:` in `view.dispatch()` silently drops `assoc` because `resolveTransactionInner` falls through to `EditorSelection.single(anchor, head)` which discards flags. Always wrap in `EditorSelection.create([...])`:
```ts
// WRONG — assoc is silently dropped
view.dispatch({ selection: EditorSelection.cursor(pos, -1) });

// CORRECT — assoc is preserved
view.dispatch({ selection: EditorSelection.create([EditorSelection.cursor(pos, -1)]) });
```

**Flaky coordinate/selection measurements in browser tests**: `waitFor` polling succeeds too early—before CodeMirror syncs its internal state to the DOM. Use `doubleRaf` from `@/utils/effect` instead of `waitFor` for any selection or coordinate assertions. For BDD helpers in `test-utils/bdd/then.ts`, prefer `doubleRaf.pipe(Effect.andThen(() => { /* assert */ }))` over `Effect.promise(() => waitFor(...))`.

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
  - **FrameView**: Renders a node. Subscribes to frame, renders title, view tabs, properties, and content.
    Conditionally renders **page view** (default outline) or an alternate view (e.g., **TableView**) based on `activeViewId`.
    See `docs/views.md` for the view system design.
    - **Title**
      Unfocused/focused same as Block
    - **Block**
      - `Unfocused`: plain text render
      - `Focused`: **Editor**
        - Thin wrapper around CodeMirror 
      - Child blocks (also Block components)

**Action Handling** (two systems, legacy migrating to new):

**New system** — `KeyEventBus` → `CommandBus` → Commands (`commands/`):
- `KeyEventBus` maps key events to `Command` objects via layered keymaps (plain, meta, shift, alt, blockSelection)
- `CommandBus` dispatches commands to static `handle` methods
- Sources: `"editor"` (from CodeMirror), `"app"` (from `window.keydown` in block selection mode)
- New keyboard shortcuts should be added as commands here

**Legacy system** — `ActionT` (`services/ui/Action/`):
- Components emit primitives: `KeyDown`, `SelectionChange`, `Blur`, `Focus`, `Click` (via `createDispatch(runtime)`)
- `ActionT` interprets meaning based on model state and executes state changes
- Synchronous execution: Must use `runSync` because `preventDefault()` requires immediate sync decision
- Being migrated to the command system above; avoid adding new handlers here

**Focus Architecture** (reactive, not imperative):
Focus is driven by state propagation, never by direct DOM `.focus()` calls:
1. Handler calls `Frame.enterBlockEditing(blockId)` (or `Frame.enterBlockSelection(frameId)`)
2. `BlockT.subscribe` emits updated view with `isActive: true`
3. Block component renders `<Editor>` when active
4. Editor calls `view.focus()` on mount

This means: to focus a block, update frame/world focus state. The UI reacts and focus happens as a consequence.

**Text selection invariant**:
- Text selection is strictly one-block-only. `Frame.getSelection` / `Frame.setSelection` now work with `{ blockId, selection: { anchor, head, assoc }, goalX, goalLine }`.
- Selection metadata is stored only on the frame document (`frame.selection`), not on block documents.
- Multi-block operations use `Frame.setBlockSelection` / `Frame.getBlockSelectionState` only.

**Focus ownership invariant**:
- Editing focus source of truth is `frame.selection.blockId`.
- Block-selection focus source of truth is `frame.blockSelectionAnchor` + `frame.blockSelectionFocus`.
- `frame.selectedBlocks` is persisted as a derived cache (not authoritative focus state).

Key services:
- `KeyEventBusT` — Routes keyboard events to commands via keymaps
- `CommandBusT` — Dispatches command objects to their handlers
- `ActionT` — Legacy keyboard/mouse action interpretation (being migrated)
- `PickerT` — Type picker state (open/close, query)
- `BlockT.subscribe` — Unified view stream (combines all block state into one subscription)
- `ViewT` — View queries and creation (`services/ui/View/`)
- `ChatT` — Chat message collection and role mapping (`services/ui/Chat/`)

**Text Content Architecture**:
- **LiveStore**: Structure (nodes, parent_links, ordering), selection state, UI state
- **Automerge**: Text content per node (`AutomergeT` service, synced via `automerge-repo`)
- Split/merge update both; typing only touches Automerge

**Ghost Block Pattern**:
Automerge text is independent of LiveStore—we can bind an Editor to a pre-generated nodeId's Automerge text before creating the LiveStore node. On first structural mutation, we "materialize" the ghost by creating the LiveStore node with the same ID. The typed content is preserved because the real Block binds to the same Automerge text.

Two use cases share this pattern:

1. **PropertySection ghosts** (`ui/PropertySection.tsx`): Empty property editor that materializes on first keystroke (debounced 50ms). See `services/ui/Property/addLinkedBlock.ts`.

2. **Expand/collapse ghosts** (`services/ui/Block/expand.ts`): When expanding a childless block, a ghost child appears for typing. Created via `expandOneLevel`, materialized via `Block.materialize`.

**Ghost invariants**:
- A ghost only exists when its parent has **zero real children** (created when `children.length === 0`)
- Ghost state lives on block documents: parent has `ghostChildId`, ghost has `ghostParentId`
- Ghosts have **no LiveStore rows** (`nodes`, `parent_links`)—`Node.getParent(ghostId)` fails
- Any tree mutation on a ghost (except deletion) **materializes first**, then proceeds normally
- Collapsing a parent with a ghost cleans up the ghost (deletes Automerge text, clears block docs)

Key files: `services/ui/Block/materialize.ts`, `services/ui/Block/getBlockDoc.ts`, `services/ui/Block/expand.ts`

### LiveStore Integration
Local-first SQLite database with event sourcing:
- Schema defined in `apps/web/src/livestore/schema.ts`
- Events materialize into SQLite tables (nodes, parent_links, client documents)
- `StoreT` service provides typed queries and subscriptions via Effect streams

### Schema System (`apps/web/src/schema/`)
Typed domain models using Effect Schema:
- `Model.DocumentName` enum defines document types (Window, Pane, Frame, Block, Selection)
- `Id` module provides branded ID types for type-safe entity references
- `Entity` module defines reusable entity structures

### Runtime
`apps/web/src/runtime.ts` - Creates a `ManagedRuntime` with full service layer composition:
- BlockLive → FrameLive → WorldLive → NodeLive → StoreLive (via `Layer.provideMerge`)
- LiveStore initialized from `livestore/store.ts`
- Exported as `BrowserRuntime` and provided via SolidJS context

### Navigation
URL format: `/workspace/<nodeId>` (workspace name hardcoded for now)

**Key services:**
- `URLServiceB` (`services/browser/URLService.ts`) - Low-level URL access with `getPath()`, `setPath()`, and popstate stream
- `NavigationT` (`services/ui/Navigation/`) - Orchestrates URL ↔ frame sync

## Coding Pattern

**File layout**: Exported API (command classes, public functions) goes at the top of the file. Internal helpers go below a box-drawing separator:
```ts
// ================================ Internal ==================================
```
The separator is 80 characters wide (including `// ` prefix).

**Command naming**: Commands that directly mirror a keyboard key are named after the key (`Left`, `Right`, `Backspace`, `Delete`). Commands that represent an action not tied to a single key use action verbs (`MoveToLineStart`, `MoveWordLeft`, `DeleteToLineEnd`, `DeleteWordForward`).

**Effect-TS** use it extensively for types programming, also use utils from there.
- **Services** are used to abstract functionality like modules. They are defined as `Context.Tag` with explicit interfaces.
  `apps/web/src/services/`
  Three-tier service organization:
  - **external/** - External integrations (LiveStore database wrapper via `StoreT`)
  - **domain/** - Business logic services (e.g., `NodeT` for node operations)
  - **ui/** - UI-specific services (e.g., `FrameT` for frame state)
- **Layers** (`Layer.effect`) compose services with dependency injection. Currently there is one layer: `BrowserLayer` in `runtime.ts`.
- **Errors** are typed with `Data.TaggedError` for discriminated unions
- **Tracing**: Use `Effect.fn` for traceable functions instead of plain `Effect.gen`:
  ```ts
  // Good - traceable
  const myFunction = Effect.fn("myFunction")(function* (arg: string) {
    // ...
  });

  // Avoid - not traceable
  const myFunction = (arg: string) => Effect.gen(function* () {
    // ...
  });
  ```
