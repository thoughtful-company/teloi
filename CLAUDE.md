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

## Build & Development Commands

```bash
# Development
pnpm dev:web              # Start web app dev server (localhost:3003)

# Testing
pnpm -F @teloi/web test   # Run all tests (vitest)
pnpm -F @teloi/web test:browser  # Run browser tests only (headless)

# Type checking
pnpm tsc --noEmit         # Check all TypeScript errors

# Linting
pnpm eslint .             # Lint entire repo (auto-fixes via lint-staged on commit)
```

## Rules

Never create type aliases for backwards compatibility (e.g., type OldName = NewName). Either rename the original to the correct name, or update all usages to the correct name. Aliases obscure the codebase and add confusion.

When making commits, use `git log -5 --format=full` to see actual commit messages (not `--oneline` which only shows titles). Commits have a subject line + body explaining what changed and why. Match the existing style. Don't put corpo bullshit there (commited with Claude shit).

Only write comments that describe non-obvious things happening in code. Don't write comments for self-documenting code.

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

## Tech Stack
- **Framework**: SolidJS (not React)
- **Styling**: Tailwind CSS v4
- **Editor**: CodeMirror 6
- **Build**: Vite 7
- **Testing**: Vitest with Playwright for browser tests
- **State**: LiveStore (local-first SQLite with event sourcing)

## Space for thinking

**Goal**: Text editor with CodeMirror. Previously used EditContext API, but selection sync between DOM and model proved too limiting. CodeMirror's monospace assumption is acceptable—vertical cursor jump is barely noticeable, and Obsidian proves it's solvable.

**Component Hierarchy**:
```
App
└─ EditorBuffer (subscribes to buffer, renders document tree)
     └─ Block (one per node in document)
          ├─ focused: TextEditor (CodeMirror instance)
          └─ unfocused: plain text render
```

- **EditorBuffer**: Subscribes to buffer, gets root node and children, renders Block components
- **Block**: Represents a single node. Only the focused block mounts CodeMirror.
- **TextEditor**: Thin wrapper around CodeMirror for in-block text editing. Block-level operations (splitting, creating blocks) handled by parent.
- Advanced features (marks, decorators) via Lezer with custom grammar (future).

**Work items**:
- [x] Render a document object in browser with editable content.
- [x] Editable block with proper state management
- [x] Block splitting (Enter key creates new sibling block). 
- [ ] Keyboard navigation between blocks (Arrow keys)
  - [x] ArrowLeft
    - [x] At position 0 → focus previous sibling at end
    - [x] Previous sibling has children → go to deepest last child
    - [x] First sibling → go to parent
    - [x] First block in document → go to title
  - [x] ArrowRight
  - [x] ArrowUp
  - [ ] ArrowDown
- [ ] Block merging (Backspace at start merges with previous)
- [ ] Block indentation (Tab/Shift+Tab for nesting)
- [ ] Verify if selection syncs from livestore to codemirror properly
- [ ] Add visual comments for tests
    // ******* GIVEN THE BUFFER *******
    // Title
    // ==========
    // ▶ Child 1
    // ▶ Ch|ild 2
    //     ^  ← CURSOR HERE (position 2)
    //
    // ******* WHEN *******
    // User presses |↑| (arrow up)
    //
    // ******* EXPECTED BEHAVIOR *******
    // Cursor moves one block up to the same place
    // Title
    // ==========
    // ▶ Child 1
    //     ^  ← CURSOR HERE (position 2)
    // ▶ Ch|ild 2
