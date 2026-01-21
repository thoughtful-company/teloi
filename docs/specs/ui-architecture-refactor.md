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

### Core Principle

**Components hold DOM refs and same-cycle DOM captures only. All other state belongs in services.**

If you're naming it (picker, selection, transition, mode), it's a concept — model it in a service, not a component signal.

### Overview

```
┌─────────────────────────────────────────────────────────────┐
│                      Services                                │
│                                                              │
│  BlockActionT.handle(blockId, action, domContext)           │
│    → Pattern matches ALL actions                            │
│    → Calls other services (BufferT, WindowT, TypeT, etc.)   │
│    → Returns DOMIntent { focus?, scroll? }                  │
│                                                              │
│  State: selection, picker, focusMode, activeTypes, etc.     │
└─────────────────────────────────────────────────────────────┘
                          ↑
                          │ Effect<DOMIntent>
                          │
┌─────────────────────────────────────────────────────────────┐
│                      Component                               │
│                                                              │
│  1. Subscribe to service stream (unified view)              │
│  2. DOM refs for imperative operations                      │
│  3. Capture DOM context on events (coords, cursor pos)      │
│  4. Forward action + context to service                     │
│  5. Execute DOMIntent (focus, scroll)                       │
│  6. Render from service state                               │
└─────────────────────────────────────────────────────────────┘
```

### Data Flow

```
User Input (keyboard, mouse)
    ↓
TextEditor emits EditorAction
    ↓
Component captures DOM context:
  - Click coordinates (if click event)
  - Cursor coordinates (from CodeMirror)
    ↓
Component calls service:
  BlockActionT.handle(blockId, action, domContext)
    ↓
Service executes:
  - Routes action via pattern matching
  - Calls domain services (NodeT, TypeT, TupleT)
  - Updates UI state services (BufferT, WindowT, PickerT)
  - Returns DOMIntent
    ↓
Component executes DOMIntent:
  - Focus element
  - Scroll into view
    ↓
Service state changes
    ↓
Streams emit new values
    ↓
Component re-renders with new state
```

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

**Target (no bubbling):**
```typescript
function Block({ blockId }) {
  const handleAction = (action, domContext) => {
    // Always forward to service
    runtime.runPromise(BlockActionT.handle(blockId, action, domContext));
  };

  return (
    <For each={store.childBlockIds}>
      {(childId) => <Block blockId={childId} />}  {/* No onAction prop */}
    </For>
  );
}
```

### Context-Specific Behavior

Different contexts (buffer block, property block, title) are handled by:

1. **Block ID format encodes context:**
   - Buffer block: `buffer:{bufferId}/node:{nodeId}`
   - Property block: `buffer:{bufferId}/node:{hostNodeId}/property:{propertyId}/tuple:{tupleId}`

2. **Service inspects context and routes accordingly:**
```typescript
handle: (blockId, action, domContext) => Effect.gen(function* () {
  const context = yield* Id.parseBlockContext(blockId);

  if (context.type === "buffer") {
    return yield* handleBufferBlockAction(context, action, domContext);
  } else if (context.type === "property") {
    return yield* handlePropertyBlockAction(context, action, domContext);
  }
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

#### BlockActionT

Central action handler for blocks:

```typescript
interface DOMContext {
  clickCoords: { x: number; y: number } | null;
  cursorCoords: { x: number; y: number } | null;
}

interface DOMIntent {
  focus?: Id.Block | { type: "title"; bufferId: Id.Buffer };
  scroll?: Id.Block;
}

interface BlockActionT {
  handle: (
    blockId: Id.Block,
    action: EditorAction,
    domContext: DOMContext
  ) => Effect<DOMIntent>;
}
```

#### TitleActionT

Central action handler for title:

```typescript
interface TitleActionT {
  handle: (
    bufferId: Id.Buffer,
    action: EditorAction,
    domContext: DOMContext
  ) => Effect<DOMIntent>;
}
```

#### BufferActionT

Central action handler for buffer-level operations (block selection mode):

```typescript
interface BufferActionT {
  handleKeyDown: (
    bufferId: Id.Buffer,
    key: string,
    modifiers: { meta: boolean; ctrl: boolean; alt: boolean; shift: boolean }
  ) => Effect<DOMIntent | null>;  // null = not handled
}
```

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

**After (~100 lines):**
```typescript
function Block({ blockId }) {
  const runtime = useBrowserRuntime();

  // 1. Single unified subscription
  const { store, start } = useServiceStream(BlockViewT.subscribe(blockId));
  // store: { isActive, isExpanded, isSelected, childBlockIds, selection,
  //          activeTypes, picker, ytext, textContent }

  // 2. DOM ref for imperative operations
  let containerRef!: HTMLDivElement;

  // 3. DOM context capture (only on events, not stored)
  const captureDOMContext = (): DOMContext => ({
    clickCoords: null,  // Set by click handler
    cursorCoords: getCursorCoords(containerRef),
  });

  // 4. Single action handler - forwards to service
  const handleAction = (action: EditorAction) => {
    runtime.runPromise(
      Effect.gen(function* () {
        const BlockAction = yield* BlockActionT;
        const intent = yield* BlockAction.handle(blockId, action, captureDOMContext());
        yield* executeDOMIntent(intent);
      }),
    );
  };

  // 5. Click handler captures coords and forwards
  const handleClick = (e: MouseEvent) => {
    runtime.runPromise(
      Effect.gen(function* () {
        const BlockAction = yield* BlockActionT;
        const intent = yield* BlockAction.handleClick(blockId, { x: e.clientX, y: e.clientY });
        yield* executeDOMIntent(intent);
      }),
    );
  };

  // 6. Expand toggle
  const handleToggleExpand = (e: MouseEvent) => {
    e.stopPropagation();
    runtime.runPromise(BlockT.toggleExpanded(blockId));
  };

  // 7. Start subscription
  onMount(() => start(runtime));

  // 8. Helper to execute DOM intents
  const executeDOMIntent = (intent: DOMIntent) =>
    Effect.sync(() => {
      if (intent.focus) focusElement(intent.focus);
      if (intent.scroll) scrollToElement(intent.scroll);
    });

  // 9. Derived values (pure computations, no signals)
  const userTypes = () => store.activeTypes.filter((t) => !isSystemType(t));
  const primaryDecoration = () => {
    for (const typeId of store.activeTypes) {
      const def = BlockType.get(typeId);
      if (def?.renderDecoration) return def.renderDecoration;
    }
    return null;
  };

  // 10. Render - all state from store
  return (
    <div ref={containerRef} data-element-id={blockId} data-element-type="block" class="relative">
      <Show when={store.childBlockIds.length > 0}>
        <button onClick={handleToggleExpand}>
          <span classList={{ "rotate-90": store.isExpanded }} />
        </button>
      </Show>

      <div onClick={handleClick} data-block-content class="flex" classList={{ "ring-2": store.isSelected }}>
        <Transition>
          <Show when={primaryDecoration()}>
            {(render) => <span>{render()({ nodeId: store.nodeId })}</span>}
          </Show>
        </Transition>

        <div class="flex-1 min-w-0">
          <Show when={store.isActive} fallback={<FormattedText ytext={store.ytext} />}>
            <TextEditor
              ytext={store.ytext}
              undoManager={store.undoManager}
              onAction={handleAction}
              selection={store.selection}
              inlineTypes={userTypes()}
            />
          </Show>
        </div>
      </div>

      <Show when={store.isExpanded}>
        <div class="pl-4 flex flex-col gap-1.5">
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

### EditorBuffer Component

**Before:** 800+ lines with massive keydown handler

**After:**
```typescript
function EditorBuffer({ bufferId }) {
  const runtime = useBrowserRuntime();

  // 1. Unified subscription
  const { store, start } = useServiceStream(BufferViewT.subscribe(bufferId));

  // 2. Keyboard handler - forwards to service
  onMount(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Skip if from CodeMirror (TextEditor handles its own keys)
      if ((e.target as HTMLElement).closest(".cm-editor")) return;

      runtime.runPromise(
        Effect.gen(function* () {
          const BufferAction = yield* BufferActionT;
          const intent = yield* BufferAction.handleKeyDown(bufferId, e.key, {
            meta: e.metaKey,
            ctrl: e.ctrlKey,
            alt: e.altKey,
            shift: e.shiftKey,
          });

          if (intent) {
            e.preventDefault();
            yield* executeDOMIntent(intent);
          }
        }),
      );
    };

    document.addEventListener("keydown", handleKeyDown);
    onCleanup(() => document.removeEventListener("keydown", handleKeyDown));

    return start(runtime);
  });

  // 3. Render
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

### BlockActionT Implementation

```typescript
const BlockActionTLive = Layer.effect(
  BlockActionT,
  Effect.gen(function* () {
    const Buffer = yield* BufferT;
    const Window = yield* WindowT;
    const Block = yield* BlockT;
    const Node = yield* NodeT;
    const Type = yield* TypeT;
    const Picker = yield* PickerT;
    const Yjs = yield* YjsT;

    const handle = (
      blockId: Id.Block,
      action: EditorAction,
      domContext: DOMContext
    ): Effect.Effect<DOMIntent> =>
      Effect.gen(function* () {
        const context = yield* Id.parseBlockContext(blockId);
        const bufferId = context.bufferId;
        const nodeId = context.type === "buffer"
          ? context.nodeId
          : yield* getDisplayNode(context);

        // Get block state for routing decisions
        const isExpanded = yield* Block.isExpanded(blockId);
        const activeTypes = yield* Type.getTypes(nodeId);
        const activeDefinitions = activeTypes.map(BlockType.get).filter(Boolean);
        const pickerState = yield* Picker.getState();
        const pickerOpen = pickerState?.elementId === blockId;

        return yield* Match.value(action).pipe(
          Match.tags({
            Enter: ({ info }) => handleEnter(context, info, activeDefinitions, pickerOpen),
            Tab: () => handleTab(context),
            ShiftTab: () => handleShiftTab(context),
            BackspaceAtStart: () => handleBackspaceAtStart(context, activeDefinitions),
            DeleteAtEnd: () => handleDeleteAtEnd(context),
            ForceDelete: () => handleForceDelete(context),
            Navigate: ({ direction, goalX }) => handleNavigate(context, direction, goalX, isExpanded),
            SelectionChange: ({ selection }) => handleSelectionChange(context, selection),
            VerticalMove: (params) => handleVerticalMove(context, params),
            Blur: () => handleBlur(context),
            Escape: () => handleEscape(context, pickerOpen),
            ZoomIn: () => handleZoomIn(context),
            ZoomOut: () => handleZoomOut(context),
            BlockSelect: ({ direction }) => handleBlockSelect(context, direction),
            Move: ({ action: moveAction }) => handleMove(context, moveAction),
            Expand: ({ goalX }) => handleExpand(context, goalX),
            TypeTrigger: ({ typeId, trigger }) => handleTypeTrigger(context, typeId, trigger, activeTypes),
            TypePickerOpen: ({ position, from }) => handlePickerOpen(context, position, from),
            TypePickerUpdate: ({ query }) => handlePickerUpdate(query),
            TypePickerClose: () => handlePickerClose(),
            ToggleTodo: () => handleToggleTodo(nodeId),
            PropertyTrigger: () => handlePropertyTrigger(context),
          }),
          Match.exhaustive,
        );
      });

    // Individual handlers
    const handleEnter = (context, info, activeDefinitions, pickerOpen) =>
      Effect.gen(function* () {
        // Handle picker selection first
        if (pickerOpen) {
          yield* Picker.selectCurrentOrClose();
          return { focus: context.blockId };
        }

        // Check type removal on empty
        if (info.cursorPos === 0 && info.textAfter.length === 0) {
          for (const def of activeDefinitions) {
            if (def.enter?.removeOnEmpty) {
              yield* Type.removeType(context.nodeId, def.id);
              return {};
            }
          }
        }

        // Split block
        const result = yield* Buffer.split({
          nodeId: context.nodeId,
          cursorPos: info.cursorPos,
          textAfter: info.textAfter,
        });

        // Propagate types
        for (const def of activeDefinitions) {
          if (def.enter?.propagateToNewBlock) {
            yield* Type.addType(result.newNodeId, def.id);
          }
        }

        // Update selection
        const newBlockId = Id.makeBufferBlockId(context.bufferId, result.newNodeId);
        yield* Buffer.setSelection(context.bufferId, makeCollapsedSelection(newBlockId, result.cursorOffset));

        return { focus: newBlockId, scroll: newBlockId };
      });

    const handleTab = (context) =>
      Effect.gen(function* () {
        if (context.type === "property") {
          // Property blocks don't indent
          return {};
        }
        yield* Buffer.indent([context.nodeId]);
        return {};
      });

    const handleEscape = (context, pickerOpen) =>
      Effect.gen(function* () {
        if (pickerOpen) {
          yield* Picker.close();
          return {};
        }

        // Enter block selection mode
        yield* FocusMode.enterBlockSelection(context.bufferId, [context.nodeId]);
        return {};
      });

    // ... more handlers

    return { handle };
  }),
);
```

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

### Phase 3: Create Action Services

1. Create `BlockActionT` with all action handlers
2. Move handler logic from Block component to service
3. Simplify Block to forward actions
4. Remove `onAction` prop and bubbling

### Phase 4: Unify Buffer Keyboard Handling

1. Create `BufferActionT` for buffer-level keys
2. Convert `handleKeyDown` to EditorAction where applicable
3. Move logic from EditorBuffer to service
4. Simplify EditorBuffer component

### Phase 5: Create Unified View Subscriptions

1. Create `BlockViewT.subscribe` that composes all block state
2. Create `BufferViewT.subscribe` that composes all buffer state
3. Remove multiple subscriptions from components
4. Remove `bindStreamToStore` in favor of `useServiceStream`

---

## Comparison: Before and After

### Tracing "What happens when I press Enter?"

**Before:**
1. TextEditor emits `Action.Enter(info)`
2. Block.handleAction receives it
3. Block calls `parentOnAction` (blockActionHandler)
4. blockActionHandler returns `false` for Enter
5. Block's Match.tags handles Enter
6. Block checks `handleEnterWithPicker()` (hook)
7. If no picker, Block calls `handleEnter(info)`
8. handleEnter runs Effect with split, type propagation, selection update

**After:**
1. TextEditor emits `Action.Enter(info)`
2. Block calls `BlockActionT.handle(blockId, action, domContext)`
3. BlockActionT.handle matches on `Enter`
4. `handleEnter` runs all logic in one place

### State Location

**Before:**
- Buffer selection: `BufferT`
- Block selection: `BufferT` (different field)
- Active element: `WindowT`
- Picker state: Component local (useTypePicker)
- Transition flag: Component local (mutable let)
- Click coords: Component local (useClickCapture)
- Active types: Component local (createSignal)

**After:**
- Buffer selection: `BufferT`
- Block selection: `FocusModeT`
- Active element: `FocusModeT`
- Picker state: `PickerT`
- Transition flag: Not needed (atomic transitions in FocusModeT)
- Click coords: DOM capture, passed to service
- Active types: `BlockViewT.subscribe` (composed)

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

Action handling can be tested as pure Effect:

```typescript
test("Enter splits block and propagates bullet type", async () => {
  const result = await Effect.runPromise(
    Effect.gen(function* () {
      // Setup
      const nodeId = yield* createTestNode("Hello|World");
      yield* Type.addType(nodeId, System.BULLET);

      // Act
      const intent = yield* BlockActionT.handle(
        makeBlockId(nodeId),
        Action.Enter({ cursorPos: 5, textBefore: "Hello", textAfter: "World" }),
        { clickCoords: null, cursorCoords: null }
      );

      // Assert
      const newNode = yield* getNextSibling(nodeId);
      const newNodeTypes = yield* Type.getTypes(newNode.id);

      return { intent, newNode, newNodeTypes };
    }).pipe(Effect.provide(TestLayer))
  );

  expect(result.intent.focus).toBeDefined();
  expect(result.newNode.text).toBe("World");
  expect(result.newNodeTypes).toContain(System.BULLET);
});
```

No DOM, no component mounting, no event simulation. Pure business logic testing.
