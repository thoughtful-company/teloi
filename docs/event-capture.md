# Event Capture Architecture

This document describes how browser events are captured and routed to actions in the application.

## Overview

The app follows an MVVM-inspired pattern for event handling:

1. **View** captures that an event happened (not what it means)
2. **ViewModel (ActionT)** interprets the event based on model state
3. **Model** executes the action and updates state

The View never passes context like "which block" - it just reports "event happened". The ViewModel queries the model to determine context (via `WindowT.activeElement`, etc.).

## Event Flow

```
Browser Event (DOM/CodeMirror)
    ↓
Component captures event
    ↓
Builds primitive AppAction (if needed)
    ↓
runtime.runSync(ActionT.handle(action))
    ↓
ActionT interprets based on model state
    ↓
Returns ActionResult with DOMIntent
    ↓
Component executes DOMIntent (focus, scroll)
```

## Event Categories

### 1. Structural Events → ActionT

Events that require model context for interpretation. These are captured, wrapped in `AppAction`, and sent to `ActionT`.

| Event | Source | Capture Mechanism |
|-------|--------|-------------------|
| KeyDown | CodeMirror | `Prec.high(EditorView.domEventHandlers)` |
| SelectionChange | CodeMirror | `EditorView.updateListener` |
| Blur | DOM | `useFocusBlur` hook |
| Focus | DOM | `useFocusBlur` hook |
| Click | DOM | Component onClick |

**Why ActionT?** These events have different meanings based on context:
- "Backspace" at start of block → merge with previous
- "Backspace" in middle of block → delete character (let CodeMirror handle)
- "ArrowDown" on last line → navigate to next block
- "ArrowDown" in middle → move cursor (let CodeMirror handle)

### 2. Input Pattern Events → Direct Callbacks

Events that are self-contained and don't need model context. Editor interprets these directly and calls semantic callbacks.

| Event | Pattern | Callback |
|-------|---------|----------|
| Type trigger | `"- "`, `"[] "`, `"# "` at line start | `onTypeTrigger(typeId, trigger)` |
| Picker open | `"#"` typed | `onPickerOpen(position, from)` |
| Property trigger | `"> "` at start | `onPropertyTrigger()` |

**Why direct?** Pattern matching is self-contained - if user types `"- "`, add list type. No model context needed.

## Primitive Actions

Components emit primitive actions describing **what happened**, not what it means.

```typescript
type AppAction =
  | { _tag: "KeyDown"; key: string; modifiers: Modifiers; source: ActionSource }
  | { _tag: "SelectionChange"; selection: SelectionInfo; source: ActionSource }
  | { _tag: "Blur"; source: ActionSource }
  | { _tag: "Focus"; source: ActionSource }
  | { _tag: "Click"; coords: { x: number; y: number }; source: ActionSource };
```

### Action Source

Actions include context about where they originated:

```typescript
type ActionSource =
  | { type: "editor"; blockId: Id.Block; cursor: CursorContext }  // From text editor
  | { type: "document"; bufferId: Id.Buffer };                     // From document level (block selection mode)
```

### Cursor Context

For editor-sourced actions, `CursorContext` captures the cursor state at event time:

```typescript
interface CursorContext {
  position: number;       // Character position
  atStart: boolean;       // Cursor at position 0
  atEnd: boolean;         // Cursor at end of text
  lineInfo: {
    atFirstLine: boolean; // On first visual line (accounts for wrapping)
    atLastLine: boolean;  // On last visual line
  };
  // ... additional fields
}
```

Use `getCursorContext(view: EditorView)` from `utils/cursorContext.ts` to extract this from CodeMirror.

## ActionT Interpretation

`ActionT.handle(action)` interprets primitive actions using model state:

```typescript
// ActionT queries model state:
const mode = yield* EditorModeT.get();           // Text editing vs block selection
const pickerOpen = yield* PickerT.isOpen();      // Is type picker open
const activeElement = yield* WindowT.activeElement; // What's focused

// Then interprets:
if (action.key === "Enter" && pickerOpen) {
  // Select type from picker
} else if (action.key === "Enter" && cursor.atStart && hasRemovableType) {
  // Remove type instead of split
} else if (action.key === "Enter") {
  // Split block
}
```

## Action Result

`ActionT.handle()` returns synchronously (required for `preventDefault()`):

```typescript
type ActionResult =
  | { handled: true; intent: DOMIntent }  // Event was handled, execute DOM ops
  | { handled: false };                    // Not handled, let native behavior proceed
```

### DOMIntent

DOM operations to perform after action handling:

```typescript
interface DOMIntent {
  focus?: FocusTarget;  // Where to focus (title, block, or none)
  scroll?: Id.Block;    // Block to scroll into view
  blur?: boolean;       // Whether to blur current element
}
```

Components execute DOMIntent imperatively after `ActionT.handle()` returns.

## Capture Layers

Events are captured at three layers, each with different responsibilities:

### Layer 1: Editor (CodeMirror/Editor)

**Location:** `ui/Editor.tsx`

Captures events from within a text editor:
- Structural keys via `Prec.high(EditorView.domEventHandlers)`
- Selection changes via `EditorView.updateListener`
- Input patterns via `EditorView.inputHandler.of()`

Passes raw events to callbacks. Does NOT interpret them.

### Layer 2: Component (Block/Title)

**Location:** `ui/Block.tsx`, `ui/Title.tsx`

Receives callbacks from Editor:
- Builds `CursorContext` from EditorView
- Creates `AppAction` with source context
- Calls `ActionT.handle()` synchronously
- Executes returned `DOMIntent`

### Layer 3: Document (BufferView/App)

**Location:** `ui/BufferView.tsx`

Handles document-level events:
- Global keyboard shortcuts
- Block selection mode navigation
- Events when no editor is focused

Uses `source: { type: "document", bufferId }` - no cursor context.

## CodeMirror Integration

CodeMirror captures its own events internally. To intercept before CodeMirror handles them:

```typescript
// Editor.tsx
extensions.push(
  Prec.high(  // High priority - runs before CodeMirror keymaps
    EditorView.domEventHandlers({
      keydown(event, view) {
        if (props.onKeyDown) {
          const handled = props.onKeyDown(event, view);
          if (handled) {
            event.preventDefault();
            return true;  // Stop propagation to CodeMirror
          }
        }
        return false;  // Let CodeMirror handle
      },
    }),
  ),
);
```

**Structural keys** are intercepted: Enter, Tab, Backspace, Delete, Escape, Arrows, and any key with modifiers.

**Regular typing** is NOT intercepted - CodeMirror handles it directly via Yjs.

## Synchronous Execution

All action handling is synchronous via `runtime.runSync()`. This is required because:

1. `event.preventDefault()` must be called synchronously
2. If deferred to async, the event propagates before we can prevent it

All dependencies are synchronous:
- Effect dependency injection
- SQL.js queries (WebAssembly, sync in browser)
- Yjs mutations
- LiveStore updates

## Adding New Events

1. **Needs model context?** → Add to `AppAction` union, handle in `ActionT`
2. **CodeMirror-specific?** → Add callback prop to `Editor`
3. **Self-contained pattern?** → Use direct callback, skip `ActionT`

## Future: User Customization

The architecture supports future keybinding customization:

1. Extract key→command mapping from `ActionT.interpretKeyDown()` into `KeybindingT` registry
2. Commands stay in `ActionT`, keybindings become configurable data
3. Components unchanged - they still call `ActionT.handle()`

Users could then remap keys without changing any component code.
