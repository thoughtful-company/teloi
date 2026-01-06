# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

Claude uses this document as the guiding star for development process. It is the central place for both AI and human to persist progress on the project.

## Maintaining This Document

Claude should proactively update this file when:
- A discussion reveals patterns, decisions, or context worth preserving
- Architecture or coding conventions change
- New services, modules, or significant features are added
- Existing documentation becomes outdated or misleading

Updates should be minimal and surgical—add only what's necessary to keep the document accurate and useful. Don't duplicate information that can be easily discovered from the code itself.

## Type checking

```bash
# Must run from apps/web due to monorepo path aliases
cd apps/web && pnpm tsc --noEmit
```

## Rules

Never create type aliases for backwards compatibility (e.g., type OldName = NewName). Either rename the original to the correct name, or update all usages to the correct name. Aliases obscure the codebase and add confusion.

When making commits, use `git log -5 --format=full` to see actual commit messages (not `--oneline` which only shows titles). Commits have a subject line + body explaining what changed and why. Match the existing style. Don't put corpo bullshit there (commited with Claude shit). Before committing, review all changed files to ensure no unnecessary comments were added.

Comments should explain **why**, not **what**. The code already shows what it does—comments that repeat the code are noise. Write comments only for:
- Non-obvious reasoning or edge cases ("We check X before Y because Z can cause...")
- Workarounds for external limitations ("CodeMirror doesn't expose X, so we...")
- Important constraints or invariants that aren't obvious from the code

Never write comments like `// Set the text` above `setText(value)`. If the code needs a comment to explain what it does, the code should be rewritten to be clearer.

Use the askuserquestiontool to ask as many follow ups as you need to reach clarity.

When working on keyboard shortcuts, always check `docs/shortcuts.md` first to understand which level (app, context, or editor) the shortcut belongs to.

When you are about to make a new feature, ALWAYS consider writing a test first.

## Logging

**Why logging usually sucks**: Logs optimized for writing ("I'm setting X now") instead of querying ("what happened to this request?"). At scale, you get 130k scattered lines/second that grep can't correlate. String search doesn't understand structure.

**The fix**: Wide events. One comprehensive log per operation containing everything you'd need to debug it later. Not "entering function", "got value", "returning" — just one "Operation completed" with all context attached.

Use Effect's logging with `annotateLogs` for structured context:

```typescript
// BAD: scattered, implementation-focused, unqueryable
yield* Effect.logDebug("Setting selection");
yield* Effect.logDebug(`bufferId is ${bufferId}`);
yield* Effect.logDebug("Selection set successfully");

// GOOD: one wide event, outcome-focused, queryable
yield* Effect.logDebug("[Buffer.setSelection] Selection updated").pipe(
  Effect.annotateLogs({
    bufferId,
    nodeId: selection.anchor.nodeId,
    offset: selection.anchorOffset,
    goalX: selection.goalX,
  }),
);
```

**What to include**: Request/entity IDs, relevant state, outcome. Think "what would I grep for when debugging this at 3am?"

**When to log**:
- `logDebug`: State transitions that matter (selection changes, navigation, focus)
- `logTrace`: High-frequency events you'd only enable when hunting specific bugs
- `logError`: Failures with full context to reproduce

**Don't log inside components** — React/Solid code runs outside Effect context. Log in services where Effect.log* works.

## Project Structure

This is a pnpm monorepo with:
- `apps/web` - SolidJS web application (`@teloi/web`)
- `packages/typescript-config` - Shared TypeScript config

## Architecture Overview

### Effect-TS Pattern
The codebase uses **Effect-TS** extensively for typed functional programming:
- Services are defined as `Context.Tag` with explicit interfaces
- Layers (`Layer.effect`) compose services with dependency injection
- All async operations return `Effect.Effect<Result, Error, Dependencies>`
- Use `pipe()` for chaining operations and `Effect.gen()` for generator-based composition
- Errors are typed with `Data.TaggedError` for discriminated unions

### Service Layer Architecture (`apps/web/src/services/`)
Three-tier service organization:
- **external/** - External integrations (LiveStore database wrapper via `StoreT`)
- **domain/** - Business logic services (e.g., `NodeT` for node operations)
- **ui/** - UI-specific services (e.g., `BufferT` for editor buffer state)

Services follow this pattern:
```typescript
export class ServiceT extends Context.Tag("ServiceT")<ServiceT, ServiceInterface>() {}
export const ServiceLive = Layer.effect(ServiceT, Effect.gen(function* () { ... }));
```

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

### URL-Based Navigation
URL format: `/workspace/<nodeId>` (workspace name hardcoded for now)

**Bidirectional sync between URL and active buffer's `assignedNodeId`:**
- **Browser → Model** (on page load or back/forward): Parse URL, update active buffer's `assignedNodeId`
- **Model → Browser** (on programmatic change): Update URL via `history.pushState`

**Key services:**
- `URLServiceB` (`services/browser/URLService.ts`) - Low-level URL access with `getPath()`, `setPath()`, and popstate stream
- `NavigationT` (`services/ui/Navigation/`) - Orchestrates URL ↔ buffer sync

**Trigger conditions:**
- Page load (including reload from typing URL + Enter): URL → Buffer
- Back/forward buttons (popstate events): URL → Buffer
- Programmatic `assignedNodeId` changes: Buffer → URL

**Edge cases:**
- No nodeId in URL → show empty buffer (nothing rendered)
- Invalid nodeId → show empty buffer (node doesn't exist)

### Development Approach
**TDD-first**: With all other things being equal, start by write tests **before** implementing features. Browser tests (`pnpm -F @teloi/web test:browser`) for UI components, unit tests for services and utilities.

### Test Writing Conventions
Tests use a **declarative BDD style** with Given/When/Then helpers from `src/__tests__/bdd/*.ts`.

**Development workflow**:
1. **Initial test writing**: Use existing BDD utilities or low-level ones (`userEvent.keyboard`, `waitFor`, direct Effect calls) to get the test working
2. **Test refactoring**: Extract repetitive patterns into Given/When/Then helpers
3. **Helpers location**: `src/__tests__/bdd/given.ts`, `when.ts`, `then.ts`

**Naming conventions**:
- `Given.*` - Setup state (buffers, nodes, initial conditions)
- `When.*` - User actions (clicks, keyboard input, navigation)
- `Then.*` - Assertions (model state, DOM state, selection)

**Key principles**:
- Test body should read like a specification, not implementation details
- Hide Effect machinery and DOM queries inside helpers
- Assertions check model state (LiveStore), not just DOM

**Testing Anti-Patterns** (DO NOT USE):
- `yield* Effect.sleep("50 millis")` or any arbitrary sleep duration - These make tests slow and flaky. Total test time explodes when every test adds random delays. Instead:
  - Try to run tests without waiting, probably they'll pass
  - Use `waitFor()` to poll for expected state changes
  - Use proper async patterns that wait for specific conditions
  - If you must wait, wait for a specific event/condition, not arbitrary time

## Tech Stack
- **Framework**: SolidJS (not React)
- **Styling**: Tailwind CSS v4
- **Editor**: CodeMirror 6
- **Build**: Vite 7
- **Testing**: Vitest with Playwright for browser tests
- **State**: LiveStore (local-first SQLite with event sourcing)

## Space for thinking

**Component Hierarchy**:
```
App
├─ Sidebar (navigation, page list)
└─ EditorBuffer (subscribes to buffer, renders document tree)
     ├─ Title (editable node title, CodeMirror)
     └─ Block (one per child node)
          ├─ focused: TextEditor (CodeMirror instance)
          └─ unfocused: plain text render
```

- **EditorBuffer**: Subscribes to buffer, gets root node and children, renders Block components
- **Block**: Represents a single node. Only the focused block mounts CodeMirror.
- **TextEditor**: Thin wrapper around CodeMirror. Block-level operations (split, merge, indent) handled by Block.

**Completed foundations**: Block editing (split/merge/indent), keyboard navigation between blocks, cursor navigation across soft-wrap boundaries, URL-based navigation (`/workspace/<nodeId>`), Mod+. to zoom into block, Yjs-powered undo with cross-block persistence.

**Active work**:
- [ ] Block-level undo (structural changes, not just text)
- [ ] Implement toggles for nodes that have children >
  This is a complicated feature that requires revamping how Enter, Delete, Backspace and arrow navigation work.
  Problem appears: how to combine toggles with list elements.
- [ ] Breadcrumbs (needs design)
- [ ] Dev script: ccusage for ~/.claude and ~/.clancy
- [ ] Fix failing tests
- [ ] Implement move block below and move block above
- [ ] Implement different document types (see `docs/ontology.md`)
- [ ] Remove new node creation upon buffer initialization
- [ ] Bug: if the whole node is selected, upon reload, selection is lost
- [ ] Bug: if you select part of a node and press enter, the selected part does not get deleted
- [ ] Remove all `Effect.sleep` with arbitrary durations from tests (see Testing Anti-Patterns below)
- [ ] Implement delete button for sidebar items that shows up on hover and deletes an element
  button is located on the right side of a list item
- [ ] When selection is set to wrap place with assoc 0, it causes problems
- [ ] Implement home node for a workspace
  Home node should have an icon leftmost in heading and should display top-level workspace nodes.
  We can also create workspace node explicitly and move top level nodes there.
- [ ] Block selection (multi-block select)
  - [x] Add visual queues for selected blocks
  - [x] Allow to select blocks with arrow up and arrow down
    This is tricky. When you have selected nodes like this:
   - A
   - B
   - C |
   with C being currently focused node
  - [x] Allow to copy content of selected blocks (Mod+C)
  - [x] When you go down with selected block, it does not scroll into view
  - [x] Feature: when you have in-block selection and have focus offset 0 and press shift+up, you enter buffer-level selection with current block selected
    - [x] Basic implementation (Shift+Up from text selection)
    - [x] Mirror implementation for shift+down (Shift+Down from text selection)
- [ ] Add spacing between paragraphs

**Bugs**:
- [ ] When you delete a node from sidebar that you currently focus, it stays on the screen
  Probably, we can redirect to home
- [ ] Update export feature to account for tuples and types
- [ ] Navigation from empty node to previous node is cursed
- [ ] Fix spacing between elements
  - [ ] temporary fix: make spacing with flex and gap
- [x] When I click on title, block selection in browser is not cleared
  Fixed: EditorBuffer now clears selectedBlocks when transitioning out of block selection mode
- [ ] When you copy list elements and todo's they should be copied the right way
- [ ] When you stay on the first block in selection mode and press up, you need to scroll up to the top of the buffer
- [ ] When you indent node and outline it with "- ", they should be on the same X axis.

**Text Content Architecture**:
- **LiveStore**: Structure (nodes, parent_links, ordering), selection state, UI state
- **Yjs**: Text content per node (`YjsT` service, `y-indexeddb` persistence)
- Split/merge update both; typing only touches Yjs
- Future: Automerge migration for richer version history (time-travel, branching)
