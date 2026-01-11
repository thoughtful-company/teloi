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
```

## Rules

**Comments** should explain **why**, not **what**. The code already shows what it does—comments that repeat the code are noise. Write comments only for:
- Non-obvious reasoning or edge cases ("We check X before Y because Z can cause...")
- Workarounds for external limitations ("CodeMirror doesn't expose X, so we...")
- Important constraints or invariants that aren't obvious from the code

Use the AskUserQuestion tool to ask as many follow-ups as you need to reach clarity.

When working on keyboard shortcuts, always check `docs/shortcuts.md` first to understand which level (app, context, or editor) the shortcut belongs to.

**TDD-first**: Write tests **before** implementing features. Browser tests (`pnpm -F @teloi/web test:browser`) for UI components, unit tests for services and utilities.

**ALWAYS** use the `test-architect` sub-agent (Task tool with `subagent_type: "test-architect"`) for ANY test-related work—writing new tests, modifying existing tests, fixing failing tests. Never write test code directly.

**Before saying you're done**: Always remind the user if any implemented functionality is not covered by tests. This is mandatory—never skip this check.

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
