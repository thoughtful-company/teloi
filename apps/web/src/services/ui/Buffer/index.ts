import { Context, Effect, Layer, Option, Stream } from "effect";
import { LiveStoreError, StoreT } from "../../external/Store";

import { Id, Model } from "@/schema";
import { NodeNotFoundError } from "@/services/domain/errors";
import { AutomergeT } from "@/services/external/Automerge";
import { withContext } from "@/utils";
import { NodeT } from "../../domain/Node";
import { WindowT } from "../Window";
import { BufferNodeNotAssignedError, BufferNotFoundError } from "../errors";
import { forceDelete, type MergeResult } from "./forceDelete";
import { get } from "./get";
import { setAssignedNodeId } from "./setAssignedNodeId";
import { setBlockSelection } from "./setBlockSelection";
import { setSelection } from "./setSelection";
import { BufferView, subscribe } from "./subscribe";
import { moveToFirst, moveToLast, swap } from "./swap";

export type { MergeResult };

/**
 * Editor interaction mode - derived from Window.activeElement.
 *
 * - "none": No element focused
 * - "block": A block is focused for text editing
 * - "blockSelection": A buffer has block selection mode active
 */
export type EditorMode =
  | { type: "none" }
  | { type: "block"; blockId: Id.Block }
  | { type: "blockSelection"; bufferId: Id.Buffer };

export class BufferT extends Context.Tag("BufferT")<
  BufferT,
  {
    subscribe: (
      bufferId: Id.Buffer,
    ) => Effect.Effect<
      Stream.Stream<BufferView, NodeNotFoundError>,
      | BufferNotFoundError
      | LiveStoreError
      | BufferNodeNotAssignedError
      | NodeNotFoundError
    >;
    getSelection: (
      bufferId: Id.Buffer,
    ) => Effect.Effect<
      Option.Option<Model.BufferSelection>,
      BufferNotFoundError
    >;
    getAssignedNodeId: (
      bufferId: Id.Buffer,
    ) => Effect.Effect<Id.Node | null, BufferNotFoundError>;
    setSelection: (
      bufferId: Id.Buffer,
      selection: Option.Option<Model.BufferSelection>,
    ) => Effect.Effect<void, BufferNotFoundError>;
    setAssignedNodeId: (
      bufferId: Id.Buffer,
      nodeId: Id.Node | null,
    ) => Effect.Effect<void, BufferNotFoundError>;
    setBlockSelection: (
      bufferId: Id.Buffer,
      blocks: readonly Id.Node[],
      blockSelectionAnchor: Id.Node | null,
      blockSelectionFocus?: Id.Node | null,
    ) => Effect.Effect<void, BufferNotFoundError>;

    /**
     * Get block selection state for a buffer.
     */
    getBlockSelectionState: (bufferId: Id.Buffer) => Effect.Effect<
      {
        selectedBlocks: readonly Id.Node[];
        anchor: Id.Node | null;
        focus: Id.Node | null;
      },
      BufferNotFoundError
    >;

    // Mode operations (derived from Window.activeElement)
    /**
     * Get current editor mode - derived from Window.activeElement.
     */
    getMode: () => Effect.Effect<EditorMode>;
    /**
     * Enter block selection mode for a buffer.
     */
    enterBlockSelection: (bufferId: Id.Buffer) => Effect.Effect<void>;
    /**
     * Enter block editing mode for a specific block.
     */
    enterBlockEditing: (blockId: Id.Block) => Effect.Effect<void>;
    /**
     * Clear focus (mode becomes "none").
     */
    clearFocus: () => Effect.Effect<void>;

    // Structural operations
    forceDelete: (
      bufferId: Id.Buffer,
      nodeId: Id.Node,
    ) => Effect.Effect<Option.Option<MergeResult>, never>;
    swap: (
      nodeId: Id.Node,
      direction: "up" | "down",
    ) => Effect.Effect<boolean, never>;
    moveToFirst: (nodeId: Id.Node) => Effect.Effect<boolean, never>;
    moveToLast: (nodeId: Id.Node) => Effect.Effect<boolean, never>;

    // Popup operations
    openPopup: (
      bufferId: Id.Buffer,
      popup: Model.BufferPopup,
    ) => Effect.Effect<void, BufferNotFoundError>;
    closePopup: (
      bufferId: Id.Buffer,
    ) => Effect.Effect<void, BufferNotFoundError>;
    updatePopupQuery: (
      bufferId: Id.Buffer,
      query: string,
    ) => Effect.Effect<void, BufferNotFoundError>;
  }
>() {}

export const BufferLive = Layer.effect(
  BufferT,
  Effect.gen(function* () {
    const Store = yield* StoreT;
    const Node = yield* NodeT;
    const Automerge = yield* AutomergeT;
    const Window = yield* WindowT;

    const context = Context.make(StoreT, Store).pipe(
      Context.add(NodeT, Node),
      Context.add(AutomergeT, Automerge),
      Context.add(WindowT, Window),
    );

    return {
      subscribe: withContext(subscribe)(context),
      getSelection: (bufferId: Id.Buffer) =>
        get(bufferId, "selection").pipe(
          Effect.map(Option.fromNullable),
          Effect.provideService(StoreT, Store),
        ),
      getAssignedNodeId: (bufferId: Id.Buffer) =>
        get(bufferId, "assignedNodeId").pipe(
          Effect.map((id) => (id != null ? Id.Node.make(id) : null)),
          Effect.provideService(StoreT, Store),
        ),
      setSelection: withContext(setSelection)(context),
      setAssignedNodeId: (bufferId: Id.Buffer, nodeId: Id.Node | null) =>
        setAssignedNodeId(bufferId, nodeId).pipe(
          Effect.provideService(StoreT, Store),
        ),
      setBlockSelection: (
        bufferId: Id.Buffer,
        blocks: readonly Id.Node[],
        blockSelectionAnchor: Id.Node | null,
        blockSelectionFocus?: Id.Node | null,
      ) =>
        setBlockSelection(
          bufferId,
          blocks,
          blockSelectionAnchor,
          blockSelectionFocus,
        ).pipe(Effect.provide(context)),

      getBlockSelectionState: (bufferId: Id.Buffer) =>
        get(bufferId).pipe(
          Effect.map((doc) => ({
            selectedBlocks: doc.selectedBlocks,
            anchor: doc.blockSelectionAnchor,
            focus: doc.blockSelectionFocus,
          })),
          Effect.provideService(StoreT, Store),
        ),

      // Mode operations
      getMode: (): Effect.Effect<EditorMode> =>
        Effect.gen(function* () {
          const activeElement = yield* Window.getActiveElement();
          return Option.match(activeElement, {
            onNone: () => ({ type: "none" as const }),
            onSome: (el) => {
              switch (el.type) {
                case "block":
                  return { type: "block" as const, blockId: el.id };
                case "buffer":
                  return { type: "blockSelection" as const, bufferId: el.id };
                default:
                  // Other element types (title, property, etc.) don't map to EditorMode
                  return { type: "none" as const };
              }
            },
          });
        }),
      enterBlockSelection: (bufferId: Id.Buffer): Effect.Effect<void> =>
        Window.setActiveElement(
          Option.some({ type: "buffer" as const, id: bufferId }),
        ),
      enterBlockEditing: (blockId: Id.Block): Effect.Effect<void> =>
        Window.setActiveElement(
          Option.some({ type: "block" as const, id: blockId }),
        ),
      clearFocus: (): Effect.Effect<void> =>
        Window.setActiveElement(Option.none()),

      // Structural operations
      forceDelete: (bufferId: Id.Buffer, nodeId: Id.Node) =>
        forceDelete(bufferId, nodeId).pipe(Effect.provide(context)),
      swap: (nodeId: Id.Node, direction: "up" | "down") =>
        swap(nodeId, direction).pipe(Effect.provideService(NodeT, Node)),
      moveToFirst: (nodeId: Id.Node) =>
        moveToFirst(nodeId).pipe(Effect.provideService(NodeT, Node)),
      moveToLast: (nodeId: Id.Node) =>
        moveToLast(nodeId).pipe(Effect.provideService(NodeT, Node)),

      // Popup operations
      openPopup: (bufferId: Id.Buffer, popup: Model.BufferPopup) =>
        get(bufferId).pipe(
          Effect.flatMap((buffer) =>
            Store.setDocument("buffer", { ...buffer, popup }, bufferId),
          ),
          Effect.asVoid,
          Effect.orDie,
          Effect.provideService(StoreT, Store),
        ),
      closePopup: (bufferId: Id.Buffer) =>
        get(bufferId).pipe(
          Effect.flatMap((buffer) =>
            Store.setDocument("buffer", { ...buffer, popup: null }, bufferId),
          ),
          Effect.asVoid,
          Effect.orDie,
          Effect.provideService(StoreT, Store),
        ),
      updatePopupQuery: (bufferId: Id.Buffer, query: string) =>
        get(bufferId).pipe(
          Effect.flatMap((buffer) => {
            if (!buffer.popup) return Effect.void;
            return Store.setDocument(
              "buffer",
              { ...buffer, popup: { ...buffer.popup, query } },
              bufferId,
            ).pipe(Effect.asVoid, Effect.orDie);
          }),
          Effect.provideService(StoreT, Store),
        ),
    };
  }),
);
