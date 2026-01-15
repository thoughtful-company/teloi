import { useBrowserRuntime } from "@/context/useBrowserRuntime";
import { Id } from "@/schema";
import { NodeT } from "@/services/domain/Node";
import { StoreT } from "@/services/external/Store";
import { YjsT } from "@/services/external/Yjs";
import { BlockT } from "@/services/ui/Block";
import * as BlockType from "@/services/ui/BlockType";
import { BufferT } from "@/services/ui/Buffer";
import { WindowT } from "@/services/ui/Window";
import { bindStreamToStore } from "@/utils/bindStreamToStore";
import {
  getSpringScroller,
  SCROLL_MARGIN,
  scrollElementIntoView,
} from "@/utils/scroll";
import { Effect, Fiber, Option, Stream } from "effect";
import { createSignal, For, onCleanup, onMount, Show } from "solid-js";
import Block from "./Block";
import TableView from "./TableView";
import Title from "./Title";
import TypeList from "./TypeList";
import ViewTabs from "./ViewTabs";

const isMac = navigator.platform.toUpperCase().includes("MAC");

function scrollBlockIntoView(blockId: Id.Block) {
  requestAnimationFrame(() => {
    const el = document.querySelector<HTMLElement>(
      `[data-element-id="${blockId}"][data-element-type="block"]`,
    );
    if (!el) return;
    scrollElementIntoView(el, SCROLL_MARGIN);
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
      getSpringScroller(scrollContainer).scrollTo(0);
    }
  });
}

/**
 * Cross-parent movement for block selection mode.
 * Prioritize moving to parent's sibling, fallback to outdent.
 *
 * - "up": if parent has prev sibling → become last children of that sibling
 *         else → outdent (become siblings BEFORE parent)
 * - "down": if parent has next sibling → become first children of that sibling
 *           else → outdent (become siblings AFTER parent)
 *
 * Returns true if move succeeded, false if at buffer root.
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
      if (parentIndex > 0) {
        // Parent HAS prev sibling → cross-parent move (become last children)
        const prevParentSiblingId = parentSiblings[parentIndex - 1]!;
        // Insert in order - each "after" with no sibling appends at end
        for (const nodeId of nodeIds) {
          yield* Node.insertNode({
            nodeId,
            parentId: prevParentSiblingId,
            insert: "after", // append at end
          });
        }
      } else {
        // Parent has NO prev sibling → outdent (become siblings BEFORE parent)
        // Forward order - each "before parent" stacks correctly
        for (const nodeId of nodeIds) {
          yield* Node.insertNode({
            nodeId,
            parentId: grandparentId,
            insert: "before",
            siblingId: parentId,
          });
        }
      }
    } else {
      if (parentIndex < parentSiblings.length - 1) {
        // Parent HAS next sibling → cross-parent move (become first children)
        const nextParentSiblingId = parentSiblings[parentIndex + 1]!;
        const targetChildren = yield* Node.getNodeChildren(nextParentSiblingId);
        if (targetChildren.length > 0) {
          // Insert before first child, using moveNodes for proper ordering
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
      } else {
        // Parent has NO next sibling → outdent (become siblings AFTER parent)
        // Reverse order to maintain sequence
        for (let i = nodeIds.length - 1; i >= 0; i--) {
          yield* Node.insertNode({
            nodeId: nodeIds[i]!,
            parentId: grandparentId,
            insert: "after",
            siblingId: parentId,
          });
        }
      }
    }

    return true;
  }).pipe(Effect.catchAll(() => Effect.succeed(false)));

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

            // Scroll block into view when navigating in text editing mode
            if (
              Option.isSome(activeElement) &&
              activeElement.value.type === "block"
            ) {
              const [elBufferId] = yield* Id.parseBlockId(
                activeElement.value.id,
              );
              if (elBufferId === bufferId) {
                scrollBlockIntoView(activeElement.value.id);
              }
            }
          }),
        );
      }),
    );

    // Handle Escape key when in block selection mode
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't handle if event came from inside CodeMirror, EXCEPT for Mod+Up
      // (Mod+Up needs to work in both text editing and block selection modes)
      const target = e.target;
      const isModUp =
        e.key === "ArrowUp" &&
        !e.altKey &&
        !e.shiftKey &&
        (isMac ? e.metaKey : e.ctrlKey);
      if (
        target instanceof HTMLElement &&
        target.closest(".cm-editor") &&
        !isModUp
      ) {
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

            const {
              selectedBlocks,
              blockSelectionAnchor,
              blockSelectionFocus,
            } = bufferDoc;
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
              // Alt+Cmd+Arrow: Swap with adjacent (or outdent at boundary)
              // Can't outdent if parent is the buffer root
              const isAtBufferRoot = parentId === bufferDoc.assignedNodeId;

              if (e.key === "ArrowUp") {
                if (firstIndex === 0) {
                  // At first position - try outdent (unless at buffer root)
                  if (isAtBufferRoot) return;
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
                  // At last position - try outdent (unless at buffer root)
                  if (isAtBufferRoot) return;
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

      // Cmd+ArrowUp: Progressive collapse → navigate to parent → focus title
      // Works in BOTH text editing mode AND block selection mode
      if (
        e.key === "ArrowUp" &&
        !e.altKey &&
        !e.shiftKey &&
        (isMac ? e.metaKey : e.ctrlKey)
      ) {
        e.preventDefault();
        runtime.runPromise(
          Effect.gen(function* () {
            const Block = yield* BlockT;
            const Buffer = yield* BufferT;
            const Node = yield* NodeT;
            const Window = yield* WindowT;

            const bufferDoc = yield* getBufferDoc;
            const currentSelection = yield* Buffer.getSelection(bufferId);

            // Get current focused node: block selection takes priority over text selection
            const nodeId =
              bufferDoc?.selectedBlocks[0] ??
              Option.getOrNull(currentSelection)?.anchor.nodeId ??
              null;

            if (!nodeId) return;

            // Preserve goalX for cursor positioning when navigating in text editing mode
            const goalX = Option.getOrNull(currentSelection)?.goalX ?? null;

            const blockId = Id.makeBlockId(bufferId, nodeId);
            const children = yield* Node.getNodeChildren(nodeId);
            const isExpanded = yield* Block.isExpanded(blockId);

            // If block is expanded with children, collapse it and stay
            if (children.length > 0 && isExpanded) {
              yield* Block.setExpanded(blockId, false);
              return;
            }

            // Block is collapsed or childless → navigate to parent
            const parentId = yield* Node.getParent(nodeId).pipe(
              Effect.catchTag("NodeHasNoParentError", () =>
                Effect.succeed<Id.Node | null>(null),
              ),
            );

            if (!parentId) return;

            // At root level → focus title
            const assignedNodeId = yield* Buffer.getAssignedNodeId(bufferId);
            if (parentId === assignedNodeId) {
              yield* Buffer.setBlockSelection(bufferId, [], null, null);
              yield* Window.setActiveElement(
                Option.some({ type: "title" as const, bufferId }),
              );
              return;
            }

            // Navigate to parent AND collapse it
            const parentBlockId = Id.makeBlockId(bufferId, parentId);
            yield* Block.setExpanded(parentBlockId, false);

            if (isBlockSelectionMode()) {
              yield* Buffer.setBlockSelection(
                bufferId,
                [parentId],
                parentId,
                parentId,
              );
            } else {
              yield* Buffer.setSelection(
                bufferId,
                Option.some({
                  anchor: { nodeId: parentId },
                  focus: { nodeId: parentId },
                  anchorOffset: 0,
                  focusOffset: 0,
                  assoc: 0 as const,
                  goalX,
                  goalLine: "last",
                }),
              );
              yield* Window.setActiveElement(
                Option.some({ type: "block" as const, id: parentBlockId }),
              );
            }
          }),
        );
        return;
      }

      // Cmd+ArrowDown in block selection mode: expand selected blocks
      if (
        e.key === "ArrowDown" &&
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

            // Expand one level: if collapsed, expand; else expand first collapsed child
            const expandOneLevel = (nodeId: Id.Node): Effect.Effect<boolean> =>
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

            for (const nodeId of selectedBlocks) {
              yield* expandOneLevel(nodeId);
            }
          }),
        );
        return;
      }

      // Mod+Enter in block selection mode: toggle todo/checkbox state
      if (
        e.key === "Enter" &&
        (isMac ? e.metaKey : e.ctrlKey) &&
        isBlockSelectionMode()
      ) {
        e.preventDefault();
        runtime.runPromise(
          Effect.gen(function* () {
            const bufferDoc = yield* getBufferDoc;
            if (!bufferDoc) return;

            const { selectedBlocks } = bufferDoc;
            if (selectedBlocks.length === 0) return;

            for (const nodeId of selectedBlocks) {
              yield* BlockType.toggleCheckbox(nodeId);
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

            const currentFocus = blockSelectionFocus ?? blockSelectionAnchor;

            if (e.shiftKey) {
              // Shift+Arrow: sibling-only range extension (cross-parent deferred)
              const parentId = yield* Node.getParent(currentFocus);
              const siblings = yield* Node.getNodeChildren(parentId);
              const focusIndex = siblings.indexOf(currentFocus);
              const anchorIndex = siblings.indexOf(blockSelectionAnchor);

              // Anchor must be in same sibling group for range extension
              if (anchorIndex === -1) return;

              // Calculate new focus within siblings only
              const newFocusIndex =
                e.key === "ArrowUp"
                  ? Math.max(0, focusIndex - 1)
                  : Math.min(siblings.length - 1, focusIndex + 1);

              const newFocus = siblings[newFocusIndex];
              if (!newFocus) return;

              // Extend range from anchor to new focus
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
              // Plain Arrow: document-order navigation
              const Block = yield* BlockT;
              let newFocus: Id.Node | null = null;

              if (e.key === "ArrowUp") {
                const prevOpt = yield* Block.findPreviousNode(
                  currentFocus,
                  bufferId,
                );
                if (Option.isSome(prevOpt)) {
                  // Don't select buffer root (title)
                  if (prevOpt.value !== bufferDoc.assignedNodeId) {
                    newFocus = prevOpt.value;
                  }
                }
              } else {
                // ArrowDown
                const nextOpt = yield* Block.findNextNodeInDocumentOrder(
                  currentFocus,
                  bufferId,
                );
                if (Option.isSome(nextOpt)) {
                  newFocus = nextOpt.value;
                }
              }

              // Edge case: ArrowUp at first block - scroll to top, keep selection
              if (e.key === "ArrowUp" && newFocus === null) {
                scrollBufferToTop(bufferId);
                return;
              }

              // ArrowDown at last block - no movement possible
              if (newFocus === null) return;

              // Collapse to single block at new location
              yield* Buffer.setBlockSelection(
                bufferId,
                [newFocus],
                newFocus,
                newFocus,
              );
              scrollBlockIntoView(Id.makeBlockId(bufferId, newFocus));
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
                <div
                  data-testid="editor-body"
                  class="flex-1 flex flex-col pt-4"
                >
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
