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
pnpm -F @teloi/web test:browser -- -t "pattern"  # Filter by test name

# Type checking (must run from apps/web due to monorepo path aliases)
cd apps/web && pnpm tsc --noEmit

# Linting
pnpm eslint .             # Lint entire repo (auto-fixes via lint-staged on commit)
```

## Rules

Never create type aliases for backwards compatibility (e.g., type OldName = NewName). Either rename the original to the correct name, or update all usages to the correct name. Aliases obscure the codebase and add confusion.

When making commits, use `git log -5 --format=full` to see actual commit messages (not `--oneline` which only shows titles). Commits have a subject line + body explaining what changed and why. Match the existing style. Don't put corpo bullshit there (commited with Claude shit). Before committing, review all changed files to ensure no unnecessary comments were added.

Comments should explain **why**, not **what**. The code already shows what it does—comments that repeat the code are noise. Write comments only for:
- Non-obvious reasoning or edge cases ("We check X before Y because Z can cause...")
- Workarounds for external limitations ("CodeMirror doesn't expose X, so we...")
- Important constraints or invariants that aren't obvious from the code

Never write comments like `// Set the text` above `setText(value)`. If the code needs a comment to explain what it does, the code should be rewritten to be clearer.

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
- [ ] Breadcrumbs (needs design)
- [ ] Block selection (multi-block select)
- [ ] Sidebar (in progress on `feature/sidebar`)
  - [ ] Implement shortcut for hiding sidebar
- [ ] Dev script: ccusage for ~/.claude and ~/.clancy
- [ ] Fix failing tests
- [ ] Implement move block below and move block above

**Known bugs**:
- [ ] DataPort import duplicates text on re-import: `importData` clears Yjs for existing node IDs but doesn't clear the INCOMING node IDs before inserting. Since y-indexeddb persists, re-importing the same backup causes text to double (insert(0, text) prepends to existing content instead of replacing)

**Text Content Architecture**:
- **LiveStore**: Structure (nodes, parent_links, ordering), selection state, UI state
- **Yjs**: Text content per node (`YjsT` service, `y-indexeddb` persistence)
- Split/merge update both; typing only touches Yjs
- Future: Automerge migration for richer version history (time-travel, branching)
