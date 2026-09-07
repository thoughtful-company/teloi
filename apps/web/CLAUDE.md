# apps/web

The SolidJS web app, package @teloi/web. Root rules are in the repo AGENTS.md. This file holds what only applies here.

## Commands

    pnpm -F @teloi/web typecheck
    pnpm -F @teloi/web test:browser src/path/to/file.test.tsx
    pnpm -F @teloi/web test:browser src/path/to/file.test.tsx -t "test name"
    pnpm -F @teloi/web build          # also typechecks
    pnpm dev:web                      # dev server on localhost:3003, rarely useful to an agent

Always give test:browser a filename. Running every browser test is slow.

## Rules

Focus is reactive, never imperative. Do not call .focus() on a DOM node. To focus a khora, change frame state (Frame.enterBlockEditing or Frame.enterKhoraSelection). The khora subscription emits isActive, the component mounts the Editor, and the Editor focuses itself on mount.

Text selection lives in exactly one khora. Frame.getSelection and Frame.setSelection work with ActiveKhoraSelection. The frame stores activeKhoraId, and the cursor position lives on the khora document. Multi-khora operations go through Frame.setKhoraSelection and Frame.getKhoraSelectionState only.

Focus has one owner per mode. Editing focus is frame.activeKhoraId plus the khora doc's textSelection. Khora-selection focus is frame.khoraSelectionAnchor plus frame.khoraSelectionFocus. frame.selectedKhoras is a derived cache, never the source of truth.

Ghost blocks obey these invariants. A ghost exists only when its parent has zero real children. Ghost state lives on khora documents, ghostChildId on the parent and ghostParentId on the ghost. A ghost has no LiveStore rows, so Node.getParent(ghostId) fails. Any tree mutation on a ghost except deletion materializes it first. Collapsing a parent with a ghost deletes the ghost's Automerge text and clears its docs.

New keyboard handling goes into commands under commands/, dispatched through KeyEventBus and CommandBus. ActionT under services/ui/Action/ is the legacy path being migrated. Do not add handlers there. Before touching a shortcut, read docs/shortcuts.md to find which level it belongs to, app, context or editor.

Commands named after a key are named after the key (Left, Backspace). Commands not tied to one key use verbs (MoveToLineStart, DeleteWordForward).

Components consume semantic color tokens (surface-*, text-*, border-*), never raw palette values. Themes live in src/themes/, contract in themes/ivory.css.

@effect/platform-node and @effect/opentelemetry stay in devDependencies although nothing here imports them. LiveStore 0.3.1 peers on both without this package declaring them, and pnpm fills an undeclared peer with whatever version the workspace has, which is apps/entel's Effect v4 copy. The unit tests then fail on import. Both leave with THC-145, the Effect v4 migration.

## Tests

Read docs/testing.md first. Use the test-architect agent for new tests.

Never use USER_CLICKS_BLOCK only to focus a block. Set SELECTION_IS_SET_TO first, then ACTIVE_ELEMENT_IS, so the editor mounts with the cursor in place.

Unit tests (*.unit.test.ts) run in Node through @livestore/adapter-node with in-memory storage. Build StoreT with makeAdapter({ storage: { type: "in-memory" } }) and createStorePromise, and AutomergeT with makeAutomergeLive({ workspaceName: "...", persist: false }). Compose with Layer.provideMerge, run through ManagedRuntime. Cleanup goes in beforeEach, never afterEach. The shared setup is in test-utils/unit/setup.ts.

Every test under src/__tests__/ is deprecated. Do not modify those files. They are to be moved next to the code they test, into colocated __tests__/ folders.

The web-editor-gotchas skill holds the CodeMirror selection trap and the doubleRaf rule for coordinate assertions. It loads on its own when you open a test file.

## Where things are described

- docs/web-architecture.md, how the app is put together: components, action handling, focus flow, text storage, ghost blocks, runtime, navigation.
- docs/views.md, the view system.
- docs/logging.md, docs/testing.md, docs/shortcuts.md.
