# UI Architecture Refactor

This document describes the planned refactoring of the UI layer from a layered action-bubbling architecture to a service-centric architecture inspired by The Elm Architecture (TEA).

## Current Architecture

### Overview

The current UI follows a layered pattern where actions bubble up through component hierarchy:

```
┌─────────────────────────────────────────────────────────────┐
│          EditorBuffer (Layer 3)                             │
│  - handleKeyDown (raw keyboard events)                      │
│  - blockActionHandler (action routing)                      │
│  - Can intercept: Tab, Navigate, Move, Zoom                 │
└──────────────────┬──────────────────────────────────────────┘
                   ↓ parentOnAction returns true/false
┌─────────────────────────────────────────────────────────────┐
│              Block (Layer 2)                                │
│  - handleAction (EditorAction routing)                      │
│  - Can intercept: TypeTrigger, Escape, ToggleTodo           │
│  - Calls parentOnAction FIRST, then handles locally         │
└──────────────────┬──────────────────────────────────────────┘
                   ↓ onAction callback
┌─────────────────────────────────────────────────────────────┐
│           TextEditor (Layer 1)                              │
│  - Emits EditorAction discriminated union                   │
│  - No handling, purely emits                                │
└─────────────────────────────────────────────────────────────┘
```

### Action Type

All editor events are represented as a discriminated union:

```typescript
type EditorAction =
  | { _tag: "Enter"; info: EnterKeyInfo }
  | { _tag: "Tab" }
  | { _tag: "ShiftTab" }
  | { _tag: "BackspaceAtStart" }
  | { _tag: "DeleteAtEnd" }
  | { _tag: "ForceDelete" }
  | { _tag: "Navigate"; direction: "left" | "right" | "up" | "down"; goalX?: number }
  | { _tag: "SelectionChange"; selection: SelectionInfo }
  | { _tag: "VerticalMove"; anchor: number; head: number; assoc: -1 | 0 | 1; goalX: number }
  | { _tag: "Blur" }
  | { _tag: "Escape" }
  | { _tag: "ZoomIn" }
  | { _tag: "ZoomOut" }
  | { _tag: "BlockSelect"; direction: "up" | "down" }
  | { _tag: "Move"; action: "swapUp" | "swapDown" | "first" | "last" }
  | { _tag: "Expand"; goalX?: number }
  | { _tag: "TypeTrigger"; typeId: Id.Node; trigger: BlockType.TriggerDefinition }
  | { _tag: "TypePickerOpen"; position: { x: number; y: number }; from: number }
  | { _tag: "TypePickerUpdate"; query: string }
  | { _tag: "TypePickerClose" }
  | { _tag: "ToggleTodo" }
  | { _tag: "PropertyTrigger" };
```

### Current Responsibility Split

**Services currently handle:**
- Data operations (split, merge, indent, move nodes)
- State mutations (setSelection, setActiveElement, setExpanded)
- Subscriptions (subscribe to state streams)

**Components currently handle:**
- Action routing ("who handles Tab?")
- Coordinating multiple service calls
- DOM interaction (focus, scroll, click coordinate capture)
- Local ephemeral state (picker position, transition flags)

### Problems with Current Architecture

#### 1. Duplicated Action Handling

Enter handling exists in two places with implicit coupling:

**Block.tsx** handles Enter for type propagation and split:
```typescript
const handleEnter = (info: EnterKeyInfo) => {
  runtime.runPromise(
    Effect.gen(function* () {
      // Check type removal on empty
      // Split block
      // Propagate types
      // Update selection
    }),
  );
};
```

**blockActionHandler.ts** explicitly returns false:
```typescript
Enter: () => false,  // "Enter has picker-related logic in Block, let Block handle it"
```

The handler needs to know Block has picker logic. If someone adds Enter handling to blockActionHandler, Block's logic silently stops running.

#### 2. Split Backspace Handling

**Block.tsx** handles type removal:
```typescript
const handleBackspaceAtStart = () => {
  // Only handles type removal
};
```

**blockActionHandler.ts** handles merge but inspects Block's internal state:
```typescript
BackspaceAtStart: () => {
  for (const def of context.activeDefinitions) {
    if (def.backspace?.removeTypeAtStart) {
      return false; // Let Block handle type removal
    }
  }
  handleBackspaceAtStart(blockId, nodeId);  // Merge
  return true;
},
```

Parent inspects `activeDefinitions` to decide whether to handle — tight coupling.

#### 3. Massive Keydown Handler

EditorBuffer has a 400+ line `handleKeyDown` function handling:
- Escape
- ArrowLeft/Right (block selection)
- Alt+Cmd+Arrow (move blocks)
- Cmd+ArrowUp (collapse/navigate)
- Cmd+ArrowDown (expand)
- ArrowUp/Down (navigation)
- Tab/ShiftTab (indent)
- Enter, Backspace, Delete

This doesn't use `EditorAction` — it's raw `KeyboardEvent` handling.

#### 4. Two Parallel Action Systems

1. **EditorAction bubbling** (TextEditor → Block → blockActionHandler)
2. **Direct keydown listener** (EditorBuffer.handleKeyDown)

Block selection mode bypasses the action system entirely. Same keys (ArrowUp, ArrowDown) have two code paths.

#### 5. Transition Flag Hack

```typescript
let isTransitioningToBlockSelection = false;

const enterBlockSelectionMode = () => {
  isTransitioningToBlockSelection = true;
  runtime.runPromise(...).finally(() => {
    isTransitioningToBlockSelection = false;
  });
};

// Used in useFocusBlur:
shouldSkipBlur: () => isTransitioningToBlockSelection,
```

Mutable flag coordinates async timing between blur and block selection. Workaround for the two action systems not being unified.

#### 6. Fragmented Ephemeral State

Local component state emerged for:

| State | Location | Why It Exists |
|-------|----------|---------------|
| Picker state | useTypePicker hook | Easier than extending service |
| Click coordinates | useClickCapture hook | DOM-specific, consumed immediately |
| Transition flag | Block.tsx mutable let | Timing hack for race condition |
| Initial selection | useFocusBlur hook | DOM selection captured before re-render |
| Property selection | PropertySection local signal | Component outside buffer model |

#### 7. "Who Handles This?" Uncertainty

Tab in Block vs Tab in PropertySection behave differently because different parent handlers. Must trace through layers to understand behavior.

---

## Target Architecture

### Core Principles

**1. Components hold DOM refs and same-cycle DOM captures only. All other state belongs in services.**

If you're naming it (picker, selection, transition, mode), it's a concept — model it in a service, not a component signal.

**2. Actions are primitive, not semantic. The model determines meaning.**

Components emit what happened (KeyDown, Click, Blur), not what it means (BackspaceAtStart, Navigate). Interpretation happens in one place with full model context.

**3. FocusModeT is the source of truth for routing.**

The model knows where focus is. Routing decisions consult the model, not DOM heuristics.

### Overview

```
┌─────────────────────────────────────────────────────────────┐
│                      Services                                │
│                                                              │
│  ActionT.handle(action: AppAction)                          │
│    → Consults FocusModeT for routing context                │
│    → Interprets primitive event based on model state        │
│    → Calls domain services (BlockT, BufferT, TypeT, etc.)   │
│    → Returns ActionResult { handled, intent? }              │
│                                                              │
│  State: FocusModeT, PickerT, BufferT, BlockT, etc.         │
└─────────────────────────────────────────────────────────────┘
                          ↑
                          │ Effect<ActionResult>
                          │
┌─────────────────────────────────────────────────────────────┐
│                      Component                               │
│                                                              │
│  1. Subscribe to service stream (unified view)              │
│  2. DOM refs for imperative operations                      │
│  3. On event: build AppAction with source context           │
│  4. Forward primitive action to ActionT                     │
│  5. If handled: execute DOMIntent (focus, scroll)           │
│  6. Render from service state                               │
└─────────────────────────────────────────────────────────────┘
```

### Data Flow

```
User Input (keyboard, mouse, blur, etc.)
    ↓
Component builds primitive AppAction:
  - Event type (KeyDown, Click, Blur, SelectionChange)
  - Key/modifiers (if keyboard)
  - Source context (where it came from + cursor state)
    ↓
Component calls ActionT.handle(action)
    ↓
ActionT executes:
  1. Consults FocusModeT: "Where are we conceptually?"
  2. Consults PickerT, activeTypes, etc.: "What's the current state?"
  3. INTERPRETS: primitive event + source context + model = semantic meaning
  4. Calls domain services (BlockT, NodeT, TypeT, BufferT)
  5. Returns ActionResult { handled: boolean, intent?: DOMIntent }
    ↓
Component checks result:
  - If handled: execute DOMIntent (focus, scroll), prevent default
  - If not handled: let native behavior proceed
    ↓
Service state changes
    ↓
Streams emit new values
    ↓
Component re-renders with new state
```

### Key Insight: Interpretation Happens in One Place

The same `KeyDown("Backspace")` means different things:

| Model State | Interpretation |
|-------------|----------------|
| Picker open | Delete character from query |
| Cursor at start + has removable type | Remove type from block |
| Cursor at start + no removable type | Merge with previous block |
| Cursor not at start | Let CodeMirror handle (not handled) |
| Block selection mode | Delete selected blocks |

All this logic lives in `ActionT.handle()`, not scattered across components.

### Synchronous Execution

**Critical insight: All action handling is synchronous.**

Keyboard event handling requires synchronous `preventDefault()` — by the time an async `.then()` runs, the event has already propagated. Fortunately, all our operations ARE synchronous:

| Operation | Why It's Sync |
|-----------|---------------|
| `FocusModeT.get()` | Reads from SynchronizedRef |
| `PickerT.getState()` | Reads state |
| `Type.getTypes()` | SQLite query (sql.js is sync in browser) |
| `Block.split()` | SQLite + Yjs mutations (both sync) |
| LiveStore queries | sql.js is synchronous |
| Yjs operations | Y.Text operations are synchronous |

We use Effect for dependency injection and composability, not for async. Run handlers with `runSync`:

```typescript
// ✅ Correct — synchronous execution
const result = runtime.runSync(ActionT.handle(action));
if (result.handled) e.preventDefault();

// ❌ Wrong — too late for preventDefault
runtime.runPromise(ActionT.handle(action)).then((result) => {
  if (result.handled) e.preventDefault();  // Event already propagated!
});
```

**Constraint: ActionT handlers must remain synchronous.** No `Effect.promise()`, no `fetch()`, no async operations in the action handling path. This is enforced by using `runSync` — it throws if any async operation is encountered.

### No Action Bubbling

Components do not pass `onAction` to children. There is no interception or bubbling.

**Current (bubbling):**
```typescript
function Block({ blockId, onAction: parentOnAction }) {
  const handleAction = (action) => {
    // Ask parent first
    if (parentOnAction) {
      const handled = parentOnAction(action, context);
      if (handled) return true;
    }
    // Then handle locally
    Match.value(action).pipe(Match.tags({ ... }));
  };

  return (
    <For each={childBlockIds}>
      {(childId) => <Block blockId={childId} onAction={parentOnAction} />}
    </For>
  );
}
```

**Target (primitive actions, no bubbling, sync execution):**
```typescript
function Block({ blockId }) {
  const handleKeyDown = (e: KeyboardEvent, view: EditorView) => {
    // Build primitive action with source context
    const action: AppAction = {
      _tag: "KeyDown",
      key: e.key,
      modifiers: { meta: e.metaKey, ctrl: e.ctrlKey, alt: e.altKey, shift: e.shiftKey },
      source: {
        type: "editor",
        target: { type: "block", blockId },
        cursor: getCursorContext(view),
      },
    };

    // Forward to single ActionT service — SYNC execution
    const result = runtime.runSync(
      Effect.gen(function* () {
        const Action = yield* ActionT;
        return yield* Action.handle(action);
      })
    );

    if (result.handled) {
      e.preventDefault();
      if (result.intent) executeDOMIntent(result.intent);
    }

    return result.handled;
  };

  return (
    <For each={store.childBlockIds}>
      {(childId) => <Block blockId={childId} />}  {/* No onAction prop */}
    </For>
  );
}
```

### Context Lives in ActionSource

Different contexts (buffer block, property block, title, document-level) are encoded in the action's source:

```typescript
type ActionSource =
  | { type: "editor"; target: EditorTarget; cursor: CursorContext }
  | { type: "document"; bufferId: Id.Buffer }  // Block selection mode, no editor

type EditorTarget =
  | { type: "title"; bufferId: Id.Buffer }
  | { type: "block"; blockId: Id.Block }
  | { type: "property"; blockId: Id.Block; propertyId: Id.Node }
```

ActionT routes based on source + model state:
```typescript
handle: (action: AppAction) => Effect.gen(function* () {
  const focusMode = yield* FocusMode.get();

  // Routing based on source type
  if (action.source.type === "document") {
    // Block selection mode — handle buffer-level actions
    return yield* handleDocumentAction(action);
  }

  // Editor-sourced action — route by target type
  const { target, cursor } = action.source;

  return yield* Match.value(target).pipe(
    Match.when({ type: "title" }, (t) => handleTitleAction(action, t, cursor)),
    Match.when({ type: "block" }, (t) => handleBlockAction(action, t, cursor)),
    Match.when({ type: "property" }, (t) => handlePropertyAction(action, t, cursor)),
    Match.exhaustive,
  );
}),
```

---

## Service Layer Design

### New Services

#### PickerT

Manages type picker state:

```typescript
interface PickerState {
  elementId: Id.Block;
  position: { x: number; y: number };
  from: number;  // Cursor position where # was typed
  query: string;
}

interface PickerT {
  open: (elementId: Id.Block, position: { x: number; y: number }, from: number) => Effect<void>;
  close: () => Effect<void>;
  updateQuery: (query: string) => Effect<void>;
  getState: () => Effect<PickerState | null>;
  subscribe: () => Effect<Stream<PickerState | null>>;
}
```

#### FocusModeT

Manages focus state and transitions:

```typescript
type FocusMode =
  | { type: "none" }
  | { type: "title"; bufferId: Id.Buffer }
  | { type: "block"; blockId: Id.Block }
  | { type: "blockSelection"; bufferId: Id.Buffer; selectedNodes: readonly Id.Node[] }
  | { type: "property"; propertyId: Id.Node; bufferId: Id.Buffer };

interface FocusModeT {
  get: () => Effect<FocusMode>;
  set: (mode: FocusMode) => Effect<void>;
  subscribe: () => Effect<Stream<FocusMode>>;

  // Atomic transitions that prevent race conditions
  enterBlockSelection: (bufferId: Id.Buffer, nodeIds: readonly Id.Node[]) => Effect<void>;
  exitBlockSelection: (targetBlockId: Id.Block) => Effect<void>;
}
```

#### ActionT

Central action handler for ALL user interactions. Single entry point, routes internally based on source and model state.

```typescript
// === Primitive Action Types ===

type AppAction =
  | { _tag: "KeyDown"; key: string; modifiers: Modifiers; source: ActionSource }
  | { _tag: "KeyUp"; key: string; modifiers: Modifiers; source: ActionSource }
  | { _tag: "Click"; coords: { x: number; y: number }; source: ActionSource }
  | { _tag: "SelectionChange"; selection: SelectionInfo; source: ActionSource }
  | { _tag: "Blur"; source: ActionSource }
  | { _tag: "Focus"; source: ActionSource };

type Modifiers = {
  meta: boolean;
  ctrl: boolean;
  alt: boolean;
  shift: boolean;
};

// === Source Context ===

type ActionSource =
  | { type: "editor"; target: EditorTarget; cursor: CursorContext }
  | { type: "document"; bufferId: Id.Buffer };  // Block selection, no editor focused

type EditorTarget =
  | { type: "title"; bufferId: Id.Buffer }
  | { type: "block"; blockId: Id.Block }
  | { type: "property"; blockId: Id.Block; propertyId: Id.Node };

type CursorContext = {
  position: number;
  anchor: number;
  head: number;
  atStart: boolean;
  atEnd: boolean;
  textBefore: string;
  textAfter: string;
  lineInfo: {
    line: number;
    totalLines: number;
    atFirstLine: boolean;
    atLastLine: boolean;
    column: number;
  };
  coords: { x: number; y: number } | null;
  goalX: number | null;
};

// === Result Types ===

type ActionResult =
  | { handled: true; intent: DOMIntent }
  | { handled: false };  // Let native behavior proceed

interface DOMIntent {
  focus?: FocusTarget;
  scroll?: Id.Block;
  blur?: boolean;
}

type FocusTarget =
  | { type: "title"; bufferId: Id.Buffer }
  | { type: "block"; blockId: Id.Block; selection?: { anchor: number; head: number } }
  | { type: "none" };  // Clear focus

// === Service Interface ===

interface ActionT {
  handle: (action: AppAction) => Effect<ActionResult>;
}
```

**Why primitive actions?**

The same `KeyDown("Enter")` means different things depending on model state:

| FocusModeT | PickerT | CursorContext | Interpretation |
|------------|---------|---------------|----------------|
| block editing | open | any | Select type from picker |
| block editing | closed | atEnd, empty block, has LIST type | Remove list type |
| block editing | closed | any | Split block, propagate types |
| title editing | closed | any | Create first child block |
| block selection | n/a | n/a | No-op (Enter starts editing) |

All interpretation logic lives in `ActionT.handle()`, not scattered across components or pre-interpreted by TextEditor.

### Extended Services

#### BlockViewT

Unified view subscription that composes all block-related state:

```typescript
interface BlockView {
  // From current BlockT
  isActive: boolean;
  isExpanded: boolean;
  isSelected: boolean;
  childBlockIds: readonly Id.Block[];
  selection: SelectionInfo | null;

  // Currently from separate subscriptions
  activeTypes: readonly Id.Node[];

  // Currently local component state
  picker: PickerState | null;

  // Text content
  ytext: Y.Text;
  textContent: string;
}

interface BlockViewT {
  subscribe: (blockId: Id.Block) => Effect<Stream<BlockView>>;
}
```

This eliminates the need for multiple subscriptions and local state in Block component.

---

## Component Design

### Block Component

**Before (~600 lines):**
```typescript
function Block({ blockId, onAction: parentOnAction }) {
  const runtime = useBrowserRuntime();

  // Multiple subscriptions
  const { store, start } = bindStreamToStore({
    stream: Stream.unwrap(BlockT.subscribe(blockId)),
    project: (view) => ({ isActive, isExpanded, childBlockIds, selection }),
    initial: { ... },
  });

  // Separate type subscription
  const [activeTypes, setActiveTypes] = createSignal<readonly Id.Node[]>([]);
  onMount(() => {
    const fiber = runtime.runFork(
      Effect.gen(function* () {
        const Type = yield* TypeT;
        const stream = yield* Type.subscribeTypes(nodeId);
        yield* Stream.runForEach(stream, (types) => Effect.sync(() => setActiveTypes(types)));
      }),
    );
    onCleanup(() => runtime.runFork(Fiber.interrupt(fiber)));
  });

  // Local ephemeral state
  const {
    pickerState,
    getPickerQuery,
    handleTypePickerOpen,
    handleTypePickerClose,
    handleTypePickerSelect,
    handleTypePickerCreate,
    handleEnterWithPicker,
  } = useTypePicker({ ... });

  const clickCapture = useClickCapture({ isActive: () => store.isActive });
  let isTransitioningToBlockSelection = false;

  // Complex action handler with bubbling
  const handleAction = (action: EditorAction): boolean | void => {
    if (parentOnAction) {
      const context: BlockNavigationContext = {
        blockId,
        isExpanded: store.isExpanded,
        activeDefinitions: getActiveDefinitions(),
      };
      const handled = parentOnAction(action, context);
      if (handled === true) return true;
    }

    return Match.value(action).pipe(
      Match.tags({
        Enter: ({ info }) => {
          if (handleEnterWithPicker()) return true;
          return handleEnter(info);
        },
        BackspaceAtStart: () => handleBackspaceAtStart(),
        SelectionChange: ({ selection }) => handleSelectionChange(selection),
        VerticalMove: ({ anchor, head, assoc, goalX }) => { ... },
        Blur: () => handleBlur(),
        Escape: () => {
          if (pickerState()) {
            handleTypePickerClose();
            return;
          }
          enterBlockSelectionMode();
        },
        TypeTrigger: ({ typeId, trigger }) => handleTypeTrigger(typeId, trigger),
        TypePickerOpen: ({ position, from }) => handleTypePickerOpen(position, from),
        TypePickerUpdate: () => { },
        TypePickerClose: () => handleTypePickerClose(),
        Expand: () => { ... },
        ToggleTodo: () => { ... },
      }),
      Match.orElse(() => undefined),
    );
  };

  // Multiple helper functions for each action type
  const handleEnter = (info: EnterKeyInfo) => { /* 40 lines */ };
  const handleBackspaceAtStart = () => { /* 15 lines */ };
  const enterBlockSelectionMode = () => { /* 20 lines */ };
  const handleTypeTrigger = (typeId, trigger) => { /* 50 lines */ };
  // ... more handlers

  // Render with conditional logic
  return (
    <div data-element-id={blockId} data-element-type="block" class="relative">
      <Show when={hasChildren()}>
        <button onClick={handleToggleExpand}>...</button>
      </Show>
      <div onClick={handleFocus} data-block-content class="flex" classList={{ ... }}>
        <Transition>
          <Show when={getPrimaryDecoration()}>
            {(renderDecoration) => <span>{renderDecoration()({ nodeId })}</span>}
          </Show>
        </Transition>
        <div class="flex-1 min-w-0">
          <Show
            when={store.isActive}
            fallback={
              <p>
                <Show when={textContent()} fallback={"\u00A0"}>
                  <FormattedText ytext={getYtext()} />
                </Show>
                <Show when={userTypes().length > 0}>
                  <span>
                    <For each={userTypes()}>
                      {(typeId) => <TypeBadge typeId={typeId} nodeId={nodeId} />}
                    </For>
                  </span>
                </Show>
              </p>
            }
          >
            <TextEditor
              ytext={getYtext()}
              undoManager={getUndoManager()}
              onAction={handleAction}
              initialStrategy={resolveSelectionStrategy({ ... })}
              selection={store.selection}
              inlineTypes={userTypes()}
              inlineTypesNodeId={nodeId}
              readonly={titleMode() === "readonly"}
              onDetachEdit={titleMode() === "detach" ? handleDetach : undefined}
            />
          </Show>
        </div>
      </div>
      <Show when={store.isExpanded}>
        <div class="pl-4 flex flex-col gap-1.5">
          <For each={store.childBlockIds}>
            {(childId) => <Block blockId={childId} onAction={parentOnAction} />}
          </For>
        </div>
      </Show>
      <Show when={pickerState()}>
        {(state) => (
          <TypePicker
            position={state().position}
            query={getPickerQuery()}
            nodeId={nodeId}
            onSelect={handleTypePickerSelect}
            onCreate={handleTypePickerCreate}
            onClose={handleTypePickerClose}
          />
        )}
      </Show>
    </div>
  );
}
```

**After (~80 lines) — primitive actions:**
```typescript
function Block({ blockId }) {
  const runtime = useBrowserRuntime();
  const nodeId = Id.parseBlockId(blockId)[1];

  // 1. Single unified subscription
  const { store, start } = useServiceStream(BlockViewT.subscribe(blockId));

  // 2. DOM ref for imperative operations
  let containerRef!: HTMLDivElement;

  // 3. Build primitive action from keyboard event
  const buildKeyAction = (e: KeyboardEvent, view: EditorView): AppAction => ({
    _tag: "KeyDown",
    key: e.key,
    modifiers: { meta: e.metaKey, ctrl: e.ctrlKey, alt: e.altKey, shift: e.shiftKey },
    source: {
      type: "editor",
      target: { type: "block", blockId },
      cursor: getCursorContext(view),  // Extract cursor state from CodeMirror
    },
  });

  // 4. Forward primitive action to single ActionT — SYNC!
  const handleKeyDown = (e: KeyboardEvent, view: EditorView) => {
    const action = buildKeyAction(e, view);

    // runSync — all action handling is synchronous
    const result = runtime.runSync(
      Effect.gen(function* () {
        const Action = yield* ActionT;
        return yield* Action.handle(action);
      }),
    );

    if (result.handled) {
      e.preventDefault();
      if (result.intent) executeDOMIntent(result.intent);
    }

    return result.handled;  // Tell CodeMirror whether we handled it
  };

  // 5. Click to focus — also sync
  const handleClick = (e: MouseEvent) => {
    const action: AppAction = {
      _tag: "Click",
      coords: { x: e.clientX, y: e.clientY },
      source: { type: "editor", target: { type: "block", blockId }, cursor: null! },
    };
    runtime.runSync(ActionT.handle(action));
  };

  // 6. Expand toggle (direct service call, not an action) — sync
  const handleToggleExpand = (e: MouseEvent) => {
    e.stopPropagation();
    runtime.runSync(BlockT.toggleExpanded(blockId));
  };

  // 7. Start subscription
  onMount(() => start(runtime));

  // 8. Derived values
  const userTypes = () => store.activeTypes.filter((t) => !isSystemType(t));
  const primaryDecoration = () =>
    store.activeTypes.map(BlockType.get).find((d) => d?.renderDecoration)?.renderDecoration;

  // 9. Render — all state from store, no local signals
  return (
    <div ref={containerRef} data-element-id={blockId} class="relative">
      <Show when={store.childBlockIds.length > 0}>
        <button onClick={handleToggleExpand}>
          <span classList={{ "rotate-90": store.isExpanded }} />
        </button>
      </Show>

      <div onClick={handleClick} class="flex" classList={{ "ring-2": store.isSelected }}>
        <Show when={primaryDecoration()}>
          {(render) => <span>{render()({ nodeId })}</span>}
        </Show>

        <div class="flex-1 min-w-0">
          <Show when={store.isActive} fallback={<FormattedText ytext={store.ytext} />}>
            <TextEditor
              ytext={store.ytext}
              undoManager={store.undoManager}
              onKeyDown={handleKeyDown}  // Primitive events, not semantic actions
              selection={store.selection}
              inlineTypes={userTypes()}
            />
          </Show>
        </div>
      </div>

      <Show when={store.isExpanded}>
        <div class="pl-4">
          <For each={store.childBlockIds}>
            {(childId) => <Block blockId={childId} />}
          </For>
        </div>
      </Show>

      <Show when={store.picker}>
        {(picker) => <TypePicker position={picker().position} query={picker().query} />}
      </Show>
    </div>
  );
}
```

Note how TextEditor now receives `onKeyDown` (primitive) instead of `onAction` (semantic). TextEditor becomes even simpler — it just passes through keyboard events.

### EditorBuffer Component

**Before:** 800+ lines with massive keydown handler

**After (~60 lines) — routes document-level events through same ActionT:**
```typescript
function EditorBuffer({ bufferId }) {
  const runtime = useBrowserRuntime();

  // 1. Unified subscription
  const { store, start } = useServiceStream(BufferViewT.subscribe(bufferId));

  // 2. Document-level keyboard handler for non-editor events — SYNC!
  onMount(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Skip if inside CodeMirror — TextEditor handles those
      if ((e.target as HTMLElement).closest(".cm-editor")) return;

      // Build primitive action with document source (no editor context)
      const action: AppAction = {
        _tag: "KeyDown",
        key: e.key,
        modifiers: { meta: e.metaKey, ctrl: e.ctrlKey, alt: e.altKey, shift: e.shiftKey },
        source: { type: "document", bufferId },  // No cursor context
      };

      // runSync — all action handling is synchronous
      const result = runtime.runSync(
        Effect.gen(function* () {
          const Action = yield* ActionT;
          return yield* Action.handle(action);
        }),
      );

      if (result.handled) {
        e.preventDefault();
        if (result.intent) executeDOMIntent(result.intent);
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    onCleanup(() => document.removeEventListener("keydown", handleKeyDown));

    return start(runtime);
  });

  // 3. Render — no logic, just composition
  return (
    <div class="flex-1 flex flex-col overflow-hidden">
      <Show when={store.nodeId}>
        <Title bufferId={bufferId} nodeId={store.nodeId!} />
        <PropertyList pageId={store.nodeId!} bufferId={bufferId} />
        <div class="flex-1 overflow-y-auto">
          <For each={store.childBlockIds}>
            {(childId) => <Block blockId={childId} />}
          </For>
        </div>
      </Show>
    </div>
  );
}
```

Note: Both Block and EditorBuffer call `ActionT.handle()`. The difference is `source.type`:
- Block: `{ type: "editor", target: { type: "block", blockId }, cursor: {...} }`
- EditorBuffer: `{ type: "document", bufferId }` (no cursor, used for block selection mode)

### TypePicker Component

TypePicker becomes a pure display component:

```typescript
interface TypePickerProps {
  position: { x: number; y: number };
  query: string;
}

function TypePicker(props: TypePickerProps) {
  const runtime = useBrowserRuntime();

  // Subscribe to filtered types based on query
  const { store } = useServiceStream(
    TypePickerT.subscribeFilteredTypes(props.query)
  );

  const handleSelect = (typeId: Id.Node) => {
    runtime.runPromise(PickerT.selectType(typeId));
  };

  const handleCreate = (name: string) => {
    runtime.runPromise(PickerT.createAndSelectType(name));
  };

  return (
    <div style={{ left: `${props.position.x}px`, top: `${props.position.y}px` }}>
      <For each={store.types}>
        {(type) => (
          <button onClick={() => handleSelect(type.id)}>
            {type.name}
          </button>
        )}
      </For>
      <Show when={props.query && !store.exactMatch}>
        <button onClick={() => handleCreate(props.query)}>
          Create "{props.query}"
        </button>
      </Show>
    </div>
  );
}
```

---

## Action Handler Implementation

### ActionT Implementation

The single `ActionT` service handles ALL user actions. It receives primitive events and interprets them based on model state.

```typescript
const ActionTLive = Layer.effect(
  ActionT,
  Effect.gen(function* () {
    // Inject all dependencies
    const FocusMode = yield* FocusModeT;
    const Buffer = yield* BufferT;
    const Block = yield* BlockT;
    const Node = yield* NodeT;
    const Type = yield* TypeT;
    const Picker = yield* PickerT;
    const Yjs = yield* YjsT;

    const handle = (action: AppAction): Effect.Effect<ActionResult> =>
      Effect.gen(function* () {
        // 1. Get model state for interpretation
        const focusMode = yield* FocusMode.get();
        const pickerState = yield* Picker.getState();

        // 2. Route based on source type
        if (action.source.type === "document") {
          // Block selection mode — no editor focused
          return yield* handleDocumentAction(action, focusMode);
        }

        // 3. Editor-sourced action — get target context
        const { target, cursor } = action.source;

        // 4. Get additional context based on target
        const context = yield* getTargetContext(target);
        const activeTypes = yield* Type.getTypes(context.nodeId);
        const activeDefinitions = activeTypes.map(BlockType.get).filter(Boolean);
        const pickerOpen = pickerState?.elementId === context.blockId;

        // 5. Interpret primitive action based on all context
        return yield* interpretAction(action, {
          focusMode,
          target,
          cursor,
          context,
          activeDefinitions,
          pickerOpen,
        });
      });

    // === Interpretation: Primitive → Semantic ===

    const interpretAction = (
      action: AppAction,
      ctx: InterpretContext
    ): Effect.Effect<ActionResult> =>
      Effect.gen(function* () {
        // KeyDown interpretation
        if (action._tag === "KeyDown") {
          return yield* interpretKeyDown(action, ctx);
        }

        // SelectionChange — always handle
        if (action._tag === "SelectionChange") {
          yield* Buffer.setSelection(ctx.context.bufferId, action.selection);
          return { handled: true, intent: {} };
        }

        // Blur handling
        if (action._tag === "Blur") {
          return yield* handleBlur(ctx);
        }

        return { handled: false };
      });

    // === KeyDown Interpretation ===

    const interpretKeyDown = (
      action: AppAction & { _tag: "KeyDown" },
      ctx: InterpretContext
    ): Effect.Effect<ActionResult> =>
      Effect.gen(function* () {
        const { key, modifiers } = action;
        const { cursor, pickerOpen, activeDefinitions, context } = ctx;

        // --- Enter ---
        if (key === "Enter" && !modifiers.shift) {
          // Picker open? Select item
          if (pickerOpen) {
            yield* Picker.selectCurrentOrClose();
            return { handled: true, intent: { focus: { type: "block", blockId: context.blockId } } };
          }

          // Title? Create first child
          if (ctx.target.type === "title") {
            const childId = yield* Node.createFirstChild(context.nodeId);
            const blockId = Id.makeBufferBlockId(context.bufferId, childId);
            return { handled: true, intent: { focus: { type: "block", blockId }, scroll: blockId } };
          }

          // Empty block with removable type? Remove type
          if (cursor.atStart && cursor.atEnd) {
            for (const def of activeDefinitions) {
              if (def.enter?.removeOnEmpty) {
                yield* Type.removeType(context.nodeId, def.id);
                return { handled: true, intent: {} };
              }
            }
          }

          // Normal: split block
          const result = yield* Block.split({
            nodeId: context.nodeId,
            cursorPos: cursor.position,
            textAfter: cursor.textAfter,
          });

          // Propagate types
          for (const def of activeDefinitions) {
            if (def.enter?.propagateToNewBlock) {
              yield* Type.addType(result.newNodeId, def.id);
            }
          }

          const newBlockId = Id.makeBufferBlockId(context.bufferId, result.newNodeId);
          return {
            handled: true,
            intent: { focus: { type: "block", blockId: newBlockId, selection: { anchor: 0, head: 0 } }, scroll: newBlockId },
          };
        }

        // --- Backspace ---
        if (key === "Backspace" && !modifiers.meta && !modifiers.ctrl) {
          // Picker open? Let native handle (delete from query)
          if (pickerOpen) {
            return { handled: false };
          }

          // Not at start? Let native handle
          if (!cursor.atStart) {
            return { handled: false };
          }

          // Has removable type? Remove it
          for (const def of activeDefinitions) {
            if (def.backspace?.removeTypeAtStart) {
              yield* Type.removeType(context.nodeId, def.id);
              return { handled: true, intent: {} };
            }
          }

          // At start, no removable type: merge backward
          const result = yield* Buffer.mergeBackward(context.bufferId, context.nodeId);
          if (result) {
            return {
              handled: true,
              intent: { focus: { type: "block", blockId: result.targetBlockId, selection: { anchor: result.cursorPos, head: result.cursorPos } } },
            };
          }

          return { handled: true, intent: {} };  // Can't merge (root block)
        }

        // --- Tab ---
        if (key === "Tab" && !modifiers.meta && !modifiers.ctrl && !modifiers.alt) {
          if (ctx.target.type === "property") {
            return { handled: false };  // Property blocks don't indent
          }

          if (modifiers.shift) {
            yield* Buffer.outdent([context.nodeId]);
          } else {
            yield* Buffer.indent([context.nodeId]);
          }
          return { handled: true, intent: {} };
        }

        // --- Escape ---
        if (key === "Escape") {
          if (pickerOpen) {
            yield* Picker.close();
            return { handled: true, intent: {} };
          }

          // Enter block selection mode
          yield* FocusMode.enterBlockSelection(context.bufferId, [context.nodeId]);
          return { handled: true, intent: { focus: { type: "none" } } };
        }

        // --- Arrow keys at boundaries ---
        if (key === "ArrowLeft" && cursor.atStart && !modifiers.shift) {
          const prevBlock = yield* Block.findPreviousNode(context.nodeId, context.bufferId);
          if (prevBlock) {
            return { handled: true, intent: { focus: { type: "block", blockId: prevBlock, selection: { anchor: -1, head: -1 } } } };  // -1 = end
          }
          // Try title
          return { handled: true, intent: { focus: { type: "title", bufferId: context.bufferId } } };
        }

        if (key === "ArrowRight" && cursor.atEnd && !modifiers.shift) {
          const nextBlock = yield* Block.findNextNodeInDocumentOrder(context.nodeId, context.bufferId);
          if (nextBlock) {
            return { handled: true, intent: { focus: { type: "block", blockId: nextBlock, selection: { anchor: 0, head: 0 } } } };
          }
          return { handled: true, intent: {} };  // At end, no-op
        }

        // ... more key handlers (ArrowUp, ArrowDown, Cmd+., Cmd+,, etc.)

        // Not handled — let native behavior proceed
        return { handled: false };
      });

    // === Document-level actions (block selection mode) ===

    const handleDocumentAction = (
      action: AppAction,
      focusMode: FocusMode
    ): Effect.Effect<ActionResult> =>
      Effect.gen(function* () {
        if (focusMode.type !== "blockSelection") {
          return { handled: false };
        }

        if (action._tag !== "KeyDown") {
          return { handled: false };
        }

        const { key, modifiers } = action;
        const { bufferId, selectedNodes } = focusMode;

        // Arrow navigation in block selection
        if (key === "ArrowDown" && !modifiers.meta) {
          const nextNode = yield* Block.findNextNodeInDocumentOrder(selectedNodes[selectedNodes.length - 1], bufferId);
          if (nextNode) {
            const newSelected = modifiers.shift
              ? [...selectedNodes, nextNode]
              : [nextNode];
            yield* FocusMode.set({ type: "blockSelection", bufferId, selectedNodes: newSelected });
          }
          return { handled: true, intent: {} };
        }

        // Enter to start editing
        if (key === "Enter") {
          const blockId = Id.makeBufferBlockId(bufferId, selectedNodes[0]);
          yield* FocusMode.exitBlockSelection(blockId);
          return { handled: true, intent: { focus: { type: "block", blockId } } };
        }

        // Delete selected blocks
        if (key === "Backspace" || key === "Delete") {
          yield* Block.deleteNodes(selectedNodes);
          // Focus previous or next block
          const focusTarget = yield* findFocusAfterDelete(bufferId, selectedNodes);
          yield* FocusMode.exitBlockSelection(focusTarget);
          return { handled: true, intent: { focus: { type: "block", blockId: focusTarget } } };
        }

        // Escape to clear selection
        if (key === "Escape") {
          yield* FocusMode.set({ type: "none" });
          return { handled: true, intent: {} };
        }

        // ... more block selection handlers

        return { handled: false };
      });

    return { handle };
  }),
);
```

### Key Design Decisions

1. **Single entry point**: All actions flow through `ActionT.handle()`
2. **Primitive → Semantic in one place**: `interpretKeyDown()` is where "Backspace at cursor position 0" becomes "merge backward"
3. **Model-driven routing**: `FocusModeT` determines if we're in block selection mode, not DOM checks
4. **Explicit `handled` flag**: Components know whether to `preventDefault()` or let native behavior proceed
5. **Testable**: Pure Effect functions, no DOM dependencies

---

## Migration Path

### Phase 1: Extract Picker State

1. Create `PickerT` service
2. Move picker state from `useTypePicker` hook to service
3. Update `BlockViewT.subscribe` to include picker state
4. Remove local picker signals from Block

### Phase 2: Unify Focus Mode

1. Create `FocusModeT` service
2. Replace `isTransitioningToBlockSelection` flag with atomic transitions
3. Move block selection state from `BufferT` to `FocusModeT`
4. Update `WindowT.activeElement` to use `FocusModeT`

### Phase 3: Create Primitive Action Types

1. Define `AppAction` type with primitive events (KeyDown, Click, Blur, etc.)
2. Define `ActionSource` and `CursorContext` types
3. Define `ActionResult` with `handled` flag and `DOMIntent`

### Phase 4: Create Single ActionT Service

1. Create `ActionT` with single `handle(action: AppAction)` method
2. Implement `interpretKeyDown()` that converts primitives to semantics
3. Move ALL handler logic from components to ActionT
4. Implement routing based on `action.source.type` and `FocusModeT`

### Phase 5: Simplify Components to Emit Primitives

1. Update TextEditor to emit primitive `KeyDown` instead of semantic `EditorAction`
2. Update Block/Title to build `AppAction` with source context
3. Update EditorBuffer to build document-sourced `AppAction` for non-editor events
4. Remove `onAction` prop and bubbling entirely
5. All components call `ActionT.handle()` directly

### Phase 6: Create Unified View Subscriptions

1. Create `BlockViewT.subscribe` that composes all block state
2. Create `BufferViewT.subscribe` that composes all buffer state
3. Remove multiple subscriptions from components
4. Remove `bindStreamToStore` in favor of `useServiceStream`

---

## Comparison: Before and After

### Tracing "What happens when I press Enter?"

**Before (semantic actions, scattered handling):**
1. TextEditor emits `Action.Enter(info)` — already interpreted as "Enter"
2. Block.handleAction receives it
3. Block calls `parentOnAction` (blockActionHandler)
4. blockActionHandler returns `false` for Enter (implicit knowledge of Block's picker logic)
5. Block's Match.tags handles Enter
6. Block checks `handleEnterWithPicker()` (hook) — local picker state
7. If no picker, Block calls `handleEnter(info)`
8. handleEnter runs Effect with split, type propagation, selection update

**After (primitive actions, centralized interpretation):**
1. TextEditor captures KeyDown event
2. Block builds primitive action:
   ```typescript
   { _tag: "KeyDown", key: "Enter", source: { type: "editor", target: { type: "block", blockId }, cursor: { position: 5, atStart: false, ... } } }
   ```
3. Block calls `ActionT.handle(action)`
4. ActionT checks model: `FocusModeT.get()`, `PickerT.getState()`, `Type.getTypes()`
5. ActionT interprets: "Enter key + picker open = select from picker" or "Enter key + no picker = split block"
6. ActionT calls domain services: `Block.split()`, `Type.addType()`, `Buffer.setSelection()`
7. ActionT returns `{ handled: true, intent: { focus: newBlockId } }`
8. Block executes DOMIntent, calls `e.preventDefault()`

### State Location

**Before:**
- Buffer selection: `BufferT`
- Block selection: `BufferT` (different field)
- Active element: `WindowT`
- Picker state: Component local (useTypePicker)
- Transition flag: Component local (mutable let)
- Click coords: Component local (useClickCapture)
- Active types: Component local (createSignal)
- Action interpretation: Scattered across TextEditor, Block, blockActionHandler

**After:**
- Buffer selection: `BufferT`
- Block selection: `FocusModeT`
- Active element: `FocusModeT`
- Picker state: `PickerT`
- Transition flag: Not needed (atomic transitions in FocusModeT)
- Cursor context: Captured at event time, passed in `ActionSource`
- Active types: `BlockViewT.subscribe` (composed)
- Action interpretation: Centralized in `ActionT.handle()`

### Component Lines of Code

| Component | Before | After |
|-----------|--------|-------|
| Block | ~600 | ~100 |
| EditorBuffer | ~800 | ~150 |
| Title | ~300 | ~80 |
| PropertySection | ~720 | ~150 |

---

## Testing Benefits

### Current Testing

Testing action handling requires:
1. Mounting component with all dependencies
2. Simulating DOM events
3. Checking DOM state changes
4. Mocking runtime for async operations

### After Refactor

Action handling can be tested as pure Effect with primitive actions:

```typescript
test("Enter splits block and propagates bullet type", async () => {
  const result = await Effect.runPromise(
    Effect.gen(function* () {
      // Setup
      const nodeId = yield* createTestNode("Hello|World");
      const blockId = Id.makeBufferBlockId(bufferId, nodeId);
      yield* Type.addType(nodeId, System.BULLET);

      // Build primitive action (what component would build)
      const action: AppAction = {
        _tag: "KeyDown",
        key: "Enter",
        modifiers: { meta: false, ctrl: false, alt: false, shift: false },
        source: {
          type: "editor",
          target: { type: "block", blockId },
          cursor: {
            position: 5,
            atStart: false,
            atEnd: false,
            textBefore: "Hello",
            textAfter: "World",
            // ... other cursor context
          },
        },
      };

      // Act — single entry point
      const result = yield* ActionT.handle(action);

      // Assert
      expect(result.handled).toBe(true);

      const newNode = yield* getNextSibling(nodeId);
      const newNodeTypes = yield* Type.getTypes(newNode.id);

      return { result, newNode, newNodeTypes };
    }).pipe(Effect.provide(TestLayer))
  );

  expect(result.result.intent?.focus).toBeDefined();
  expect(result.newNode.text).toBe("World");
  expect(result.newNodeTypes).toContain(System.BULLET);
});
```

No DOM, no component mounting, no event simulation. Pure business logic testing.
