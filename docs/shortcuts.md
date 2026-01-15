# Keyboard Shortcuts Architecture

This document explains the three levels of keyboard shortcut handling in the application and when to use each.

## Overview

Keyboard shortcuts are handled at three distinct levels, each with its own purpose and pattern:

1. **App-Level Shortcuts** (KeyboardService) - Global shortcuts that work everywhere
2. **Context-Level Shortcuts** (Component handlers) - Shortcuts that only work in specific modes
3. **Editor Shortcuts** (CodeMirror) - Text editing shortcuts within the editor

## 1. App-Level Shortcuts (KeyboardService)

**Location:** `apps/web/src/services/browser/KeyboardService.ts`

**Purpose:** Global shortcuts that should work regardless of which component is focused.

**Pattern:**
```typescript
// Define shortcut types
export type AppShortcut = Data.TaggedEnum<{
  ToggleSidebar: {};
  // Add new variants here
}>;

// Register bindings
const BINDINGS: ReadonlyArray<{ binding: KeyBinding; shortcut: AppShortcut }> = [
  { binding: { key: "\\", mod: true }, shortcut: AppShortcut.ToggleSidebar() },
];
```

**When to use:**
- Shortcuts that should work from anywhere in the app
- Global navigation or UI toggle shortcuts
- Shortcuts that don't depend on editor state

**Examples:**
- `Mod+\` - Toggle sidebar

## 2. Context-Level Shortcuts (EditorBuffer)

**Location:** `apps/web/src/ui/EditorBuffer.tsx` (handleKeyDown function)

**Purpose:** Shortcuts that only work when a specific mode is active (e.g., block selection mode).

**Pattern:**
```typescript
const handleKeyDown = (e: KeyboardEvent) => {
  // Don't handle if event came from inside CodeMirror
  const target = e.target as HTMLElement;
  if (target.closest(".cm-editor")) {
    return;
  }

  // Mod key detection pattern
  const isMac = navigator.platform.toUpperCase().includes("MAC");
  const modPressed = isMac ? e.metaKey : e.ctrlKey;

  if (e.key === "c" && modPressed && isBlockSelectionMode()) {
    e.preventDefault();
    // Handle copy...
  }
};
```

**When to use:**
- Shortcuts that depend on UI mode (e.g., block selection mode)
- Shortcuts that should be overridden when editing text
- Shortcuts that interact with multiple blocks

**Examples:**
- `Escape` - Exit text editing / clear selection
- `ArrowUp/Down` - Navigate between blocks
- `Shift+ArrowUp/Down` - Extend block selection
- `ArrowLeft/Right` - Select parent/first child block
- `Mod+ArrowUp/Down` - Level-by-level collapse/expand
- `Mod+Shift+ArrowUp/Down` - Drill out to parent / drill into first child
- `Enter` - Start editing focused block
- `Space` - Create new sibling block and start editing
- `Delete/Backspace` - Delete selected blocks
- `Tab/Shift+Tab` - Indent/outdent selected blocks
- `Alt+Mod+ArrowUp/Down` - Swap selected blocks with sibling
- `Shift+Alt+Mod+ArrowUp/Down` - Move selected blocks to first/last
- `Mod+Shift+Delete/Backspace` - Force-delete selected blocks and all children
- `Mod+C` - Copy selected blocks
- `Mod+X` - Cut selected blocks
- `Mod+A` - Select all blocks
- `Mod+Enter` - Toggle todo/checkbox state (cycles: normal → unchecked → checked → normal)

## 3. Editor Shortcuts (CodeMirror)

**Location:** `apps/web/src/ui/Block.tsx` (keymap extensions)

**Purpose:** Text editing shortcuts handled by CodeMirror.

**Pattern:**
```typescript
const keymap = Prec.highest(
  EditorView.domEventHandlers({
    keydown(e, view) {
      if (e.key === "Escape") {
        handleEscape();
        return true;
      }
      // ...
    },
  }),
);
```

**When to use:**
- Text manipulation within a single block
- Cursor movement and selection within text
- Text formatting shortcuts

**Note:** Events that reach CodeMirror are NOT handled by EditorBuffer (checked via `.cm-editor` selector). This prevents double-handling of shortcuts.

**Examples:**
- `Backspace` (at start) - Merge with previous block
- `Delete` (at end) - Merge with next block
- `Mod+Shift+Backspace` - Force-delete block and all children
- `Tab` - Indent block
- `Shift+Tab` - Outdent block
- `Mod+Enter` - Toggle todo/checkbox state (cycles: normal → unchecked → checked → normal)

## Mod Key Pattern

Always use this pattern for cross-platform modifier key detection:

```typescript
const isMac = navigator.platform.toUpperCase().includes("MAC");
const modPressed = isMac ? e.metaKey : e.ctrlKey;
```

This ensures `Cmd` works on Mac and `Ctrl` works on Windows/Linux.

## Decision Tree

When adding a new shortcut:

1. **Does it need to work everywhere, regardless of focus?**
   → Add to KeyboardService (App-Level)

2. **Does it depend on a UI mode (like block selection)?**
   → Add to component handler (Context-Level)

3. **Is it for text manipulation within the editor?**
   → Add to CodeMirror keymap (Editor Shortcuts)

## Block Expand/Collapse vs Drill Navigation

Two separate concerns are handled with different shortcuts:

### Toggle Expand/Collapse (Mod+ArrowUp/Down)

**No navigation** - cursor/selection stays on current block.

- `Mod+Down` (Expand): First press expands the block (shows direct children). Next press expands collapsed children (one level deeper). Continue until all descendants are expanded.
- `Mod+Up` (Collapse): First press collapses deepest expanded descendants. Continue pressing to collapse upward level by level. Last press collapses the block itself.

Works identically in both text editing and block selection modes.

### Drill Navigation (Mod+Shift+ArrowUp/Down)

**Moves cursor/selection** to a different block.

- `Mod+Shift+Down` (Drill In): If block has children, focus first child. If childless, create empty child and focus it.
- `Mod+Shift+Up` (Drill Out): Collapse current block and focus parent. If at root level, focus title.

**Mode preservation:** In text editing mode, stays in text editing mode. In block selection mode, stays in block selection mode. Preserves goalX for cursor positioning in text editing mode.
