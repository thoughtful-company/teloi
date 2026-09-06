---
name: web-editor-gotchas
description: Known traps in the web app's CodeMirror editor and browser tests. Load when dispatching selections to a CodeMirror view or when a test asserts on cursor position, selection or coordinates.
paths:
  - "apps/web/src/**/*.test.ts"
  - "apps/web/src/**/*.test.tsx"
  - "apps/web/test-utils/**"
---

# Web editor gotchas

## EditorSelection.cursor() is a SelectionRange, not an EditorSelection

Passing it straight to view.dispatch as selection: silently drops assoc. resolveTransactionInner falls through to EditorSelection.single(anchor, head), which discards the flags. Wrap it.

    // wrong, assoc is dropped
    view.dispatch({ selection: EditorSelection.cursor(pos, -1) });

    // correct, assoc survives
    view.dispatch({ selection: EditorSelection.create([EditorSelection.cursor(pos, -1)]) });

## Coordinate and selection assertions are flaky with waitFor

waitFor polls and succeeds before CodeMirror has synced its internal state to the DOM. Use doubleRaf from @/utils/effect for any assertion on selection or coordinates. In the BDD helpers in test-utils/bdd/then.ts write

    doubleRaf.pipe(Effect.andThen(() => { /* assert */ }))

and not

    Effect.promise(() => waitFor(...))

## Focusing a block in a test

Do not click to focus. Set the selection with SELECTION_IS_SET_TO, then check ACTIVE_ELEMENT_IS. Selection first, activation second, so the editor mounts with the cursor already placed.
