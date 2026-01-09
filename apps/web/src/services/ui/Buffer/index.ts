import { Context, Effect, Layer, Option, Stream } from "effect";
import { LiveStoreError, StoreT } from "../../external/Store";

import { Id, Model } from "@/schema";
import { NodeNotFoundError } from "@/services/domain/errors";
import { withContext } from "@/utils";
import { NodeT } from "../../domain/Node";
import { BufferNodeNotAssignedError, BufferNotFoundError } from "../errors";
import { get } from "./get";
import { setAssignedNodeId } from "./setAssignedNodeId";
import { setBlockSelection } from "./setBlockSelection";
import { setSelection } from "./setSelection";
import { BufferView, subscribe } from "./subscribe";

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
      blockSelectionAnchor: Id.Node,
      blockSelectionFocus?: Id.Node | null,
    ) => Effect.Effect<void, BufferNotFoundError>;
  }
>() {}

export const BufferLive = Layer.effect(
  BufferT,
  Effect.gen(function* () {
    const Store = yield* StoreT;
    const Node = yield* NodeT;

    const context = Context.make(StoreT, Store).pipe(Context.add(NodeT, Node));

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
        blockSelectionAnchor: Id.Node,
        blockSelectionFocus?: Id.Node | null,
      ) =>
        setBlockSelection(
          bufferId,
          blocks,
          blockSelectionAnchor,
          blockSelectionFocus,
        ).pipe(Effect.provideService(StoreT, Store)),
    };
  }),
);
