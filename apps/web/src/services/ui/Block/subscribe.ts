import { tables, TeloiNode } from "@/livestore/schema";
import { Id } from "@/schema";
import { NodeNotFoundError } from "@/services/domain/errors";
import { NodeT } from "@/services/domain/Node";
import { StoreT } from "@/services/external/Store";
import { WindowT } from "@/services/ui/Window";
import { deepEqual, queryDb } from "@livestore/livestore";
import { Effect, Either, Option, Stream } from "effect";
import { attestExistence } from "./attestExistence";
import { BlockGoneError, BlockNotFoundError } from "./errors";

export interface BlockView {
  nodeData: TeloiNode;
  childBlockIds: readonly Id.Block[];
  isActive: boolean;
  isSelected: boolean;
  isToggled: boolean;
}

export const subscribe = (blockId: Id.Block) =>
  Effect.gen(function* () {
    const [bufferId, nodeId] = yield* Id.parseBlockId(blockId);
    const Node = yield* NodeT;
    const Window = yield* WindowT;

    yield* attestExistence(blockId);
    yield* Node.attestExistence(nodeId);

    const block$ = yield* makeBlockStreamEither(blockId);
    const childrenBlockIds$ = yield* makeChildrenIdsStream(bufferId, nodeId);
    const node$ = yield* makeNodeStreamEither(nodeId);

    const activeElementStream = yield* Window.subscribeActiveElement();
    const isActiveStream = activeElementStream.pipe(
      Stream.map((maybeActiveElement) =>
        Option.match(maybeActiveElement, {
          onNone: () => false,
          onSome: (activeElement) =>
            activeElement.type === "block" && activeElement.id === blockId,
        }),
      ),
      Stream.changesWith((a, b) => a === b),
      Stream.tap((isActive) =>
        Effect.logTrace("[Block.Subscribe] Is active updated").pipe(
          Effect.annotateLogs("isActive", isActive),
          Effect.annotateLogs("blockId", blockId),
        ),
      ),
    );

    const view$ = Stream.zipLatestAll(
      block$,
      childrenBlockIds$,
      node$,
      isActiveStream,
    ).pipe(
      Stream.map(([blockEither, blockChildrenIds, nodeEither, isActive]) => {
        if (Either.isLeft(blockEither)) {
          return Either.left(new BlockGoneError({ blockId, nodeId }));
        }
        if (Either.isLeft(nodeEither)) {
          return Either.left(new BlockGoneError({ blockId, nodeId }));
        }

        const block = Either.getOrThrow(blockEither);
        const nodeData = Either.getOrThrow(nodeEither);

        return Either.right({
          ...block,
          isActive,
          childBlockIds: blockChildrenIds,
          nodeData,
        } satisfies BlockView);
      }),
      Stream.tap((either) =>
        Either.match(either, {
          onLeft: (error) =>
            Effect.logError("[Block.Subscribe] Stream error").pipe(
              Effect.annotateLogs({ error: error._tag, blockId }),
            ),
          onRight: () => Effect.void,
        }),
      ),

      Stream.mapEffect((either) =>
        Either.match(either, {
          onLeft: (error) => Effect.fail(error),
          onRight: (value) => Effect.succeed(value),
        }),
      ),
    );

    return view$;
  });

// ===============================
//   Internal Functions
// ===============================

type BlockDoc = { isSelected: boolean; isToggled: boolean };

const makeBlockStreamEither = (blockId: Id.Block) =>
  Effect.gen(function* () {
    const Store = yield* StoreT;
    const query = queryDb(
      tables.block
        .select("value")
        .where("id", "=", blockId)
        .first({ fallback: () => null }),
    );
    const stream = yield* Store.subscribeStream(query).pipe(Effect.orDie);

    return stream.pipe(
      Stream.changesWith(deepEqual),
      Stream.tap((b) =>
        Effect.logTrace("[Block.Subscribe] Block value emitted").pipe(
          Effect.annotateLogs({ blockId, ...(b || {}) }),
        ),
      ),
      Stream.map(
        (b): Either.Either<BlockDoc, BlockNotFoundError> =>
          b != null
            ? Either.right(b)
            : Either.left(new BlockNotFoundError({ blockId })),
      ),
    );
  });

const makeNodeStreamEither = (nodeId: Id.Node) =>
  Effect.gen(function* () {
    const Node = yield* NodeT;
    const stream = yield* Node.subscribeEither(nodeId);

    return stream.pipe(
      Stream.changesWith<Either.Either<TeloiNode, NodeNotFoundError>>(
        deepEqual,
      ),
      Stream.tap((either) =>
        Either.match(either, {
          onLeft: () => Effect.void,
          onRight: (n) =>
            Effect.logTrace("[Block.Subscribe] Node value emitted").pipe(
              Effect.annotateLogs({
                nodeText: n.textContent,
                modifiedAt: n.modifiedAt,
              }),
            ),
        }),
      ),
    );
  });

const makeChildrenIdsStream = (bufferId: Id.Buffer, nodeId: Id.Node) =>
  Effect.gen(function* () {
    const Node = yield* NodeT;
    const stream = yield* Node.subscribeChildren(nodeId);

    return stream.pipe(
      Stream.map((nodeIds) =>
        nodeIds.map((id) => Id.makeBlockId(bufferId, Id.Node.make(id))),
      ),
    );
  });
