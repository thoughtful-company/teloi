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
            const Window = yield* WindowT;
            const Buffer = yield* BufferT;
            const Store = yield* StoreT;

            // Get current blockSelectionAnchor to preserve it
            const bufferDoc = yield* Store.getDocument("buffer", bufferId).pipe(
              Effect.orDie,
            );
            const blockSelectionAnchor = Option.match(bufferDoc, {
              onNone: () => null,
              onSome: (buf) => buf.blockSelectionAnchor,
            });

            // Clear selection but preserve blockSelectionAnchor
            if (blockSelectionAnchor) {
              yield* Buffer.setBlockSelection(
                bufferId,
                [],
                blockSelectionAnchor,
              );
            }
            yield* Window.setActiveElement(Option.none());
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
            const Store = yield* StoreT;

            const bufferDoc = yield* Store.getDocument("buffer", bufferId).pipe(
              Effect.orDie,
            );
            if (Option.isNone(bufferDoc)) return;

            const { blockSelectionAnchor, blockSelectionFocus } =
              bufferDoc.value;
            if (!blockSelectionAnchor) return;

            // Get nodeIds from childBlockIds for index lookup
            const childNodeIds = store.childBlockIds.map((blockId) => {
              const [, nodeId] = Id.parseBlockId(blockId).pipe(Effect.runSync);
              return nodeId;
            });

            const currentFocus = blockSelectionFocus ?? blockSelectionAnchor;
            const focusIndex = childNodeIds.indexOf(currentFocus);

            if (focusIndex === -1) return;

            // Move focus up or down
            const newFocusIndex =
              e.key === "ArrowUp"
                ? Math.max(0, focusIndex - 1)
                : Math.min(childNodeIds.length - 1, focusIndex + 1);

            const newFocus = childNodeIds[newFocusIndex];
            if (!newFocus) return;

            const anchorIndex = childNodeIds.indexOf(blockSelectionAnchor);
            if (anchorIndex === -1) return;

            if (e.shiftKey) {
              // Shift+Arrow: extend/contract range from anchor to new focus
              const startIndex = Math.min(anchorIndex, newFocusIndex);
              const endIndex = Math.max(anchorIndex, newFocusIndex);
              const newSelection = childNodeIds.slice(startIndex, endIndex + 1);

              yield* Buffer.setBlockSelection(
                bufferId,
                newSelection,
                blockSelectionAnchor,
                newFocus,
              );
            } else {
              // Plain Arrow: collapse to single block
              const selectionStart = Math.min(anchorIndex, focusIndex);
              const selectionEnd = Math.max(anchorIndex, focusIndex);
              const isSingleSelection = selectionStart === selectionEnd;

              // For multi-selection, clamp to selection bounds
              // For single selection, allow moving outside
              const clampedFocusIndex = isSingleSelection
                ? newFocusIndex
                : Math.max(
                    selectionStart,
                    Math.min(selectionEnd, newFocusIndex),
                  );

              const clampedFocus = childNodeIds[clampedFocusIndex];
              if (!clampedFocus) return;

              yield* Buffer.setBlockSelection(
                bufferId,
                [clampedFocus],
                clampedFocus,
                clampedFocus,
              );
            }
          }),
        );
      }

      if (e.key === "Enter" && isBlockSelectionMode()) {
        e.preventDefault();
        runtime.runPromise(
          Effect.gen(function* () {
            const Buffer = yield* BufferT;
            const Window = yield* WindowT;
            const Store = yield* StoreT;
            const Yjs = yield* YjsT;

            const bufferDoc = yield* Store.getDocument("buffer", bufferId).pipe(
              Effect.orDie,
            );
            if (Option.isNone(bufferDoc)) return;

            const { blockSelectionAnchor, blockSelectionFocus } =
              bufferDoc.value;
            // Use focus (moving end) for Enter - that's what user is looking at
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
            const Store = yield* StoreT;
            const Node = yield* NodeT;

            const bufferDoc = yield* Store.getDocument("buffer", bufferId).pipe(
              Effect.orDie,
            );
            if (Option.isNone(bufferDoc)) return;

            const { selectedBlocks } = bufferDoc.value;
            if (selectedBlocks.length === 0) return;

            // Get current child node IDs to find where to focus after deletion
            const childNodeIds = store.childBlockIds.map((blockId) => {
              const [, nodeId] = Id.parseBlockId(blockId).pipe(Effect.runSync);
              return nodeId;
            });

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

      // Copy pattern matches KeyboardService's Mod detection (Cmd on Mac, Ctrl elsewhere)
      const isMac = navigator.platform.toUpperCase().includes("MAC");
      const modPressed = isMac ? e.metaKey : e.ctrlKey;

      if (e.key === "c" && modPressed && isBlockSelectionMode()) {
        e.preventDefault();
        runtime.runPromise(
          Effect.gen(function* () {
            const Store = yield* StoreT;
            const Yjs = yield* YjsT;

            const bufferDoc = yield* Store.getDocument("buffer", bufferId).pipe(
              Effect.orDie,
            );
            if (Option.isNone(bufferDoc)) return;

            const { selectedBlocks } = bufferDoc.value;
            if (selectedBlocks.length === 0) return;

            // Get text for each selected block in document order
            const childNodeIds = store.childBlockIds.map((blockId) => {
              const [, nodeId] = Id.parseBlockId(blockId).pipe(Effect.runSync);
              return nodeId;
            });

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
              <div class="mx-auto max-w-[var(--max-line-width)] w-full">
                <For each={store.childBlockIds}>
                  {(childId) => <Block blockId={childId} />}
                </For>
              </div>
              <div
                data-testid="editor-click-zone"
                class="flex-1 cursor-text"
                onClick={(e) => handleClickZone(e, nodeId)}
              />
            </div>
          </>
        )}
      </Show>
    </div>
  );
}
