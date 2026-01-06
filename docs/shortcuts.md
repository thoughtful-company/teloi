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
- `Enter` - Start editing focused block
- `Delete/Backspace` - Delete selected blocks
- `Mod+C` - Copy selected blocks

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
