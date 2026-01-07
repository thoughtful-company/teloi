import { useBrowserRuntime } from "@/context/useBrowserRuntime";
import { Id } from "@/schema";
import { NodeT } from "@/services/domain/Node";
import { StoreT } from "@/services/external/Store";
import { YjsT } from "@/services/external/Yjs";
import { BufferT } from "@/services/ui/Buffer";
import { WindowT } from "@/services/ui/Window";
import { bindStreamToStore } from "@/utils/bindStreamToStore";
import { Effect, Fiber, Option, Stream } from "effect";
import { createSignal, For, onCleanup, onMount, Show } from "solid-js";
import Block from "./Block";
import Title from "./Title";

const isMac = navigator.platform.toUpperCase().includes("MAC");

/** Spring-based smooth scroll with ease-in-out feel */
function smoothScrollBy(container: HTMLElement, deltaY: number) {
  const target = container.scrollTop + deltaY;

  // Spring parameters
  const stiffness = 180;
  const damping = 26;

  // Ramp-up phase: gradually engage the spring for ease-in effect
  const rampDuration = 0.3; // seconds to reach full spring force

  // State
  let position = container.scrollTop;
  let velocity = 0;
  let lastTime = performance.now();
  const startTime = lastTime;

  const positionThreshold = 0.5;
  const velocityThreshold = 0.5;

  function tick(now: number) {
    const dt = Math.min((now - lastTime) / 1000, 0.064);
    lastTime = now;

    // Ease-in: ramp spring force from 0 to 1 over rampDuration
    const elapsed = (now - startTime) / 1000;
    const ramp = Math.min(elapsed / rampDuration, 1);
    // Smooth the ramp with ease-out curve for natural feel
    const smoothRamp = 1 - Math.pow(1 - ramp, 3);

    // Spring physics with ramped stiffness
    const displacement = position - target;
    const springForce = -stiffness * smoothRamp * displacement;
    const dampingForce = -damping * velocity;
    const acceleration = springForce + dampingForce;

    velocity += acceleration * dt;
    position += velocity * dt;

    container.scrollTop = position;

    const isSettled =
      Math.abs(position - target) < positionThreshold &&
      Math.abs(velocity) < velocityThreshold;

    if (!isSettled) {
      requestAnimationFrame(tick);
    } else {
      container.scrollTop = target;
    }
  }

  requestAnimationFrame(tick);
}

/** Scroll a block into view with margin, using spring animation */
function scrollBlockIntoView(blockId: Id.Block, margin = 50) {
  requestAnimationFrame(() => {
    const el = document.querySelector<HTMLElement>(
      `[data-element-id="${blockId}"][data-element-type="block"]`,
    );
    if (!el) return;

    const scrollContainer = el.closest<HTMLElement>(
      ".overflow-y-auto, .overflow-auto",
    );
    if (!scrollContainer) return;

    const containerRect = scrollContainer.getBoundingClientRect();
    const elRect = el.getBoundingClientRect();

    const topInContainer = elRect.top - containerRect.top;
    const bottomInContainer = elRect.bottom - containerRect.top;

    if (topInContainer < margin) {
      smoothScrollBy(scrollContainer, topInContainer - margin);
    } else if (bottomInContainer > containerRect.height - margin) {
      smoothScrollBy(
        scrollContainer,
        bottomInContainer - containerRect.height + margin,
      );
    }
  });
}

/** Scroll buffer to show the top (title area), using spring animation */
function scrollBufferToTop(bufferId: Id.Buffer) {
  requestAnimationFrame(() => {
    const titleEl = document.querySelector<HTMLElement>(
      `[data-element-id="${bufferId}"][data-element-type="title"]`,
    );
    if (!titleEl) return;

    const scrollContainer = titleEl.closest<HTMLElement>(
      ".overflow-y-auto, .overflow-auto",
    );
    if (!scrollContainer) return;

    if (scrollContainer.scrollTop > 0) {
      smoothScrollBy(scrollContainer, -scrollContainer.scrollTop);
    }
  });
}

interface EditorBufferProps {
  bufferId: Id.Buffer;
}

/**
 * Render the editor UI for a single buffer.
 *
 * Subscribes to the buffer identified by `bufferId`, binds its updates to local state, and renders
 * the buffer header (Title) and a list of child Block components when a root node is present.
 *
 * @param bufferId - Identifier of the buffer to subscribe to and render
 * @returns The component's JSX element; an outer container that conditionally renders a header with a Title and a column of Block components for the buffer's child blocks when the buffer's root node is available
 */
export default function EditorBuffer({ bufferId }: EditorBufferProps) {
  const runtime = useBrowserRuntime();

  const bufferStream = Stream.unwrap(
    Effect.gen(function* () {
      const Buffer = yield* BufferT;
      return yield* Buffer.subscribe(bufferId);
    }),
  );

  const { store, start } = bindStreamToStore({
    stream: bufferStream,
    project: (v) => ({
      nodeId: Id.Node.make(v.nodeData.id),
      childBlockIds: v.childBlockIds.map((childId) =>
        Id.makeBlockId(bufferId, Id.Node.make(childId)),
      ),
    }),
    initial: {
      nodeId: null as Id.Node | null,
      childBlockIds: [] as Id.Block[],
    },
  });

  const getChildNodeIds = () =>
    store.childBlockIds.map((blockId) => {
      const [, nodeId] = Id.parseBlockId(blockId).pipe(Effect.runSync);
      return nodeId;
    });

  const getBufferDoc = Effect.gen(function* () {
    const Store = yield* StoreT;
    const doc = yield* Store.getDocument("buffer", bufferId).pipe(Effect.orDie);
    return Option.getOrNull(doc);
  });

  // Track if we're in block selection mode (activeElement.type === "buffer")
  const [isBlockSelectionMode, setIsBlockSelectionMode] = createSignal(false);

  onMount(() => {
    const dispose = start(runtime);

    // Subscribe to activeElement to know when we're in block selection mode
    const activeElementFiber = runtime.runFork(
      Effect.gen(function* () {
        const Window = yield* WindowT;
        const Buffer = yield* BufferT;
        const Store = yield* StoreT;
        const stream = yield* Window.subscribeActiveElement();

        let wasBufferActive = false;

        yield* Stream.runForEach(stream, (activeElement) =>
          Effect.gen(function* () {
            const isBufferActive = Option.match(activeElement, {
              onNone: () => false,
              onSome: (el) => el.type === "buffer" && el.id === bufferId,
            });

            // When transitioning OUT of block selection mode, clear selection
            if (wasBufferActive && !isBufferActive) {
              const bufferDoc = yield* Store.getDocument(
                "buffer",
                bufferId,
              ).pipe(Effect.orDie);
              const anchor = Option.match(bufferDoc, {
                onNone: () => null,
                onSome: (buf) => buf.blockSelectionAnchor,
              });

              if (anchor) {
                yield* Buffer.setBlockSelection(bufferId, [], anchor);
              }
            }

            wasBufferActive = isBufferActive;
            setIsBlockSelectionMode(isBufferActive);
          }),
        );
      }),
    );

    // Handle Escape key when in block selection mode
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't handle if event came from inside CodeMirror - it has its own Escape handler
      const target = e.target as HTMLElement;
      if (target.closest(".cm-editor")) {
        return;
      }

      if (e.key === "Escape" && isBlockSelectionMode()) {
        e.preventDefault();
        runtime.runPromise(
          Effect.gen(function* () {
            const Buffer = yield* BufferT;

            const bufferDoc = yield* getBufferDoc;
            const blockSelectionAnchor =
              bufferDoc?.blockSelectionAnchor ?? null;
            const blockSelectionFocus =
              bufferDoc?.blockSelectionFocus ?? blockSelectionAnchor;

            if (blockSelectionAnchor && blockSelectionFocus) {
              yield* Buffer.setBlockSelection(
                bufferId,
                [],
                blockSelectionAnchor,
                blockSelectionFocus,
              );
            }
          }),
        );
      }

      // ArrowLeft in block selection mode: select parent block (if nested)
      if (e.key === "ArrowLeft" && isBlockSelectionMode()) {
        e.preventDefault();
        runtime.runPromise(
          Effect.gen(function* () {
            const Buffer = yield* BufferT;
            const Node = yield* NodeT;

            const bufferDoc = yield* getBufferDoc;
            const currentFocus =
              bufferDoc?.blockSelectionFocus ?? bufferDoc?.blockSelectionAnchor;

            if (!currentFocus) return;

            const parentId = yield* Node.getParent(currentFocus);
            const assignedNodeId = bufferDoc?.assignedNodeId;

            // Only select parent if nested (parent is not the buffer root)
            if (parentId !== assignedNodeId) {
              yield* Buffer.setBlockSelection(
                bufferId,
                [parentId],
                parentId,
                parentId,
              );
            }
          }).pipe(Effect.catchTag("NodeHasNoParentError", () => Effect.void)),
        );
      }

      // ArrowRight in block selection mode: select first child (if any)
      if (e.key === "ArrowRight" && isBlockSelectionMode()) {
        e.preventDefault();
        runtime.runPromise(
          Effect.gen(function* () {
            const Buffer = yield* BufferT;
            const Node = yield* NodeT;

            const bufferDoc = yield* getBufferDoc;
            const currentFocus =
              bufferDoc?.blockSelectionFocus ?? bufferDoc?.blockSelectionAnchor;

            if (!currentFocus) return;

            const children = yield* Node.getNodeChildren(currentFocus);

            if (children.length > 0) {
              const firstChild = children[0]!;
              yield* Buffer.setBlockSelection(
                bufferId,
                [firstChild],
                firstChild,
                firstChild,
              );
            }
          }),
        );
      }

      if (
        (e.key === "ArrowUp" || e.key === "ArrowDown") &&
        isBlockSelectionMode()
      ) {
        e.preventDefault();
        runtime.runPromise(
          Effect.gen(function* () {
            const Buffer = yield* BufferT;
            const Node = yield* NodeT;

            const bufferDoc = yield* getBufferDoc;
            if (!bufferDoc) return;

            const {
              blockSelectionAnchor,
              blockSelectionFocus,
              selectedBlocks,
              lastFocusedBlockId,
            } = bufferDoc;

            // When selection is empty but we have lastFocusedBlockId, restore selection there
            const isEmptySelection = selectedBlocks.length === 0;
            if (isEmptySelection) {
              if (!lastFocusedBlockId) return;

              yield* Buffer.setBlockSelection(
                bufferId,
                [lastFocusedBlockId],
                lastFocusedBlockId,
                lastFocusedBlockId,
              );
              scrollBlockIntoView(Id.makeBlockId(bufferId, lastFocusedBlockId));
              return;
            }

            if (!blockSelectionAnchor) return;

            // Get siblings of the current focus (works for nested blocks too)
            const currentFocus = blockSelectionFocus ?? blockSelectionAnchor;
            const parentId = yield* Node.getParent(currentFocus);
            const siblings = yield* Node.getNodeChildren(parentId);
            const focusIndex = siblings.indexOf(currentFocus);

            // Move focus up or down
            const newFocusIndex =
              e.key === "ArrowUp"
                ? Math.max(0, focusIndex - 1)
                : Math.min(siblings.length - 1, focusIndex + 1);

            // ArrowUp on first block: scroll to show top of buffer (skip normal scroll)
            const didScrollToTop =
              e.key === "ArrowUp" && focusIndex === 0 && !e.shiftKey;
            if (didScrollToTop) {
              scrollBufferToTop(bufferId);
            }

            const newFocus = siblings[newFocusIndex];
            if (!newFocus) return;

            const anchorIndex = siblings.indexOf(blockSelectionAnchor);
            if (anchorIndex === -1) return;

            if (e.shiftKey) {
              // Shift+Arrow: extend/contract range from anchor to new focus
              const startIndex = Math.min(anchorIndex, newFocusIndex);
              const endIndex = Math.max(anchorIndex, newFocusIndex);
              const newSelection = siblings.slice(startIndex, endIndex + 1);

              yield* Buffer.setBlockSelection(
                bufferId,
                newSelection,
                blockSelectionAnchor,
                newFocus,
              );

              scrollBlockIntoView(Id.makeBlockId(bufferId, newFocus));
            } else {
              // Plain Arrow: collapse to single block
              const selectionStart = Math.min(anchorIndex, focusIndex);
              const selectionEnd = Math.max(anchorIndex, focusIndex);
              const isSingleSelection = selectionStart === selectionEnd;

              // For multi-selection, jump to edge (Up→top, Down→bottom)
              // For single selection, move one step in arrow direction
              const clampedFocusIndex = isSingleSelection
                ? newFocusIndex
                : e.key === "ArrowUp"
                  ? selectionStart
                  : selectionEnd;

              const clampedFocus = siblings[clampedFocusIndex];
              if (!clampedFocus) return;

              yield* Buffer.setBlockSelection(
                bufferId,
                [clampedFocus],
                clampedFocus,
                clampedFocus,
              );

              // Don't scroll block into view if we already scrolled to top
              if (!didScrollToTop) {
                scrollBlockIntoView(Id.makeBlockId(bufferId, clampedFocus));
              }
            }
          }),
        );
      }

      if (e.key === "Tab" && isBlockSelectionMode()) {
        e.preventDefault();
        runtime.runPromise(
          Effect.gen(function* () {
            const Buffer = yield* BufferT;
            const Node = yield* NodeT;

            const bufferDoc = yield* getBufferDoc;
            if (!bufferDoc) return;

            const {
              selectedBlocks,
              blockSelectionAnchor,
              blockSelectionFocus,
            } = bufferDoc;
            if (selectedBlocks.length === 0) return;

            // Use selectedBlocks directly - they're already in document order
            // from when they were selected (can't filter through childNodeIds
            // because selected blocks might be nested after previous indent)
            const firstSelected = selectedBlocks[0]!;

            if (e.shiftKey) {
              // Outdent: move all selected blocks to grandparent, after parent
              const parentId = yield* Node.getParent(firstSelected);
              const grandparentId = yield* Node.getParent(parentId);

              // Move in reverse order to maintain relative ordering
              for (let i = selectedBlocks.length - 1; i >= 0; i--) {
                yield* Node.insertNode({
                  nodeId: selectedBlocks[i]!,
                  parentId: grandparentId,
                  insert: "after",
                  siblingId: parentId,
                });
              }
            } else {
              // Indent: move all selected blocks under the previous sibling
              const parentId = yield* Node.getParent(firstSelected);
              const siblings = yield* Node.getNodeChildren(parentId);
              const firstIndex = siblings.indexOf(firstSelected);

              // Can't indent if first selected is the first sibling
              if (firstIndex <= 0) return;

              const prevSiblingId = siblings[firstIndex - 1]!;

              // Move all selected blocks to be children of previous sibling
              for (const nodeId of selectedBlocks) {
                yield* Node.insertNode({
                  nodeId,
                  parentId: prevSiblingId,
                  insert: "after",
                });
              }
            }

            // Preserve selection
            yield* Buffer.setBlockSelection(
              bufferId,
              selectedBlocks,
              blockSelectionAnchor!,
              blockSelectionFocus,
            );
          }).pipe(Effect.catchTag("NodeHasNoParentError", () => Effect.void)),
        );
      }

      if (e.key === "Enter" && isBlockSelectionMode()) {
        e.preventDefault();
        runtime.runPromise(
          Effect.gen(function* () {
            const Buffer = yield* BufferT;
            const Window = yield* WindowT;
            const Yjs = yield* YjsT;

            const bufferDoc = yield* getBufferDoc;
            if (!bufferDoc) return;

            const { blockSelectionAnchor, blockSelectionFocus } = bufferDoc;
            const targetBlock = blockSelectionFocus ?? blockSelectionAnchor;
            if (!targetBlock) return;

            // Get text length to place cursor at end
            const text = Yjs.getText(targetBlock).toString();
            const textLength = text.length;

            // Set selection to end of text
            yield* Buffer.setSelection(
              bufferId,
              Option.some({
                anchor: { nodeId: targetBlock },
                anchorOffset: textLength,
                focus: { nodeId: targetBlock },
                focusOffset: textLength,
                goalX: null,
                goalLine: null,
                assoc: 0,
              }),
            );

            // Clear block selection, reset anchor to target block
            yield* Buffer.setBlockSelection(bufferId, [], targetBlock);

            // Enter text editing mode
            const blockId = Id.makeBlockId(bufferId, targetBlock);
            yield* Window.setActiveElement(
              Option.some({ type: "block" as const, id: blockId }),
            );
          }),
        );
      }

      if (
        (e.key === "Delete" || e.key === "Backspace") &&
        isBlockSelectionMode()
      ) {
        e.preventDefault();
        runtime.runPromise(
          Effect.gen(function* () {
            const Buffer = yield* BufferT;
            const Window = yield* WindowT;
            const Node = yield* NodeT;

            const bufferDoc = yield* getBufferDoc;
            if (!bufferDoc) return;

            const { selectedBlocks } = bufferDoc;
            if (selectedBlocks.length === 0) return;

            const childNodeIds = getChildNodeIds();

            // Find the first selected block's index
            const firstSelectedIndex = childNodeIds.findIndex((id) =>
              selectedBlocks.includes(id),
            );

            // Determine which block to focus after deletion
            // Prefer block before selection, otherwise block after, otherwise none
            const remainingNodes = childNodeIds.filter(
              (id) => !selectedBlocks.includes(id),
            );
            const focusAfterDelete =
              firstSelectedIndex > 0
                ? childNodeIds[firstSelectedIndex - 1]
                : (remainingNodes[0] ?? null);

            // Delete all selected nodes
            for (const nodeId of selectedBlocks) {
              yield* Node.deleteNode(nodeId);
            }

            // Stay in block selection mode with the next block selected
            if (focusAfterDelete) {
              yield* Buffer.setBlockSelection(
                bufferId,
                [focusAfterDelete],
                focusAfterDelete,
              );
              // Stay in buffer selection mode (don't enter text editing)
            } else {
              // No blocks remaining, exit block selection mode
              yield* Window.setActiveElement(Option.none());
            }
          }),
        );
      }

      const modPressed = isMac ? e.metaKey : e.ctrlKey;

      if (e.key === "c" && modPressed && isBlockSelectionMode()) {
        e.preventDefault();
        runtime.runPromise(
          Effect.gen(function* () {
            const Yjs = yield* YjsT;

            const bufferDoc = yield* getBufferDoc;
            if (!bufferDoc) return;

            const { selectedBlocks } = bufferDoc;
            if (selectedBlocks.length === 0) return;

            const childNodeIds = getChildNodeIds();

            // Filter to selected blocks, maintaining document order
            const orderedSelection = childNodeIds.filter((id) =>
              selectedBlocks.includes(id),
            );

            const texts = orderedSelection.map((nodeId) =>
              Yjs.getText(nodeId).toString(),
            );

            // Join with double newlines (paragraph spacing) and copy to clipboard
            yield* Effect.promise(() =>
              navigator.clipboard.writeText(texts.join("\n\n")),
            );
          }),
        );
      }

      if (e.key === "x" && modPressed && isBlockSelectionMode()) {
        e.preventDefault();
        runtime.runPromise(
          Effect.gen(function* () {
            const Yjs = yield* YjsT;
            const Buffer = yield* BufferT;
            const Window = yield* WindowT;
            const Node = yield* NodeT;

            const bufferDoc = yield* getBufferDoc;
            if (!bufferDoc) return;

            const { selectedBlocks } = bufferDoc;
            if (selectedBlocks.length === 0) return;

            const childNodeIds = getChildNodeIds();

            const orderedSelection = childNodeIds.filter((id) =>
              selectedBlocks.includes(id),
            );

            const texts = orderedSelection.map((nodeId) =>
              Yjs.getText(nodeId).toString(),
            );

            yield* Effect.promise(() =>
              navigator.clipboard.writeText(texts.join("\n\n")),
            );

            const firstSelectedIndex = childNodeIds.findIndex((id) =>
              selectedBlocks.includes(id),
            );

            const remainingNodes = childNodeIds.filter(
              (id) => !selectedBlocks.includes(id),
            );
            const focusAfterDelete =
              firstSelectedIndex > 0
                ? childNodeIds[firstSelectedIndex - 1]
                : (remainingNodes[0] ?? null);

            for (const nodeId of selectedBlocks) {
              yield* Node.deleteNode(nodeId);
            }

            if (focusAfterDelete) {
              yield* Buffer.setBlockSelection(
                bufferId,
                [focusAfterDelete],
                focusAfterDelete,
              );
            } else {
              yield* Window.setActiveElement(Option.none());
            }
          }),
        );
      }
    };

    document.addEventListener("keydown", handleKeyDown);

    onCleanup(() => {
      dispose();
      runtime.runFork(Fiber.interrupt(activeElementFiber));
      document.removeEventListener("keydown", handleKeyDown);
    });
  });

  const handleClickZone = (_e: MouseEvent, nodeId: Id.Node) => {
    runtime.runPromise(
      Effect.gen(function* () {
        const Node = yield* NodeT;
        const Yjs = yield* YjsT;
        const Buffer = yield* BufferT;
        const Window = yield* WindowT;

        const children = yield* Node.getNodeChildren(nodeId);
        const lastChildId =
          children.length > 0 ? children[children.length - 1] : null;

        let targetNodeId: Id.Node;
        let targetBlockId: Id.Block;

        if (lastChildId) {
          const lastChildText = Yjs.getText(lastChildId).toString();
          if (lastChildText === "") {
            targetNodeId = lastChildId;
            targetBlockId = Id.makeBlockId(bufferId, lastChildId);
          } else {
            targetNodeId = yield* Node.insertNode({
              parentId: nodeId,
              insert: "after",
            });
            targetBlockId = Id.makeBlockId(bufferId, targetNodeId);
          }
        } else {
          targetNodeId = yield* Node.insertNode({
            parentId: nodeId,
            insert: "after",
          });
          targetBlockId = Id.makeBlockId(bufferId, targetNodeId);
        }

        yield* Buffer.setSelection(
          bufferId,
          Option.some({
            anchor: { nodeId: targetNodeId },
            anchorOffset: 0,
            focus: { nodeId: targetNodeId },
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

  return (
    <div data-testid="editor-buffer" class="h-full flex flex-col">
      <Show when={store.nodeId} keyed>
        {(nodeId) => (
          <>
            <header class="mx-auto max-w-[var(--max-line-width)] w-full border-b-[1.5px] border-foreground-lighter pb-3 pt-7">
              <Title bufferId={bufferId} nodeId={nodeId} />
            </header>
            <div data-testid="editor-body" class="flex-1 flex flex-col pt-4">
              <div class="mx-auto flex flex-col gap-1.5 max-w-[var(--max-line-width)] w-full">
                <For each={store.childBlockIds}>
                  {(childId) => <Block blockId={childId} />}
                </For>
              </div>
              <div
                data-testid="editor-click-zone"
                class="flex-1 min-h-[25vh] cursor-text"
                onClick={(e) => handleClickZone(e, nodeId)}
              />
            </div>
          </>
        )}
      </Show>
    </div>
  );
}
