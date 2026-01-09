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
import { WindowT } from "@/services/ui/Window";
import { bindStreamToStore } from "@/utils/bindStreamToStore";
import { resolveSelectionStrategy } from "@/utils/selectionStrategy";
import { Effect, Fiber, Option, Stream } from "effect";
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
  type EnterKeyInfo,
  type SelectionInfo,
} from "./TextEditor";

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
              isToggled: false,
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
      childBlockIds: view.childBlockIds,
      selection: view.selection,
    }),
    initial: {
      isActive: false,
      isSelected: false,
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
    console.debug("[Block.handleSelectionChange] Called", {
      blockId,
      nodeId,
      selection,
    });

    runtime.runPromise(
      Effect.gen(function* () {
        const [bufferId] = yield* Id.parseBlockId(blockId);
        const Buffer = yield* BufferT;

        // Preserve goalX/goalLine only for same-node selection changes (chained vertical navigation)
        const existingSelection = yield* Buffer.getSelection(bufferId);
        const isSameNode =
          Option.isSome(existingSelection) &&
          existingSelection.value.anchor.nodeId === nodeId;
        const goalX = isSameNode ? existingSelection.value.goalX : null;
        const goalLine = isSameNode ? existingSelection.value.goalLine : null;

        yield* Effect.logDebug(
          "[Block.handleSelectionChange] Setting selection",
        ).pipe(
          Effect.annotateLogs({
            nodeId,
            anchor: selection.anchor,
            head: selection.head,
            existingOffset: Option.isSome(existingSelection)
              ? existingSelection.value.anchorOffset
              : null,
          }),
        );

        yield* Buffer.setSelection(
          bufferId,
          Option.some({
            anchor: { nodeId },
            anchorOffset: selection.anchor,
            focus: { nodeId },
            focusOffset: selection.head,
            goalX,
            goalLine,
            assoc: selection.assoc,
          }),
        );
      }),
    );
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
          Option.some({
            anchor: { nodeId: result.newNodeId },
            anchorOffset: result.cursorOffset,
            focus: { nodeId: result.newNodeId },
            focusOffset: result.cursorOffset,
            goalX: null,
            goalLine: null,
            assoc: 0,
          }),
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
        yield* Block.indent(nodeId);
      }),
    );
  };

  const handleShiftTab = () => {
    runtime.runPromise(
      Effect.gen(function* () {
        const Block = yield* BlockT;
        yield* Block.outdent(nodeId);
      }),
    );
  };

  const handleSwapUp = () => {
    isMoving = true;
    runtime.runPromise(
      Effect.gen(function* () {
        const Block = yield* BlockT;
        const moved = yield* Block.swap(nodeId, "up");
        if (moved) {
          yield* waitForDomAndRefocus;
        }
      }).pipe(Effect.ensuring(Effect.sync(() => (isMoving = false)))),
    );
  };

  const handleSwapDown = () => {
    isMoving = true;
    runtime.runPromise(
      Effect.gen(function* () {
        const Block = yield* BlockT;
        const moved = yield* Block.swap(nodeId, "down");
        if (moved) {
          yield* waitForDomAndRefocus;
        }
      }).pipe(Effect.ensuring(Effect.sync(() => (isMoving = false)))),
    );
  };

  const handleMoveToFirst = () => {
    isMoving = true;
    runtime.runPromise(
      Effect.gen(function* () {
        const Block = yield* BlockT;
        const moved = yield* Block.moveToFirst(nodeId);
        if (moved) {
          yield* waitForDomAndRefocus;
        }
      }).pipe(Effect.ensuring(Effect.sync(() => (isMoving = false)))),
    );
  };

  const handleMoveToLast = () => {
    isMoving = true;
    runtime.runPromise(
      Effect.gen(function* () {
        const Block = yield* BlockT;
        const moved = yield* Block.moveToLast(nodeId);
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

        const Block = yield* BlockT;
        const Buffer = yield* BufferT;
        const Window = yield* WindowT;
        const Store = yield* StoreT;

        const bufferDoc = yield* Store.getDocument("buffer", bufferId);
        const rootNodeId = Option.isSome(bufferDoc)
          ? (bufferDoc.value.assignedNodeId as Id.Node)
          : null;

        const result = yield* Block.mergeBackward(nodeId, rootNodeId);
        if (Option.isNone(result)) return;

        const { targetNodeId, cursorOffset, isTitle } = result.value;

        yield* Buffer.setSelection(
          bufferId,
          Option.some({
            anchor: { nodeId: targetNodeId },
            anchorOffset: cursorOffset,
            focus: { nodeId: targetNodeId },
            focusOffset: cursorOffset,
            goalX: null,
            goalLine: null,
            assoc: 0,
          }),
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
        const Block = yield* BlockT;
        const Buffer = yield* BufferT;

        const result = yield* Block.mergeForward(nodeId);
        if (Option.isNone(result)) return;

        yield* Buffer.setSelection(
          bufferId,
          Option.some({
            anchor: { nodeId },
            anchorOffset: result.value.cursorOffset,
            focus: { nodeId },
            focusOffset: result.value.cursorOffset,
            goalX: null,
            goalLine: null,
            assoc: 0,
          }),
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

        const targetOpt = yield* Block.findPreviousNode(nodeId);
        if (Option.isNone(targetOpt)) return;

        const targetNodeId = targetOpt.value;
        const targetYtext = Yjs.getText(targetNodeId);
        const endPos = targetYtext.length;

        yield* Buffer.setSelection(
          bufferId,
          Option.some({
            anchor: { nodeId: targetNodeId },
            anchorOffset: endPos,
            focus: { nodeId: targetNodeId },
            focusOffset: endPos,
            goalX: null,
            goalLine: null,
            assoc: 0,
          }),
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

        // If has children, go to first child
        const children = yield* Node.getNodeChildren(nodeId);
        if (children.length > 0) {
          const firstChildId = children[0]!;
          const targetBlockId = Id.makeBlockId(bufferId, firstChildId);
          yield* Buffer.setSelection(
            bufferId,
            Option.some({
              anchor: { nodeId: firstChildId },
              anchorOffset: 0,
              focus: { nodeId: firstChildId },
              focusOffset: 0,
              goalX: null,
              goalLine: null,
              assoc: 0,
            }),
          );
          yield* Window.setActiveElement(
            Option.some({ type: "block" as const, id: targetBlockId }),
          );
          return;
        }

        // Otherwise, find next node in document order
        const nextNodeOpt = yield* Block.findNextNode(nodeId);
        if (Option.isNone(nextNodeOpt)) return;

        const nextNodeId = nextNodeOpt.value;
        const targetBlockId = Id.makeBlockId(bufferId, nextNodeId);
        yield* Buffer.setSelection(
          bufferId,
          Option.some({
            anchor: { nodeId: nextNodeId },
            anchorOffset: 0,
            focus: { nodeId: nextNodeId },
            focusOffset: 0,
            goalX: null,
            goalLine: null,
            assoc: 0,
          }),
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

        const targetOpt = yield* Block.findPreviousNode(nodeId);
        if (Option.isNone(targetOpt)) return;

        const targetNodeId = targetOpt.value;
        yield* Buffer.setSelection(
          bufferId,
          Option.some({
            anchor: { nodeId: targetNodeId },
            anchorOffset: 0,
            focus: { nodeId: targetNodeId },
            focusOffset: 0,
            goalX,
            goalLine: "last",
            assoc: 0,
          }),
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

        // If has children, go to first child
        const children = yield* Node.getNodeChildren(nodeId);
        if (children.length > 0) {
          const firstChildId = children[0]!;
          const targetBlockId = Id.makeBlockId(bufferId, firstChildId);
          yield* Buffer.setSelection(
            bufferId,
            Option.some({
              anchor: { nodeId: firstChildId },
              anchorOffset: 0,
              focus: { nodeId: firstChildId },
              focusOffset: 0,
              goalX,
              goalLine: "first",
              assoc: 0,
            }),
          );
          yield* Window.setActiveElement(
            Option.some({ type: "block" as const, id: targetBlockId }),
          );
          return;
        }

        // Find next node in document order
        const nextNodeOpt = yield* Block.findNextNode(nodeId);
        if (Option.isNone(nextNodeOpt)) {
          // No next block - move cursor to end of current block
          const Yjs = yield* YjsT;
          const textLength = Yjs.getText(nodeId).length;
          yield* Buffer.setSelection(
            bufferId,
            Option.some({
              anchor: { nodeId },
              anchorOffset: textLength,
              focus: { nodeId },
              focusOffset: textLength,
              goalX: null,
              goalLine: null,
              assoc: 0,
            }),
          );
          return;
        }

        const nextNodeId = nextNodeOpt.value;
        const targetBlockId = Id.makeBlockId(bufferId, nextNodeId);
        yield* Buffer.setSelection(
          bufferId,
          Option.some({
            anchor: { nodeId: nextNodeId },
            anchorOffset: 0,
            focus: { nodeId: nextNodeId },
            focusOffset: 0,
            goalX,
            goalLine: "first",
            assoc: 0,
          }),
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

  const handleEscape = () => {
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

  const handleShiftArrowUpFromTextSelection = () => {
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

  const handleShiftArrowDownFromTextSelection = () => {
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

  return (
    <div
      data-element-id={blockId}
      data-element-type="block"
      classList={{
        "ring-2 ring-blue-400 bg-blue-50/50 rounded": store.isSelected,
      }}
    >
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
                {textContent() || "\u00A0"}
              </p>
            }
          >
            <TextEditor
              ytext={ytext}
              undoManager={undoManager}
              onEnter={handleEnter}
              onTab={handleTab}
              onShiftTab={handleShiftTab}
              onBackspaceAtStart={handleBackspaceAtStart}
              onDeleteAtEnd={handleDeleteAtEnd}
              onArrowLeftAtStart={handleArrowLeftAtStart}
              onArrowRightAtEnd={handleArrowRightAtEnd}
              onArrowUpOnFirstLine={handleArrowUpOnFirstLine}
              onArrowDownOnLastLine={handleArrowDownOnLastLine}
              onSelectionChange={handleSelectionChange}
              onBlur={handleBlur}
              onZoomIn={handleZoomIn}
              onEscape={handleEscape}
              onShiftArrowUpFromTextSelection={
                handleShiftArrowUpFromTextSelection
              }
              onShiftArrowDownFromTextSelection={
                handleShiftArrowDownFromTextSelection
              }
              onSwapUp={handleSwapUp}
              onSwapDown={handleSwapDown}
              onMoveToFirst={handleMoveToFirst}
              onMoveToLast={handleMoveToLast}
              onTypeTrigger={handleTypeTrigger}
              initialStrategy={resolveSelectionStrategy({
                clickCoords,
                domSelection: initialSelection,
                modelSelection: store.selection,
              })}
              selection={store.selection}
            />
          </Show>
        </div>
      </div>
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
    </div>
  );
}
