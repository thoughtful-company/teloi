import { Context, Effect, Layer, Option, Stream } from "effect";
import { LiveStoreError, StoreT } from "../../external/Store";

import { Id, Model } from "@/schema";
import { NodeNotFoundError } from "@/services/domain/errors";
import { YjsT } from "@/services/external/Yjs";
import { withContext } from "@/utils";
import { NodeT } from "../../domain/Node";
import { BufferNodeNotAssignedError, BufferNotFoundError } from "../errors";
import { forceDelete } from "./forceDelete";
import { get } from "./get";
import { indent } from "./indent";
import { mergeBackward, type MergeResult } from "./mergeBackward";
import { mergeForward } from "./mergeForward";
import { outdent } from "./outdent";
import { setAssignedNodeId } from "./setAssignedNodeId";
import { setBlockSelection } from "./setBlockSelection";
import { setSelection } from "./setSelection";
import { split, type SplitParams, type SplitResult } from "./split";
import { BufferView, subscribe } from "./subscribe";
import { moveToFirst, moveToLast, swap } from "./swap";

export type { MergeResult, SplitParams, SplitResult };

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

    // Structural operations
    indent: (
      nodeIds: readonly Id.Node[],
    ) => Effect.Effect<Option.Option<Id.Node>, never>;
    outdent: (
      bufferId: Id.Buffer,
      nodeIds: readonly Id.Node[],
    ) => Effect.Effect<boolean, never>;
    mergeBackward: (
      bufferId: Id.Buffer,
      nodeId: Id.Node,
    ) => Effect.Effect<Option.Option<MergeResult>, never>;
    mergeForward: (
      bufferId: Id.Buffer,
      nodeId: Id.Node,
    ) => Effect.Effect<Option.Option<{ cursorOffset: number }>, never>;
    forceDelete: (
      bufferId: Id.Buffer,
      nodeId: Id.Node,
    ) => Effect.Effect<Option.Option<MergeResult>, never>;
    split: (params: SplitParams) => Effect.Effect<SplitResult, never>;
    swap: (
      nodeId: Id.Node,
      direction: "up" | "down",
    ) => Effect.Effect<boolean, never>;
    moveToFirst: (nodeId: Id.Node) => Effect.Effect<boolean, never>;
    moveToLast: (nodeId: Id.Node) => Effect.Effect<boolean, never>;
  }
>() {}

export const BufferLive = Layer.effect(
  BufferT,
  Effect.gen(function* () {
    const Store = yield* StoreT;
    const Node = yield* NodeT;
    const Yjs = yield* YjsT;

    const context = Context.make(StoreT, Store).pipe(
      Context.add(NodeT, Node),
      Context.add(YjsT, Yjs),
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

      // Structural operations
      indent: (nodeIds: readonly Id.Node[]) =>
        indent(nodeIds).pipe(Effect.provideService(NodeT, Node)),
      outdent: (bufferId: Id.Buffer, nodeIds: readonly Id.Node[]) =>
        outdent(bufferId, nodeIds).pipe(Effect.provide(context)),
      mergeBackward: (bufferId: Id.Buffer, nodeId: Id.Node) =>
        mergeBackward(bufferId, nodeId).pipe(Effect.provide(context)),
      mergeForward: (bufferId: Id.Buffer, nodeId: Id.Node) =>
        mergeForward(bufferId, nodeId).pipe(Effect.provide(context)),
      forceDelete: (bufferId: Id.Buffer, nodeId: Id.Node) =>
        forceDelete(bufferId, nodeId).pipe(Effect.provide(context)),
      split: (params: SplitParams) =>
        split(params).pipe(Effect.provide(context)),
      swap: (nodeId: Id.Node, direction: "up" | "down") =>
        swap(nodeId, direction).pipe(Effect.provideService(NodeT, Node)),
      moveToFirst: (nodeId: Id.Node) =>
        moveToFirst(nodeId).pipe(Effect.provideService(NodeT, Node)),
      moveToLast: (nodeId: Id.Node) =>
        moveToLast(nodeId).pipe(Effect.provideService(NodeT, Node)),
    };
  }),
);
