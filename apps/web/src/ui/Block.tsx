import { useBrowserRuntime } from "@/context/useBrowserRuntime";
import { Id } from "@/schema";
import { NodeT } from "@/services/domain/Node";
import { TypeT } from "@/services/domain/Type";
import { StoreT } from "@/services/external/Store";
import { YjsT } from "@/services/external/Yjs";
import { BlockT } from "@/services/ui/Block";
import * as BlockType from "@/services/ui/BlockType";
import { BufferT } from "@/services/ui/Buffer";
import { NavigationT } from "@/services/ui/Navigation";
import { isSystemType, TypePickerT } from "@/services/ui/TypePicker";
import { WindowT } from "@/services/ui/Window";
import { bindStreamToStore } from "@/utils/bindStreamToStore";
import {
  makeCollapsedSelection,
  resolveSelectionStrategy,
  updateEditorSelection,
} from "@/utils/selectionStrategy";
import { Effect, Fiber, Match, Option, Stream } from "effect";
import {
  createEffect,
  createSignal,
  For,
  onCleanup,
  onMount,
  Show,
} from "solid-js";
import { Transition, TransitionGroup } from "solid-transition-group";
import TextEditor, {
  type EditorAction,
  type EnterKeyInfo,
  type SelectionInfo,
} from "./TextEditor";
import TypeBadge from "./TypeBadge";
import { TypePicker } from "./TypePicker";
import * as Y from "yjs";

/** Text segment with optional formatting */
interface TextSegment {
  text: string;
  bold?: boolean;
  italic?: boolean;
  code?: boolean;
}

/** Build segments from Y.Text deltas for formatted rendering */
function buildSegments(ytext: Y.Text): TextSegment[] {
  const deltas = ytext.toDelta() as Array<{
    insert: string;
    attributes?: { bold?: true; italic?: true; code?: true };
  }>;

  return deltas.map((d) => ({
    text: d.insert,
    bold: d.attributes?.bold === true,
    italic: d.attributes?.italic === true,
    code: d.attributes?.code === true,
  }));
}

/** Renders Y.Text with formatting for unfocused blocks */
function FormattedText(props: { ytext: Y.Text }) {
  const [segments, setSegments] = createSignal(buildSegments(props.ytext));

  // Observe Y.Text changes to update segments
  onMount(() => {
    const observer = () => setSegments(buildSegments(props.ytext));
    props.ytext.observe(observer);
    onCleanup(() => props.ytext.unobserve(observer));
  });

  return (
    <For each={segments()}>
      {(segment) => {
        // Code gets special treatment (monospace font + background)
        if (segment.code) {
          return (
            <code
              classList={{
                "font-mono bg-neutral-100 px-1 rounded": true,
                "font-bold": segment.bold,
                italic: segment.italic,
              }}
            >
              {segment.text}
            </code>
          );
        }
        // Plain text with optional bold/italic
        if (segment.bold || segment.italic) {
          return (
            <span
              classList={{
                "font-bold": segment.bold,
                italic: segment.italic,
              }}
            >
              {segment.text}
            </span>
          );
        }
        return segment.text;
      }}
    </For>
  );
}

interface BlockProps {
  blockId: Id.Block;
}

/**
 * Renders an editable hierarchical block and keeps it synchronized with the application runtime and Yjs document state.
 *
 * The component displays read-only text when inactive and a rich text editor when active; it manages focus, selection, document stream subscription, Y.Text observation, and user editing/navigation behaviors (split/merge, indent/outdent, arrow navigation, zoom) for the given block.
 *
 * @param blockId - The block identifier to render and synchronize (Id.Block)
 * @returns The block's rendered TSX element containing the editor or read-only view and its child blocks
 */
export default function Block({ blockId }: BlockProps) {
  const runtime = useBrowserRuntime();

  // Lazy block creation: if block doesn't exist, create it then subscribe
  const blockStreamEffect = Effect.gen(function* () {
    const Block = yield* BlockT;
    const Store = yield* StoreT;

    return yield* Block.subscribe(blockId).pipe(
      Effect.catchTag("BlockNotFoundError", () =>
        Effect.gen(function* () {
          yield* Store.setDocument(
            "block",
            {
              isExpanded: true,
            },
            blockId,
          );

          return yield* Block.subscribe(blockId);
        }),
      ),
      Effect.catchTag("NodeNotFoundError", (err) =>
        Effect.dieMessage(err.toString()),
      ),
    );
  });

  const blockStream = Stream.unwrap(blockStreamEffect);

  const { store, start } = bindStreamToStore({
    stream: blockStream,
    project: (view) => ({
      isActive: view.isActive,
      isSelected: view.isSelected,
      isExpanded: view.isExpanded,
      childBlockIds: view.childBlockIds,
      selection: view.selection,
    }),
    initial: {
      isActive: false,
      isSelected: false,
      isExpanded: true,
      childBlockIds: [] as readonly Id.Block[],
      selection: null as {
        anchor: number;
        head: number;
        goalX: number | null;
        goalLine: "first" | "last" | null;
        assoc: -1 | 0 | 1;
      } | null,
    },
  });

  // Get Y.Text and UndoManager for this block's node
  const [, nodeId] = Id.parseBlockId(blockId).pipe(Effect.runSync);
  const Yjs = runtime.runSync(YjsT);
  const ytext = Yjs.getText(nodeId);
  const undoManager = Yjs.getUndoManager(nodeId);

  const [textContent, setTextContent] = createSignal(ytext.toString());
  const [activeTypes, setActiveTypes] = createSignal<readonly Id.Node[]>([]);

  // Hover state for chevron visibility on childless nodes
  const [isHovered, setIsHovered] = createSignal(false);

  // Type picker state
  const [pickerState, setPickerState] = createSignal<{
    visible: boolean;
    position: { x: number; y: number };
    from: number;
  } | null>(null);

  const getPickerQuery = () => {
    const state = pickerState();
    if (!state) return "";
    const text = textContent();
    const cursorPos = store.selection?.head ?? text.length;
    // Extract text after "#" (from + 1) up to cursor
    return text.slice(state.from + 1, cursorPos);
  };

  // Flag to prevent blur handler from clearing state during block movement
  let isMoving = false;

  const waitForDomAndRefocus = Effect.gen(function* () {
    yield* Effect.promise(
      () => new Promise((r) => requestAnimationFrame(() => setTimeout(r, 0))),
    );
    yield* Effect.sync(() => {
      const blockEl = document.querySelector(
        `[data-element-id="${CSS.escape(blockId)}"] .cm-content`,
      );
      if (blockEl instanceof HTMLElement) {
        blockEl.focus();
      }
    });
  });

  const hasType = (typeId: Id.Node) => activeTypes().includes(typeId);
  const userTypes = () =>
    activeTypes().filter((typeId) => !isSystemType(typeId));

  const getActiveDefinitions = () =>
    activeTypes()
      .map(BlockType.get)
      .filter((d): d is BlockType.BlockTypeDefinition => d != null);

  const getPrimaryDecoration = () => {
    for (const def of getActiveDefinitions()) {
      if (def.renderDecoration) return def.renderDecoration;
    }
    return null;
  };

  onMount(() => {
    const dispose = start(runtime);

    const observer = () => setTextContent(ytext.toString());
    ytext.observe(observer);

    const typesFiber = runtime.runFork(
      Effect.gen(function* () {
        const Type = yield* TypeT;
        const stream = yield* Type.subscribeTypes(nodeId);
        yield* Stream.runForEach(stream, (types) =>
          Effect.sync(() => {
            setActiveTypes(types);
          }),
        );
      }),
    );

    onCleanup(() => {
      dispose();
      ytext.unobserve(observer);
      runtime.runFork(Fiber.interrupt(typesFiber));
    });
  });

  let clickCoords: { x: number; y: number } | null = null;
  let initialSelection: { anchor: number; head: number } | null = null;
  // Flag to prevent handleBlur from clearing activeElement when transitioning to block selection
  let isTransitioningToBlockSelection = false;

  // Clear click coords when block becomes inactive, so programmatic re-activation
  // (like backspace merge) doesn't use stale click coords from a previous interaction.
  createEffect(() => {
    if (!store.isActive) {
      clickCoords = null;
      initialSelection = null;
    }
  });

  const handleFocus = (e: MouseEvent) => {
    clickCoords = { x: e.clientX, y: e.clientY };
    initialSelection = null;

    const domSelection = window.getSelection();
    if (
      domSelection &&
      domSelection.rangeCount > 0 &&
      !domSelection.isCollapsed
    ) {
      const target = e.currentTarget as HTMLElement;
      const paragraph = target.querySelector("p");

      if (
        paragraph &&
        paragraph.contains(domSelection.anchorNode) &&
        paragraph.contains(domSelection.focusNode)
      ) {
        initialSelection = {
          anchor: domSelection.anchorOffset,
          head: domSelection.focusOffset,
        };
      }
    }

    runtime.runPromise(
      Effect.gen(function* () {
        const [bufferId, nodeId] = yield* Id.parseBlockId(blockId);
        const Window = yield* WindowT;
        const Buffer = yield* BufferT;

        // Clear block selection when entering text editing mode
        yield* Buffer.setBlockSelection(bufferId, [], nodeId);

        yield* Window.setActiveElement(
          Option.some({ type: "block" as const, id: blockId }),
        );
      }),
    );
  };

  // Text changes are now handled directly by Yjs via yCollab extension

  const handleSelectionChange = (selection: SelectionInfo) => {
    const [bufferId] = Id.parseBlockId(blockId).pipe(Effect.runSync);
    runtime.runPromise(updateEditorSelection(bufferId, nodeId, selection));
  };

  const handleBlur = () => {
    console.debug("[Block.handleBlur] Called", {
      blockId,
      hasFocus: document.hasFocus(),
      isTransitioning: isTransitioningToBlockSelection,
    });

    // Don't clear selection when window loses focus (alt-tab, tab switch).
    // Only clear when user clicks elsewhere within the document.
    if (!document.hasFocus()) {
      console.debug("[Block.handleBlur] Document not focused, returning");
      return;
    }

    // Don't clear if we're transitioning to block selection mode (Escape was pressed)
    if (isTransitioningToBlockSelection) {
      console.debug(
        "[Block.handleBlur] Transitioning to block selection, returning",
      );
      return;
    }

    // Don't clear selection during block movement (swap up/down)
    if (isMoving) {
      return;
    }

    runtime.runPromise(
      Effect.gen(function* () {
        const [bufferId, nodeId] = yield* Id.parseBlockId(blockId);
        const Buffer = yield* BufferT;
        const Window = yield* WindowT;

        // Only clear selection and activeElement if still pointing to this block.
        // If navigating to another block, they already point there - don't clear.
        const selectionOpt = yield* Buffer.getSelection(bufferId);
        const sel = Option.getOrNull(selectionOpt);
        console.debug("[Block.handleBlur] Checking selection", {
          nodeId,
          selNodeId: sel?.anchor.nodeId,
          willClear: sel && sel.anchor.nodeId === nodeId,
        });
        if (sel && sel.anchor.nodeId === nodeId) {
          yield* Buffer.setSelection(bufferId, Option.none());
          yield* Window.setActiveElement(Option.none());
        }
      }),
    );
  };

  const handleEnter = (info: EnterKeyInfo) => {
    runtime.runPromise(
      Effect.gen(function* () {
        const [bufferId] = yield* Id.parseBlockId(blockId);

        // Check if any active type wants to be removed on empty Enter
        if (info.cursorPos === 0 && info.textAfter.length === 0) {
          for (const def of getActiveDefinitions()) {
            if (def.enter?.removeOnEmpty) {
              const Type = yield* TypeT;
              yield* Type.removeType(nodeId, def.id);
              return;
            }
          }
        }

        const Block = yield* BlockT;
        const Window = yield* WindowT;
        const Buffer = yield* BufferT;

        const result = yield* Block.split({
          nodeId,
          cursorPos: info.cursorPos,
          textAfter: info.textAfter,
        });

        // Propagate types that want to be propagated
        const Type = yield* TypeT;
        for (const def of getActiveDefinitions()) {
          if (def.enter?.propagateToNewBlock) {
            yield* Type.addType(result.newNodeId, def.id);
          }
        }

        const newBlockId = Id.makeBlockId(bufferId, result.newNodeId);
        yield* Buffer.setSelection(
          bufferId,
          makeCollapsedSelection(result.newNodeId, result.cursorOffset),
        );
        yield* Window.setActiveElement(
          Option.some({ type: "block" as const, id: newBlockId }),
        );
      }),
    );
  };

  const handleTab = () => {
    runtime.runPromise(
      Effect.gen(function* () {
        const Block = yield* BlockT;
        const Buffer = yield* BufferT;
        const [bufferId] = yield* Id.parseBlockId(blockId);

        const result = yield* Buffer.indent(bufferId, [nodeId]);
        if (Option.isSome(result)) {
          // Auto-expand the new parent so the indented block stays visible
          yield* Block.setExpanded(Id.makeBlockId(bufferId, result.value), true);
        }
      }),
    );
  };

  const handleShiftTab = () => {
    runtime.runPromise(
      Effect.gen(function* () {
        const Buffer = yield* BufferT;
        const [bufferId] = yield* Id.parseBlockId(blockId);
        yield* Buffer.outdent(bufferId, [nodeId]);
      }),
    );
  };

  const handleMove = (action: "swapUp" | "swapDown" | "first" | "last") => {
    isMoving = true;
    runtime.runPromise(
      Effect.gen(function* () {
        const Block = yield* BlockT;
        const moved = yield* Match.value(action).pipe(
          Match.when("swapUp", () => Block.swap(nodeId, "up")),
          Match.when("swapDown", () => Block.swap(nodeId, "down")),
          Match.when("first", () => Block.moveToFirst(nodeId)),
          Match.when("last", () => Block.moveToLast(nodeId)),
          Match.exhaustive,
        );
        if (moved) {
          yield* waitForDomAndRefocus;
        }
      }).pipe(Effect.ensuring(Effect.sync(() => (isMoving = false)))),
    );
  };

  const handleBackspaceAtStart = () => {
    runtime.runPromise(
      Effect.gen(function* () {
        const [bufferId] = yield* Id.parseBlockId(blockId);

        // Check if any active type wants to be removed on backspace at start
        for (const def of getActiveDefinitions()) {
          if (def.backspace?.removeTypeAtStart) {
            const Type = yield* TypeT;
            yield* Type.removeType(nodeId, def.id);
            return;
          }
        }

        const Buffer = yield* BufferT;
        const Window = yield* WindowT;

        const result = yield* Buffer.mergeBackward(bufferId, nodeId);
        if (Option.isNone(result)) return;

        const { targetNodeId, cursorOffset, isTitle } = result.value;

        yield* Buffer.setSelection(
          bufferId,
          makeCollapsedSelection(targetNodeId, cursorOffset),
        );

        if (isTitle) {
          yield* Window.setActiveElement(
            Option.some({ type: "title" as const, bufferId }),
          );
        } else {
          const targetBlockId = Id.makeBlockId(bufferId, targetNodeId);
          yield* Window.setActiveElement(
            Option.some({ type: "block" as const, id: targetBlockId }),
          );
        }
      }),
    );
  };

  const handleDeleteAtEnd = () => {
    runtime.runPromise(
      Effect.gen(function* () {
        const [bufferId] = yield* Id.parseBlockId(blockId);
        const Buffer = yield* BufferT;

        const result = yield* Buffer.mergeForward(bufferId, nodeId);
        if (Option.isNone(result)) return;

        yield* Buffer.setSelection(
          bufferId,
          makeCollapsedSelection(nodeId, result.value.cursorOffset),
        );
      }),
    );
  };

  const handleArrowLeftAtStart = () => {
    runtime.runPromise(
      Effect.gen(function* () {
        const [bufferId] = yield* Id.parseBlockId(blockId);
        const Block = yield* BlockT;
        const Store = yield* StoreT;
        const Buffer = yield* BufferT;
        const Window = yield* WindowT;
        const Yjs = yield* YjsT;

        const bufferDoc = yield* Store.getDocument("buffer", bufferId);
        const rootNodeId = Option.isSome(bufferDoc)
          ? bufferDoc.value.assignedNodeId
          : null;

        const targetOpt = yield* Block.findPreviousNode(nodeId, bufferId);
        if (Option.isNone(targetOpt)) return;

        const targetNodeId = targetOpt.value;
        const targetYtext = Yjs.getText(targetNodeId);
        const endPos = targetYtext.length;

        yield* Buffer.setSelection(
          bufferId,
          makeCollapsedSelection(targetNodeId, endPos),
        );

        if (targetNodeId === rootNodeId) {
          yield* Window.setActiveElement(
            Option.some({ type: "title" as const, bufferId }),
          );
        } else {
          const targetBlockId = Id.makeBlockId(bufferId, targetNodeId);
          yield* Window.setActiveElement(
            Option.some({ type: "block" as const, id: targetBlockId }),
          );
        }
      }),
    );
  };

  const handleArrowRightAtEnd = () => {
    runtime.runPromise(
      Effect.gen(function* () {
        const [bufferId] = yield* Id.parseBlockId(blockId);
        const Block = yield* BlockT;
        const Node = yield* NodeT;
        const Buffer = yield* BufferT;
        const Window = yield* WindowT;

        // If has visible children (expanded), go to first child
        const children = yield* Node.getNodeChildren(nodeId);
        if (children.length > 0 && store.isExpanded) {
          const firstChildId = children[0]!;
          const targetBlockId = Id.makeBlockId(bufferId, firstChildId);
          yield* Buffer.setSelection(
            bufferId,
            makeCollapsedSelection(firstChildId, 0),
          );
          yield* Window.setActiveElement(
            Option.some({ type: "block" as const, id: targetBlockId }),
          );
          return;
        }

        // Otherwise (no children or collapsed), find next node in document order
        const nextNodeOpt = yield* Block.findNextNode(nodeId);
        if (Option.isNone(nextNodeOpt)) return;

        const nextNodeId = nextNodeOpt.value;
        const targetBlockId = Id.makeBlockId(bufferId, nextNodeId);
        yield* Buffer.setSelection(
          bufferId,
          makeCollapsedSelection(nextNodeId, 0),
        );
        yield* Window.setActiveElement(
          Option.some({ type: "block" as const, id: targetBlockId }),
        );
      }),
    );
  };

  const handleArrowUpOnFirstLine = (cursorGoalX: number) => {
    runtime.runPromise(
      Effect.gen(function* () {
        const [bufferId] = yield* Id.parseBlockId(blockId);
        const Block = yield* BlockT;
        const Store = yield* StoreT;
        const Buffer = yield* BufferT;
        const Window = yield* WindowT;

        // Preserve existing goalX if set (for chained arrow navigation)
        const existingSelection = yield* Buffer.getSelection(bufferId);
        const goalX =
          Option.isSome(existingSelection) &&
          existingSelection.value.goalX != null
            ? existingSelection.value.goalX
            : cursorGoalX;

        const bufferDoc = yield* Store.getDocument("buffer", bufferId);
        const rootNodeId = Option.isSome(bufferDoc)
          ? bufferDoc.value.assignedNodeId
          : null;

        const targetOpt = yield* Block.findPreviousNode(nodeId, bufferId);
        if (Option.isNone(targetOpt)) return;

        const targetNodeId = targetOpt.value;
        yield* Buffer.setSelection(
          bufferId,
          makeCollapsedSelection(targetNodeId, 0, { goalX, goalLine: "last" }),
        );

        if (targetNodeId === rootNodeId) {
          yield* Window.setActiveElement(
            Option.some({ type: "title" as const, bufferId }),
          );
        } else {
          const targetBlockId = Id.makeBlockId(bufferId, targetNodeId);
          yield* Window.setActiveElement(
            Option.some({ type: "block" as const, id: targetBlockId }),
          );
        }
      }),
    );
  };

  const handleArrowDownOnLastLine = (cursorGoalX: number) => {
    runtime.runPromise(
      Effect.gen(function* () {
        const [bufferId] = yield* Id.parseBlockId(blockId);
        const Block = yield* BlockT;
        const Node = yield* NodeT;
        const Buffer = yield* BufferT;
        const Window = yield* WindowT;

        // Preserve existing goalX if set (for chained arrow navigation)
        const existingSelection = yield* Buffer.getSelection(bufferId);
        const goalX =
          Option.isSome(existingSelection) &&
          existingSelection.value.goalX != null
            ? existingSelection.value.goalX
            : cursorGoalX;

        yield* Effect.logDebug(
          "[Block.handleArrowDownOnLastLine] Entered",
        ).pipe(
          Effect.annotateLogs({
            blockId,
            nodeId,
            cursorGoalX,
            resolvedGoalX: goalX,
          }),
        );

        // If has visible children (expanded), go to first child
        const children = yield* Node.getNodeChildren(nodeId);
        if (children.length > 0 && store.isExpanded) {
          const firstChildId = children[0]!;
          const targetBlockId = Id.makeBlockId(bufferId, firstChildId);
          yield* Effect.logDebug(
            "[Block.handleArrowDownOnLastLine] Has visible children, going to first child",
          ).pipe(
            Effect.annotateLogs({
              childrenCount: children.length,
              targetNodeId: firstChildId,
              isExpanded: store.isExpanded,
            }),
          );
          yield* Buffer.setSelection(
            bufferId,
            makeCollapsedSelection(firstChildId, 0, {
              goalX,
              goalLine: "first",
            }),
          );
          yield* Window.setActiveElement(
            Option.some({ type: "block" as const, id: targetBlockId }),
          );
          return;
        }

        // Find next node in document order (no children or collapsed)
        const nextNodeOpt = yield* Block.findNextNode(nodeId);
        yield* Effect.logDebug(
          "[Block.handleArrowDownOnLastLine] findNextNode result",
        ).pipe(
          Effect.annotateLogs({
            hasNext: Option.isSome(nextNodeOpt),
            nextNodeId: Option.getOrNull(nextNodeOpt),
          }),
        );

        if (Option.isNone(nextNodeOpt)) {
          // No next block - move cursor to end of current block
          const Yjs = yield* YjsT;
          const textLength = Yjs.getText(nodeId).length;
          yield* Effect.logDebug(
            "[Block.handleArrowDownOnLastLine] No next block, staying at end",
          ).pipe(Effect.annotateLogs({ textLength }));
          yield* Buffer.setSelection(
            bufferId,
            makeCollapsedSelection(nodeId, textLength),
          );
          return;
        }

        const nextNodeId = nextNodeOpt.value;
        const targetBlockId = Id.makeBlockId(bufferId, nextNodeId);
        yield* Effect.logDebug(
          "[Block.handleArrowDownOnLastLine] Moving to next node",
        ).pipe(Effect.annotateLogs({ nextNodeId, targetBlockId }));
        yield* Buffer.setSelection(
          bufferId,
          makeCollapsedSelection(nextNodeId, 0, { goalX, goalLine: "first" }),
        );
        yield* Window.setActiveElement(
          Option.some({ type: "block" as const, id: targetBlockId }),
        );
      }),
    );
  };

  const handleZoomIn = () => {
    runtime.runPromise(
      Effect.gen(function* () {
        const [bufferId, nodeId] = yield* Id.parseBlockId(blockId);
        const Navigation = yield* NavigationT;
        const Window = yield* WindowT;
        yield* Navigation.navigateTo(nodeId);
        yield* Window.setActiveElement(
          Option.some({ type: "title" as const, bufferId }),
        );
      }),
    );
  };

  const handleToggleExpand = (e: MouseEvent) => {
    e.stopPropagation();
    runtime.runPromise(
      Effect.gen(function* () {
        const Block = yield* BlockT;
        yield* Block.setExpanded(blockId, !store.isExpanded);
      }),
    );
  };

  const enterBlockSelectionMode = () => {
    // Set flag synchronously to prevent handleBlur from clearing activeElement
    isTransitioningToBlockSelection = true;
    // Clear captured selection so Enter returns cursor to model position, not old DOM position
    initialSelection = null;

    runtime
      .runPromise(
        Effect.gen(function* () {
          const [bufferId, nodeId] = yield* Id.parseBlockId(blockId);
          const Window = yield* WindowT;
          const Buffer = yield* BufferT;

          // Switch to block selection mode
          yield* Window.setActiveElement(
            Option.some({ type: "buffer" as const, id: bufferId }),
          );
          // Clear text selection - when returning from block selection, cursor should start fresh
          yield* Buffer.setSelection(bufferId, Option.none());
          yield* Buffer.setBlockSelection(bufferId, [nodeId], nodeId);
        }),
      )
      .finally(() => {
        isTransitioningToBlockSelection = false;
      });
  };

  const handleTypeTrigger = (
    typeId: Id.Node,
    trigger: BlockType.TriggerDefinition,
  ): boolean => {
    if (hasType(typeId)) return false;
    runtime.runPromise(
      Effect.gen(function* () {
        const Type = yield* TypeT;
        yield* Type.addType(nodeId, typeId);
        if (trigger.onTrigger) {
          // onTrigger may have dependencies (e.g., TupleT) which are provided by the runtime
          yield* trigger.onTrigger(nodeId);
        }
      }),
    );
    return true;
  };

  // Type picker handlers
  const handleTypePickerOpen = (
    position: { x: number; y: number },
    from: number,
  ) => {
    setPickerState({ visible: true, position, from });
  };

  const handleTypePickerClose = () => {
    setPickerState(null);
  };

  const handleTypePickerSelect = (typeId: Id.Node) => {
    const state = pickerState();
    if (!state) return;

    runtime.runFork(
      Effect.gen(function* () {
        const TypePicker = yield* TypePickerT;
        const Buffer = yield* BufferT;

        yield* TypePicker.applyType(nodeId, typeId);

        const cursorPos = store.selection?.head ?? ytext.length;
        const deleteLength = cursorPos - state.from;
        if (deleteLength > 0) {
          ytext.delete(state.from, deleteLength);
        }

        const [bufferId] = yield* Id.parseBlockId(blockId);
        yield* Buffer.setSelection(
          bufferId,
          Option.some({
            anchor: { nodeId },
            anchorOffset: state.from,
            focus: { nodeId },
            focusOffset: state.from,
            goalX: null,
            goalLine: null,
            assoc: 0,
          }),
        );

        yield* Effect.logDebug("[Block] Type selected via picker").pipe(
          Effect.annotateLogs({ blockId, nodeId, typeId }),
        );
      }).pipe(
        Effect.tapError((err) =>
          Effect.logError("[Block] Type picker select failed").pipe(
            Effect.annotateLogs({
              blockId,
              nodeId,
              typeId,
              error: String(err),
            }),
          ),
        ),
        Effect.catchAll(() => Effect.void),
      ),
    );

    setPickerState(null);
  };

  const handleTypePickerCreate = (name: string) => {
    const state = pickerState();
    if (!state) return;

    runtime.runFork(
      Effect.gen(function* () {
        const TypePicker = yield* TypePickerT;
        const Buffer = yield* BufferT;

        const typeId = yield* TypePicker.createType(name);
        yield* TypePicker.applyType(nodeId, typeId);

        const cursorPos = store.selection?.head ?? ytext.length;
        const deleteLength = cursorPos - state.from;
        if (deleteLength > 0) {
          ytext.delete(state.from, deleteLength);
        }

        const [bufferId] = yield* Id.parseBlockId(blockId);
        yield* Buffer.setSelection(
          bufferId,
          Option.some({
            anchor: { nodeId },
            anchorOffset: state.from,
            focus: { nodeId },
            focusOffset: state.from,
            goalX: null,
            goalLine: null,
            assoc: 0,
          }),
        );

        yield* Effect.logDebug("[Block] Type created via picker").pipe(
          Effect.annotateLogs({ blockId, nodeId, typeId, name }),
        );
      }).pipe(
        Effect.tapError((err) =>
          Effect.logError("[Block] Type picker create failed").pipe(
            Effect.annotateLogs({ blockId, nodeId, name, error: String(err) }),
          ),
        ),
        Effect.catchAll(() => Effect.void),
      ),
    );

    setPickerState(null);
  };

  const handleAction = (action: EditorAction): boolean | void =>
    Match.value(action).pipe(
      Match.tag("Enter", ({ info }) => {
        // If picker is open, select the current item
        if (pickerState()) {
          const query = getPickerQuery();
          const availableTypes = runtime.runSync(
            Effect.gen(function* () {
              const TypePicker = yield* TypePickerT;
              const types = yield* TypePicker.getAvailableTypes();
              return TypePicker.filterTypes(types, query);
            }),
          );
          if (availableTypes.length > 0) {
            handleTypePickerSelect(availableTypes[0]!.id);
          } else if (query) {
            handleTypePickerCreate(query);
          }
          return true;
        }
        return handleEnter(info);
      }),
      Match.tag("Tab", () => handleTab()),
      Match.tag("ShiftTab", () => handleShiftTab()),
      Match.tag("BackspaceAtStart", () => handleBackspaceAtStart()),
      Match.tag("DeleteAtEnd", () => handleDeleteAtEnd()),
      Match.tag("Navigate", ({ direction, goalX }) =>
        Match.value(direction).pipe(
          Match.when("left", () => handleArrowLeftAtStart()),
          Match.when("right", () => handleArrowRightAtEnd()),
          Match.when("up", () => handleArrowUpOnFirstLine(goalX ?? 0)),
          Match.when("down", () => handleArrowDownOnLastLine(goalX ?? 0)),
          Match.exhaustive,
        ),
      ),
      Match.tag("SelectionChange", ({ selection }) =>
        handleSelectionChange(selection),
      ),
      Match.tag("VerticalMove", ({ anchor, head, assoc, goalX }) => {
        // Update model with selection + preserved goalX (for intra-block vertical movement)
        const [bufferId] = Id.parseBlockId(blockId).pipe(Effect.runSync);
        runtime.runPromise(
          Effect.gen(function* () {
            const Buffer = yield* BufferT;
            yield* Buffer.setSelection(
              bufferId,
              Option.some({
                anchor: { nodeId },
                anchorOffset: anchor,
                focus: { nodeId },
                focusOffset: head,
                goalX,
                goalLine: null,
                assoc,
              }),
            );
          }),
        );
      }),
      Match.tag("Blur", () => handleBlur()),
      Match.tag("Escape", () => {
        // If picker is open, close it instead of entering block selection
        if (pickerState()) {
          handleTypePickerClose();
          return;
        }
        enterBlockSelectionMode();
      }),
      Match.tag("ZoomIn", () => handleZoomIn()),
      Match.tag("BlockSelect", () => enterBlockSelectionMode()),
      Match.tag("Move", ({ action: moveAction }) => handleMove(moveAction)),
      Match.tag("TypeTrigger", ({ typeId, trigger }) =>
        handleTypeTrigger(typeId, trigger),
      ),
      Match.tag("TypePickerOpen", ({ position, from }) =>
        handleTypePickerOpen(position, from),
      ),
      Match.tag("TypePickerUpdate", () => {
        // Query is computed reactively from textContent and selection
      }),
      Match.tag("TypePickerClose", () => handleTypePickerClose()),
      Match.exhaustive,
    );

  const hasChildren = () => store.childBlockIds.length > 0;
  const showChevron = () => hasChildren() || isHovered();

  return (
    <div
      data-element-id={blockId}
      data-element-type="block"
      class="relative"
      classList={{
        "ring-2 ring-blue-400 bg-blue-50/50 rounded": store.isSelected,
      }}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      <Show when={showChevron()}>
        <button
          type="button"
          class="absolute -left-5 top-[calc((var(--text-block)*var(--text-block--line-height)-var(--text-block))/2)] w-5 h-[var(--text-block)] flex items-center justify-center select-none"
          onClick={handleToggleExpand}
          tabIndex={-1}
        >
          <span
            class="block w-0 h-0 border-t-[5px] border-t-transparent border-b-[5px] border-b-transparent border-l-[6px] border-l-gray-400 hover:border-l-gray-600"
            classList={{
              "rotate-90": store.isExpanded,
            }}
          />
        </button>
      </Show>
      <div onClick={handleFocus} class="flex">
        <Transition
          enterActiveClass="transition-all duration-150 ease-out"
          enterClass="opacity-0 scale-0"
          enterToClass="opacity-100 scale-100"
          exitActiveClass="transition-all duration-150 ease-in"
          exitClass="w-4 opacity-100 scale-100"
          exitToClass="w-0 opacity-0 scale-0"
        >
          <Show when={getPrimaryDecoration()}>
            {(renderDecoration) => (
              <span class="w-4 shrink-0 pt-[calc((var(--text-block)*var(--text-block--line-height)-var(--text-block))/2+var(--text-block)*0.025)] mr-1 select-none origin-center overflow-hidden">
                {renderDecoration()({ nodeId })}
              </span>
            )}
          </Show>
        </Transition>
        <div class="flex-1 min-w-0">
          <Show
            when={store.isActive}
            fallback={
              <p class="font-[family-name:var(--font-sans)] text-[length:var(--text-block)] leading-[var(--text-block--line-height)] min-h-[var(--text-block--line-height)] whitespace-break-spaces">
                <Show when={textContent()} fallback={"\u00A0"}>
                  <FormattedText ytext={ytext} />
                </Show>
                <For each={userTypes()}>
                  {(typeId) => <TypeBadge typeId={typeId} nodeId={nodeId} />}
                </For>
              </p>
            }
          >
            <TextEditor
              ytext={ytext}
              undoManager={undoManager}
              onAction={handleAction}
              initialStrategy={resolveSelectionStrategy({
                clickCoords,
                domSelection: initialSelection,
                modelSelection: store.selection,
              })}
              selection={store.selection}
              inlineTypes={userTypes()}
              inlineTypesNodeId={nodeId}
            />
          </Show>
        </div>
      </div>
      <Show when={store.isExpanded}>
        <div class="pl-4 flex flex-col gap-1.5">
          <Show when={store.childBlockIds.length > 0}>
            <div class="w-max h-0"> </div>
          </Show>
          <TransitionGroup
            moveClass="block-move"
            exitActiveClass="block-exit-active"
            exitToClass="block-exit-to"
          >
            <For each={store.childBlockIds}>
              {(childId) => <Block blockId={childId} />}
            </For>
          </TransitionGroup>
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
