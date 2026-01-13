import { useBrowserRuntime } from "@/context/useBrowserRuntime";
import { Id } from "@/schema";
import { NodeT } from "@/services/domain/Node";
import { StoreT } from "@/services/external/Store";
import { YjsT } from "@/services/external/Yjs";
import { BlockT } from "@/services/ui/Block";
import { BufferT } from "@/services/ui/Buffer";
import { WindowT } from "@/services/ui/Window";
import { bindStreamToStore } from "@/utils/bindStreamToStore";
import { Effect, Fiber, Option, Stream } from "effect";
import { createSignal, For, onCleanup, onMount, Show } from "solid-js";
import Block from "./Block";
import TableView from "./TableView";
import Title from "./Title";
import TypeList from "./TypeList";
import ViewTabs from "./ViewTabs";

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

/**
 * Cross-parent movement for block selection mode.
 * Moves selected blocks to adjacent parent sibling.
 *
 * - "up": move to become last children of parent's previous sibling
 * - "down": move to become first children of parent's next sibling
 *
 * Returns true if move succeeded, false if no valid target exists.
 */
const crossParentMoveBlocks = (
  nodeIds: readonly Id.Node[],
  parentId: Id.Node,
  direction: "up" | "down",
): Effect.Effect<boolean, never, NodeT> =>
  Effect.gen(function* () {
    const Node = yield* NodeT;

    // Get grandparent (parent's parent)
    const grandparentId = yield* Node.getParent(parentId).pipe(
      Effect.catchTag("NodeHasNoParentError", () =>
        Effect.succeed<Id.Node | null>(null),
      ),
    );
    if (!grandparentId) return false;

    // Get parent's siblings
    const parentSiblings = yield* Node.getNodeChildren(grandparentId);
    const parentIndex = parentSiblings.indexOf(parentId);
    if (parentIndex === -1) return false;

    if (direction === "up") {
      // Find previous parent sibling
      if (parentIndex === 0) return false;
      const prevParentSiblingId = parentSiblings[parentIndex - 1]!;

      // Move all nodes to become last children of previous parent sibling
      for (const nodeId of nodeIds) {
        yield* Node.insertNode({
          nodeId,
          parentId: prevParentSiblingId,
          insert: "after", // "after" with no siblingId = append at end
        });
      }
    } else {
      // Find next parent sibling
      if (parentIndex === parentSiblings.length - 1) return false;
      const nextParentSiblingId = parentSiblings[parentIndex + 1]!;

      // Move all nodes to become first children of next parent sibling
      const targetChildren = yield* Node.getNodeChildren(nextParentSiblingId);
      if (targetChildren.length > 0) {
        // Insert before first child, maintaining order
        yield* Node.moveNodes({
          nodeIds,
          parentId: nextParentSiblingId,
          insert: "before",
          siblingId: targetChildren[0]!,
        });
      } else {
        // Empty parent - insert nodes one by one
        for (const nodeId of nodeIds) {
          yield* Node.insertNode({
            nodeId,
            parentId: nextParentSiblingId,
            insert: "after",
          });
        }
      }
    }

    return true;
  }).pipe(
    Effect.catchAll(() => Effect.succeed(false)),
  );

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
      activeViewId: v.activeViewId,
    }),
    initial: {
      nodeId: null as Id.Node | null,
      childBlockIds: [] as Id.Block[],
      activeViewId: null as Id.Node | null,
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
      const target = e.target;
      if (target instanceof HTMLElement && target.closest(".cm-editor")) {
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

      // Alt+Cmd+Arrow in block selection mode: swap/move selected blocks
      if (
        (e.key === "ArrowUp" || e.key === "ArrowDown") &&
        e.altKey &&
        (isMac ? e.metaKey : e.ctrlKey) &&
        isBlockSelectionMode()
      ) {
        e.preventDefault();
        runtime.runPromise(
          Effect.gen(function* () {
            const Buffer = yield* BufferT;
            const Node = yield* NodeT;

            const bufferDoc = yield* getBufferDoc;
            if (!bufferDoc) return;

            const { selectedBlocks, blockSelectionAnchor, blockSelectionFocus } =
              bufferDoc;
            if (selectedBlocks.length === 0) return;

            // Get parent and siblings of selected blocks (they're all siblings)
            const firstSelected = selectedBlocks[0]!;
            const lastSelected = selectedBlocks[selectedBlocks.length - 1]!;
            const parentId = yield* Node.getParent(firstSelected);
            const siblings = yield* Node.getNodeChildren(parentId);

            const firstIndex = siblings.indexOf(firstSelected);
            const lastIndex = siblings.indexOf(lastSelected);

            if (e.shiftKey) {
              // Shift+Alt+Cmd+Arrow: Move to first/last
              if (e.key === "ArrowUp") {
                if (firstIndex === 0) return; // Already first
                yield* Node.moveNodes({
                  nodeIds: selectedBlocks,
                  parentId,
                  insert: "before",
                  siblingId: siblings[0]!,
                });
              } else {
                if (lastIndex === siblings.length - 1) return; // Already last
                yield* Node.moveNodes({
                  nodeIds: selectedBlocks,
                  parentId,
                  insert: "after",
                  siblingId: siblings[siblings.length - 1]!,
                });
              }
            } else {
              // Alt+Cmd+Arrow: Swap with adjacent (or cross-parent at boundary)
              if (e.key === "ArrowUp") {
                if (firstIndex === 0) {
                  // At first position - try cross-parent movement
                  const moved = yield* crossParentMoveBlocks(
                    selectedBlocks,
                    parentId,
                    "up",
                  );
                  if (!moved) return;
                } else {
                  yield* Node.moveNodes({
                    nodeIds: selectedBlocks,
                    parentId,
                    insert: "before",
                    siblingId: siblings[firstIndex - 1]!,
                  });
                }
              } else {
                if (lastIndex === siblings.length - 1) {
                  // At last position - try cross-parent movement
                  const moved = yield* crossParentMoveBlocks(
                    selectedBlocks,
                    parentId,
                    "down",
                  );
                  if (!moved) return;
                } else {
                  yield* Node.moveNodes({
                    nodeIds: selectedBlocks,
                    parentId,
                    insert: "after",
                    siblingId: siblings[lastIndex + 1]!,
                  });
                }
              }
            }

            // Preserve selection
            yield* Buffer.setBlockSelection(
              bufferId,
              selectedBlocks,
              blockSelectionAnchor!,
              blockSelectionFocus,
            );
          }).pipe(
            Effect.catchTag("NodeHasNoParentError", () => Effect.void),
            Effect.catchTag("NodeNotFoundError", () => Effect.void),
          ),
        );
      }

      // Cmd+ArrowUp/Down in block selection mode: collapse/expand selected blocks
      if (
        (e.key === "ArrowUp" || e.key === "ArrowDown") &&
        !e.altKey &&
        !e.shiftKey &&
        (isMac ? e.metaKey : e.ctrlKey) &&
        isBlockSelectionMode()
      ) {
        e.preventDefault();
        runtime.runPromise(
          Effect.gen(function* () {
            const Block = yield* BlockT;
            const Node = yield* NodeT;

            const bufferDoc = yield* getBufferDoc;
            if (!bufferDoc) return;

            const { selectedBlocks } = bufferDoc;
            const isCollapse = e.key === "ArrowUp";

            // Expand one level: if collapsed, expand; else expand first collapsed child
            const expandOneLevel = (
              nodeId: Id.Node,
            ): Effect.Effect<boolean> =>
              Effect.gen(function* () {
                const blockId = Id.makeBlockId(bufferId, nodeId);
                const isExpanded = yield* Block.isExpanded(blockId);

                if (!isExpanded) {
                  yield* Block.setExpanded(blockId, true);
                  return true;
                }

                // Already expanded - try to expand children
                const children = yield* Node.getNodeChildren(nodeId);
                for (const childId of children) {
                  const didExpand = yield* expandOneLevel(childId);
                  if (didExpand) return true;
                }

                return false;
              });

            // Collapse one level: collapse deepest expanded descendants first
            const collapseOneLevel = (
              nodeId: Id.Node,
            ): Effect.Effect<boolean> =>
              Effect.gen(function* () {
                const blockId = Id.makeBlockId(bufferId, nodeId);
                const isExpanded = yield* Block.isExpanded(blockId);
                const children = yield* Node.getNodeChildren(nodeId);

                // Leaf nodes (no children) can't be collapsed
                if (children.length === 0) {
                  return false;
                }

                if (!isExpanded) {
                  return false;
                }

                // Check if any children are expanded - collapse deepest first
                let childWasCollapsed = false;

                for (const childId of children) {
                  const didCollapse = yield* collapseOneLevel(childId);
                  if (didCollapse) childWasCollapsed = true;
                }

                if (childWasCollapsed) {
                  return true;
                }

                // No expanded descendants - collapse this block
                yield* Block.setExpanded(blockId, false);
                return true;
              });

            for (const nodeId of selectedBlocks) {
              if (isCollapse) {
                yield* collapseOneLevel(nodeId);
              } else {
                yield* expandOneLevel(nodeId);
              }
            }
          }),
        );
        return;
      }

      // Cmd+Shift+ArrowUp/Down in block selection mode: drill in/out
      // Stays in block selection mode, just moves selection to parent/child
      if (
        (e.key === "ArrowUp" || e.key === "ArrowDown") &&
        !e.altKey &&
        e.shiftKey &&
        (isMac ? e.metaKey : e.ctrlKey) &&
        isBlockSelectionMode()
      ) {
        e.preventDefault();
        runtime.runPromise(
          Effect.gen(function* () {
            const Block = yield* BlockT;
            const Buffer = yield* BufferT;
            const Node = yield* NodeT;
            const Window = yield* WindowT;

            const bufferDoc = yield* getBufferDoc;
            if (!bufferDoc) return;

            const { selectedBlocks } = bufferDoc;
            if (selectedBlocks.length === 0) return;

            const nodeId = selectedBlocks[0]!;
            const blockId = Id.makeBlockId(bufferId, nodeId);
            const isDrillOut = e.key === "ArrowUp";

            if (isDrillOut) {
              // DrillOut: collapse PARENT, select parent (stay in block selection mode)
              // We're "drilling out" of the parent level, so collapse it
              const parentId = yield* Node.getParent(nodeId).pipe(
                Effect.catchTag("NodeHasNoParentError", () =>
                  Effect.succeed<Id.Node | null>(null),
                ),
              );
              if (!parentId) return;

              const parentBlockId = Id.makeBlockId(bufferId, parentId);

              // Collapse the PARENT (not the current block)
              yield* Block.setExpanded(parentBlockId, false);

              // Check if parent is the buffer root
              const assignedNodeId = yield* Buffer.getAssignedNodeId(bufferId);
              if (parentId === assignedNodeId) {
                // Navigate to title (exit block selection mode)
                yield* Buffer.setBlockSelection(bufferId, [], null, null);
                yield* Window.setActiveElement(
                  Option.some({ type: "title" as const, bufferId }),
                );
                return;
              }

              // Select parent block (stay in block selection mode)
              yield* Buffer.setBlockSelection(
                bufferId,
                [parentId],
                parentId,
                parentId,
              );
            } else {
              // DrillIn: select first child (stay in block selection mode)
              const children = yield* Node.getNodeChildren(nodeId);

              const firstChildId =
                children.length === 0
                  ? yield* Node.insertNode({
                      parentId: nodeId,
                      insert: "before",
                    })
                  : children[0]!;

              yield* Block.setExpanded(blockId, true);

              // Select first child (stay in block selection mode)
              yield* Buffer.setBlockSelection(
                bufferId,
                [firstChildId],
                firstChildId,
                firstChildId,
              );
            }
          }),
        );
        return;
      }

      if (
        (e.key === "ArrowUp" || e.key === "ArrowDown") &&
        !e.altKey && // Alt+Cmd+Arrow is handled above for swap/move
        !(isMac ? e.metaKey : e.ctrlKey) // Cmd+Arrow is handled above for collapse/expand
        // Note: We handle both isBlockSelectionMode() AND when nothing is focused
      ) {
        e.preventDefault();
        runtime.runPromise(
          Effect.gen(function* () {
            const Buffer = yield* BufferT;
            const Node = yield* NodeT;
            const Window = yield* WindowT;
            const Store = yield* StoreT;

            const sessionId = yield* Store.getSessionId();
            const windowId = Id.Window.make(sessionId);
            const windowDoc = yield* Store.getDocument("window", windowId);
            if (Option.isNone(windowDoc)) return;

            if (windowDoc.value.activeElement === null) {
              yield* Window.setActiveElement(
                Option.some({ type: "buffer" as const, id: bufferId }),
              );
            } else if (
              windowDoc.value.activeElement.type !== "buffer" ||
              windowDoc.value.activeElement.id !== bufferId
            ) {
              // Something else is focused (different buffer or title/block), don't handle
              return;
            }

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
              if (!lastFocusedBlockId) {
                const rootNodeId = bufferDoc.assignedNodeId as Id.Node;
                const children = yield* Node.getNodeChildren(rootNodeId);
                if (children.length === 0) return;

                const targetBlock =
                  e.key === "ArrowDown"
                    ? children[0]!
                    : children[children.length - 1]!;
                yield* Buffer.setBlockSelection(
                  bufferId,
                  [targetBlock],
                  targetBlock,
                  targetBlock,
                );
                scrollBlockIntoView(Id.makeBlockId(bufferId, targetBlock));
                return;
              }

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

            // Move focus up or down by one step
            const newFocusIndex =
              e.key === "ArrowUp"
                ? Math.max(0, focusIndex - 1)
                : Math.min(siblings.length - 1, focusIndex + 1);

            // ArrowUp on first block: scroll to show top of buffer (skip normal scroll)
            // Only trigger for first child at buffer root, not nested blocks
            const didScrollToTop =
              e.key === "ArrowUp" &&
              focusIndex === 0 &&
              !e.shiftKey &&
              parentId === bufferDoc.assignedNodeId;
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

            const bufferDoc = yield* getBufferDoc;
            if (!bufferDoc) return;

            const {
              selectedBlocks,
              blockSelectionAnchor,
              blockSelectionFocus,
            } = bufferDoc;
            if (selectedBlocks.length === 0) return;

            if (e.shiftKey) {
              yield* Buffer.outdent(bufferId, selectedBlocks);
            } else {
              yield* Buffer.indent(bufferId, selectedBlocks);
            }

            // Preserve selection
            yield* Buffer.setBlockSelection(
              bufferId,
              selectedBlocks,
              blockSelectionAnchor!,
              blockSelectionFocus,
            );
          }),
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

      // Space in block selection mode: create new sibling and enter text editing
      if (e.key === " " && isBlockSelectionMode()) {
        e.preventDefault();
        runtime.runPromise(
          Effect.gen(function* () {
            const Buffer = yield* BufferT;
            const Window = yield* WindowT;
            const Node = yield* NodeT;

            const bufferDoc = yield* getBufferDoc;
            if (!bufferDoc) return;

            const { blockSelectionAnchor, blockSelectionFocus } = bufferDoc;
            const targetBlock = blockSelectionFocus ?? blockSelectionAnchor;
            if (!targetBlock) return;

            const parentId = yield* Node.getParent(targetBlock);
            const newNodeId = yield* Node.insertNode({
              parentId,
              insert: "after",
              siblingId: targetBlock,
            });

            yield* Buffer.setSelection(
              bufferId,
              Option.some({
                anchor: { nodeId: newNodeId },
                anchorOffset: 0,
                focus: { nodeId: newNodeId },
                focusOffset: 0,
                goalX: null,
                goalLine: null,
                assoc: 0,
              }),
            );
            yield* Buffer.setBlockSelection(bufferId, [], newNodeId);

            const blockId = Id.makeBlockId(bufferId, newNodeId);
            yield* Window.setActiveElement(
              Option.some({ type: "block" as const, id: blockId }),
            );
          }).pipe(Effect.catchTag("NodeHasNoParentError", () => Effect.void)),
        );
      }

      // Enter/Space with no selection: focus or create last block, then enter editing mode
      // Existing handlers above return early if no block is selected
      if (e.key === "Enter" || e.key === " ") {
        const target = e.target;
        if (target instanceof HTMLElement && target.closest(".cm-editor")) {
          return;
        }

        runtime.runPromise(
          Effect.gen(function* () {
            const Buffer = yield* BufferT;
            const Node = yield* NodeT;
            const Window = yield* WindowT;
            const Store = yield* StoreT;
            const Yjs = yield* YjsT;

            const sessionId = yield* Store.getSessionId();
            const windowId = Id.Window.make(sessionId);
            const windowDoc = yield* Store.getDocument("window", windowId);
            if (Option.isNone(windowDoc)) return;

            // Only handle when activeElement is null or this buffer (not a block/title)
            const ae = windowDoc.value.activeElement;
            if (ae !== null && (ae.type !== "buffer" || ae.id !== bufferId)) {
              return;
            }

            const bufferDoc = yield* getBufferDoc;
            if (!bufferDoc) return;
            if (bufferDoc.selectedBlocks.length > 0) return;

            const rootNodeId = bufferDoc.assignedNodeId as Id.Node;
            const children = yield* Node.getNodeChildren(rootNodeId);

            let targetNodeId: Id.Node;

            if (children.length === 0) {
              targetNodeId = yield* Node.insertNode({
                parentId: rootNodeId,
                insert: "after",
              });
            } else {
              const lastChildId = children[children.length - 1]!;
              const lastChildText = Yjs.getText(lastChildId).toString();

              if (lastChildText === "") {
                targetNodeId = lastChildId;
              } else {
                targetNodeId = yield* Node.insertNode({
                  parentId: rootNodeId,
                  insert: "after",
                  siblingId: lastChildId,
                });
              }
            }

            const textLength = Yjs.getText(targetNodeId).toString().length;

            yield* Buffer.setSelection(
              bufferId,
              Option.some({
                anchor: { nodeId: targetNodeId },
                anchorOffset: textLength,
                focus: { nodeId: targetNodeId },
                focusOffset: textLength,
                goalX: null,
                goalLine: null,
                assoc: 0,
              }),
            );

            yield* Buffer.setBlockSelection(bufferId, [], targetNodeId);

            const blockId = Id.makeBlockId(bufferId, targetNodeId);
            yield* Window.setActiveElement(
              Option.some({ type: "block" as const, id: blockId }),
            );
          }),
        );

        e.preventDefault();
      }

      const modPressed = isMac ? e.metaKey : e.ctrlKey;

      if (
        (e.key === "Delete" || e.key === "Backspace") &&
        isBlockSelectionMode()
      ) {
        e.preventDefault();

        // Force-delete with Cmd+Shift (Mac) / Ctrl+Shift (Win/Linux) includes descendants
        const isForceDelete = e.shiftKey && modPressed;

        runtime.runPromise(
          Effect.gen(function* () {
            const Buffer = yield* BufferT;
            const Window = yield* WindowT;
            const Node = yield* NodeT;
            const Yjs = yield* YjsT;

            const bufferDoc = yield* getBufferDoc;
            if (!bufferDoc) return;

            const { selectedBlocks } = bufferDoc;
            if (selectedBlocks.length === 0) return;

            // Collect ALL nodes to delete (including descendants for force-delete)
            let allNodesToDelete: Id.Node[];

            if (isForceDelete) {
              // Force-delete: include all descendants
              allNodesToDelete = [];
              for (const blockId of selectedBlocks) {
                allNodesToDelete.push(blockId);
                const descendants = yield* Node.getAllDescendants(blockId);
                allNodesToDelete.push(...descendants);
              }
            } else {
              // Regular delete: only selected blocks
              allNodesToDelete = [...selectedBlocks];
            }

            // Determine focus after deletion - works for nested blocks too
            const firstSelectedBlock = selectedBlocks[0]!;

            // Get the parent and siblings of the deleted block
            const parentId = yield* Node.getParent(firstSelectedBlock).pipe(
              Effect.catchTag("NodeHasNoParentError", () =>
                Effect.succeed(null),
              ),
            );

            let focusAfterDelete: Id.Node | null = null;

            if (parentId) {
              const siblings = yield* Node.getNodeChildren(parentId);
              const remainingSiblings = siblings.filter(
                (id) => !selectedBlocks.includes(id),
              );

              // Find first selected block's index among siblings
              const firstSelectedIndex = siblings.findIndex((id) =>
                selectedBlocks.includes(id),
              );

              if (remainingSiblings.length > 0) {
                // Prefer sibling before selection, otherwise first remaining sibling
                const siblingBefore = siblings[firstSelectedIndex - 1];
                if (
                  firstSelectedIndex > 0 &&
                  siblingBefore &&
                  !selectedBlocks.includes(siblingBefore)
                ) {
                  focusAfterDelete = siblingBefore;
                } else {
                  focusAfterDelete = remainingSiblings[0]!;
                }
              } else {
                // No siblings remain, focus on parent
                focusAfterDelete = parentId;
              }
            }

            // Delete all selected nodes
            for (const nodeId of selectedBlocks) {
              yield* Node.deleteNode(nodeId);
            }

            // Clean up Yjs text for ALL deleted nodes (fixes previous bug)
            for (const deletedId of allNodesToDelete) {
              Yjs.deleteText(deletedId);
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

      if (e.key === "c" && modPressed && isBlockSelectionMode()) {
        e.preventDefault();
        runtime.runPromise(
          Effect.gen(function* () {
            const Yjs = yield* YjsT;

            const bufferDoc = yield* getBufferDoc;
            if (!bufferDoc) return;

            const { selectedBlocks } = bufferDoc;
            if (selectedBlocks.length === 0) return;

            // selectedBlocks is already in document order (maintained by selection extension logic)
            const texts = selectedBlocks.map((nodeId) =>
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

            // selectedBlocks is already in document order (maintained by selection extension logic)
            const texts = selectedBlocks.map((nodeId) =>
              Yjs.getText(nodeId).toString(),
            );

            yield* Effect.promise(() =>
              navigator.clipboard.writeText(texts.join("\n\n")),
            );

            // Determine focus after deletion - works for nested blocks too
            const firstSelectedBlock = selectedBlocks[0]!;

            const parentId = yield* Node.getParent(firstSelectedBlock).pipe(
              Effect.catchTag("NodeHasNoParentError", () =>
                Effect.succeed(null),
              ),
            );

            let focusAfterDelete: Id.Node | null = null;

            if (parentId) {
              const siblings = yield* Node.getNodeChildren(parentId);
              const remainingSiblings = siblings.filter(
                (id) => !selectedBlocks.includes(id),
              );

              const firstSelectedIndex = siblings.findIndex((id) =>
                selectedBlocks.includes(id),
              );

              if (remainingSiblings.length > 0) {
                const siblingBefore = siblings[firstSelectedIndex - 1];
                if (
                  firstSelectedIndex > 0 &&
                  siblingBefore &&
                  !selectedBlocks.includes(siblingBefore)
                ) {
                  focusAfterDelete = siblingBefore;
                } else {
                  focusAfterDelete = remainingSiblings[0]!;
                }
              } else {
                focusAfterDelete = parentId;
              }
            }

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

      if (e.key === "a" && modPressed && isBlockSelectionMode()) {
        e.preventDefault();
        runtime.runPromise(
          Effect.gen(function* () {
            const Buffer = yield* BufferT;

            const childNodeIds = getChildNodeIds();
            if (childNodeIds.length === 0) return;

            const anchor = childNodeIds[0]!;
            const focus = childNodeIds[childNodeIds.length - 1]!;

            yield* Buffer.setBlockSelection(
              bufferId,
              childNodeIds,
              anchor,
              focus,
            );
          }),
        );
      }

      // Prevent browser default scroll for arrow keys in all cases
      if (e.key === "ArrowUp" || e.key === "ArrowDown") {
        e.preventDefault();
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
              <TypeList nodeId={nodeId} />
            </header>
            <ViewTabs
              bufferId={bufferId}
              nodeId={nodeId}
              activeViewId={store.activeViewId}
            />
            <Show
              when={store.activeViewId}
              fallback={
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
              }
            >
              <div data-testid="editor-body" class="flex-1 flex flex-col pt-4">
                <TableView
                  bufferId={bufferId}
                  nodeId={nodeId}
                  childNodeIds={getChildNodeIds()}
                />
              </div>
            </Show>
          </>
        )}
      </Show>
    </div>
  );
}
