import { Context, Effect, Layer, Option, Stream } from "effect";
import { LiveStoreError, StoreT } from "../../external/Store";

import { Id, Model } from "@/schema";
import { NodeNotFoundError } from "@/services/domain/errors";
import { TupleT } from "@/services/domain/Tuple";
import { TypeT } from "@/services/domain/Type";
import { AutomergeT } from "@/services/external/Automerge";
import { withContext } from "@/utils";
import { NodeT } from "../../domain/Node";
import { WindowT } from "../Window";
import { FrameNodeNotAssignedError, FrameNotFoundError } from "../errors";
import { get } from "./get";
import { setAssignedNodeId } from "./setAssignedNodeId";
import { setBlockSelection } from "./setBlockSelection";
import { setSelection } from "./setSelection";
import { FrameView, subscribe } from "./subscribe";

/**
 * Editor interaction mode - derived from Window.activeElement.
 *
 * - "none": No element focused
 * - "block": A block is focused for text editing
 * - "blockSelection": A frame has block selection mode active
 */
export type EditorMode =
  | { type: "none" }
  | { type: "block"; blockId: Id.Block }
  | { type: "blockSelection"; frameId: Id.Frame };

export class FrameT extends Context.Tag("FrameT")<
  FrameT,
  {
    subscribe: (
      frameId: Id.Frame,
    ) => Effect.Effect<
      Stream.Stream<FrameView, NodeNotFoundError>,
      | FrameNotFoundError
      | LiveStoreError
      | FrameNodeNotAssignedError
      | NodeNotFoundError
    >;
    getSelection: (
      frameId: Id.Frame,
    ) => Effect.Effect<Option.Option<Model.FrameSelection>, FrameNotFoundError>;
    getAssignedNodeId: (
      frameId: Id.Frame,
    ) => Effect.Effect<Id.Node | null, FrameNotFoundError>;
    setSelection: (
      frameId: Id.Frame,
      selection: Option.Option<Model.FrameSelection>,
    ) => Effect.Effect<void, FrameNotFoundError>;
    setAssignedNodeId: (
      frameId: Id.Frame,
      nodeId: Id.Node | null,
    ) => Effect.Effect<void, FrameNotFoundError>;
    setBlockSelection: (
      frameId: Id.Frame,
      blocks: readonly Id.Node[],
      blockSelectionAnchor: Id.Node | null,
      blockSelectionFocus?: Id.Node | null,
    ) => Effect.Effect<void, FrameNotFoundError>;

    /**
     * Get block selection state for a frame.
     */
    getBlockSelectionState: (frameId: Id.Frame) => Effect.Effect<
      {
        selectedBlocks: readonly Id.Node[];
        anchor: Id.Node | null;
        focus: Id.Node | null;
      },
      FrameNotFoundError
    >;

    // Mode operations (derived from Window.activeElement)
    /**
     * Get current editor mode - derived from Window.activeElement.
     */
    getMode: () => Effect.Effect<EditorMode>;
    /**
     * Enter block selection mode for a frame.
     */
    enterBlockSelection: (frameId: Id.Frame) => Effect.Effect<void>;
    /**
     * Enter block editing mode for a specific block.
     */
    enterBlockEditing: (blockId: Id.Block) => Effect.Effect<void>;
    /**
     * Clear focus (mode becomes "none").
     */
    clearFocus: () => Effect.Effect<void>;

    // Popup operations
    hasPopup: (frameId: Id.Frame) => Effect.Effect<boolean, FrameNotFoundError>;
    openPopup: (
      frameId: Id.Frame,
      popup: Model.FramePopup,
    ) => Effect.Effect<void, FrameNotFoundError>;
    closePopup: (frameId: Id.Frame) => Effect.Effect<void, FrameNotFoundError>;
    updatePopupQuery: (
      frameId: Id.Frame,
      query: string,
    ) => Effect.Effect<void, FrameNotFoundError>;
    setActiveView: (
      frameId: Id.Frame,
      viewId: Id.Node | null,
    ) => Effect.Effect<void, FrameNotFoundError>;
  }
>() {}

export const FrameLive = Layer.effect(
  FrameT,
  Effect.gen(function* () {
    const Store = yield* StoreT;
    const Node = yield* NodeT;
    const Tuple = yield* TupleT;
    const Type = yield* TypeT;
    const Automerge = yield* AutomergeT;
    const Window = yield* WindowT;

    const context = Context.make(StoreT, Store).pipe(
      Context.add(NodeT, Node),
      Context.add(TupleT, Tuple),
      Context.add(TypeT, Type),
      Context.add(AutomergeT, Automerge),
      Context.add(WindowT, Window),
    );

    return {
      subscribe: withContext(subscribe)(context),
      getSelection: (_frameId: Id.Frame) =>
        Effect.gen(function* () {
          const sessionId = yield* Store.getSessionId();
          const windowId = Id.Window.make(sessionId);
          const windowDoc = yield* Store.getDocument("window", windowId).pipe(
            Effect.orDie,
          );
          if (Option.isNone(windowDoc))
            return Option.none<Model.FrameSelection>();
          return Option.fromNullable(windowDoc.value.selection);
        }),
      getAssignedNodeId: (frameId: Id.Frame) =>
        get(frameId, "assignedNodeId").pipe(
          Effect.map((id) => (id != null ? Id.Node.make(id) : null)),
          Effect.provideService(StoreT, Store),
        ),
      setSelection: withContext(setSelection)(context),
      setAssignedNodeId: (frameId: Id.Frame, nodeId: Id.Node | null) =>
        setAssignedNodeId(frameId, nodeId).pipe(
          Effect.provideService(StoreT, Store),
        ),
      setBlockSelection: (
        frameId: Id.Frame,
        blocks: readonly Id.Node[],
        blockSelectionAnchor: Id.Node | null,
        blockSelectionFocus?: Id.Node | null,
      ) =>
        setBlockSelection(
          frameId,
          blocks,
          blockSelectionAnchor,
          blockSelectionFocus,
        ).pipe(Effect.provide(context)),

      getBlockSelectionState: (_frameId: Id.Frame) =>
        Effect.gen(function* () {
          const sessionId = yield* Store.getSessionId();
          const windowId = Id.Window.make(sessionId);
          const windowDoc = yield* Store.getDocument("window", windowId).pipe(
            Effect.orDie,
          );
          if (Option.isNone(windowDoc)) {
            return {
              selectedBlocks: [] as readonly Id.Node[],
              anchor: null,
              focus: null,
            };
          }
          return {
            selectedBlocks: windowDoc.value.selectedBlocks,
            anchor: windowDoc.value.blockSelectionAnchor,
            focus: windowDoc.value.blockSelectionFocus,
          };
        }),

      // Mode operations
      getMode: (): Effect.Effect<EditorMode> =>
        Effect.gen(function* () {
          const activeElement = yield* Window.getActiveElement();
          return Option.match(activeElement, {
            onNone: () => ({ type: "none" as const }),
            onSome: (el) => {
              switch (el.type) {
                case "frame":
                  return { type: "blockSelection" as const, frameId: el.id };
                default:
                  if (el.type === "block") {
                    return { type: "block" as const, blockId: el.id };
                  }
                  // Other element types (title, property, etc.) don't map to EditorMode
                  return { type: "none" as const };
              }
            },
          });
        }),
      enterBlockSelection: (frameId: Id.Frame): Effect.Effect<void> =>
        Window.setActiveElement(
          Option.some({ type: "frame" as const, id: frameId }),
        ),
      enterBlockEditing: (blockId: Id.Block): Effect.Effect<void> =>
        Window.setActiveElement(
          Option.some({ type: "block" as const, id: blockId }),
        ),
      clearFocus: (): Effect.Effect<void> =>
        Window.setActiveElement(Option.none()),

      // Popup operations
      hasPopup: (frameId: Id.Frame) =>
        get(frameId).pipe(
          Effect.map((frame) => frame.popup != null),
          Effect.provideService(StoreT, Store),
        ),
      openPopup: (frameId: Id.Frame, popup: Model.FramePopup) =>
        get(frameId).pipe(
          Effect.flatMap((frame) =>
            Store.setDocument("frame", { ...frame, popup }, frameId),
          ),
          Effect.asVoid,
          Effect.orDie,
          Effect.provideService(StoreT, Store),
        ),
      closePopup: (frameId: Id.Frame) =>
        get(frameId).pipe(
          Effect.flatMap((frame) =>
            Store.setDocument("frame", { ...frame, popup: null }, frameId),
          ),
          Effect.asVoid,
          Effect.orDie,
          Effect.provideService(StoreT, Store),
        ),
      updatePopupQuery: (frameId: Id.Frame, query: string) =>
        get(frameId).pipe(
          Effect.flatMap((frame) => {
            if (!frame.popup) return Effect.void;
            return Store.setDocument(
              "frame",
              { ...frame, popup: { ...frame.popup, query } },
              frameId,
            ).pipe(Effect.asVoid, Effect.orDie);
          }),
          Effect.provideService(StoreT, Store),
        ),
      setActiveView: (frameId: Id.Frame, viewId: Id.Node | null) =>
        get(frameId).pipe(
          Effect.flatMap((frame) =>
            Store.setDocument(
              "frame",
              { ...frame, activeViewId: viewId },
              frameId,
            ),
          ),
          Effect.asVoid,
          Effect.orDie,
          Effect.provideService(StoreT, Store),
        ),
    };
  }),
);
