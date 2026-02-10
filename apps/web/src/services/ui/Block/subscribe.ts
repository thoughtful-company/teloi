import { tables, TeloiNode } from "@/livestore/schema";
import { Id, System } from "@/schema";
import { NodeNotFoundError } from "@/services/domain/errors";
import { NodeT } from "@/services/domain/Node";
import { TupleT } from "@/services/domain/Tuple";
import { TypeT } from "@/services/domain/Type";
import { AutomergeT } from "@/services/external/Automerge";
import { StoreT } from "@/services/external/Store";
import { PickerState, PickerT } from "@/services/ui/Picker";
import { isSystemType } from "@/services/ui/TypePicker";
import {
  resolveActiveViewType,
  subscribeViewInfo,
  type ViewInfo,
  type ViewType,
} from "./views";
import { deepEqual, queryDb } from "@livestore/livestore";
import { Effect, Either, Option, Stream } from "effect";
import { BlockGoneError, VirtualBlockError } from "./errors";

export interface BlockSelection {
  anchor: number;
  head: number;
  goalX: number | null;
  goalLine: "first" | "last" | null;
  assoc: -1 | 0 | 1;
}

export interface BlockView {
  nodeData: TeloiNode;
  isActive: boolean;
  isSelected: boolean;
  isExpanded: boolean;
  selection: BlockSelection | null;

  activeViewId: Id.Node | null;
  activeViewType: ViewType;
  availableViews: readonly ViewInfo[];

  activeTypes: readonly Id.Node[];
  userTypes: readonly Id.Node[];
  textContent: string;
  picker: PickerState | null;
  childCount: number;
  ghostChildId: Id.Node | null;
  ghostParentId: Id.Node | null;
}

export const subscribe = (blockId: Id.Block) =>
  Effect.gen(function* () {
    const ctx = yield* Id.parseBlockContext(blockId);
    const Node = yield* NodeT;
    const Tuple = yield* TupleT;
    const Type = yield* TypeT;
    const Picker = yield* PickerT;
    const Automerge = yield* AutomergeT;

    // Extract nodeId based on block type
    let nodeId: Id.Node;

    if (ctx.type === "frame") {
      nodeId = ctx.nodeId;
    } else {
      // Section block: derive nodeId from tuple lookup

      // Virtual blocks cannot be subscribed to
      if (ctx.tupleId === Id.VIRTUAL_TUPLE) {
        return yield* Effect.fail(new VirtualBlockError({ blockId }));
      }

      const maybeTuple = yield* Tuple.get(ctx.tupleId);
      if (Option.isNone(maybeTuple)) {
        return yield* Effect.fail(
          new BlockGoneError({ blockId, nodeId: Id.Node.make(ctx.tupleId) }),
        );
      }
      const tuple = maybeTuple.value;

      // Get display position from property config
      const configTuples = yield* Tuple.findByPosition(
        System.PROPERTY_CONFIG,
        0,
        ctx.propertyId,
      );

      let displayPosition: 0 | 1 = 1;
      if (configTuples.length > 0) {
        const config = configTuples[0]!;
        displayPosition = config.members[2] === System.POSITION_0 ? 0 : 1;
      }

      nodeId = tuple.members[displayPosition] as Id.Node;
    }

    // Ghost blocks have no LiveStore node yet — skip existence check
    const Store = yield* StoreT;
    const initialDoc = yield* Store.getDocument("block", blockId);
    const isGhost =
      Option.isSome(initialDoc) && !!initialDoc.value.ghostParentId;
    if (!isGhost) {
      yield* Node.attestExistence(nodeId);
    }

    // Resolve windowId once for selection/isSelected streams
    const sessionId = yield* Store.getSessionId();
    const windowId = Id.Window.make(sessionId);
    const frameId = ctx.frameId;

    const block$ = yield* makeBlockStreamEither(blockId);
    const node$ = yield* makeNodeStreamEither(nodeId);
    const window$ = yield* makeWindowDerivedStream(
      windowId,
      frameId,
      nodeId,
      blockId,
    );

    const viewInfo$ = yield* subscribeViewInfo(nodeId);

    const typesStream = yield* Type.subscribeTypes(nodeId);

    // Prepend current state since ref.changes might not emit initial value immediately
    const initialPickerState = yield* Picker.getState();
    const pickerStream = yield* Picker.subscribe();
    const filteredPickerStream = Stream.concat(
      Stream.make(initialPickerState),
      pickerStream,
    ).pipe(
      Stream.map((state) => (state?.elementId === blockId ? state : null)),
    );

    const textStream = yield* Automerge.subscribeText(nodeId);
    const textContentStream = textStream.pipe(
      Stream.map((textData) => textData.content),
    );

    const childrenStream = yield* Node.subscribeChildren(nodeId);
    const childCountStream = childrenStream.pipe(
      Stream.map((children) => children.length),
      Stream.changesWith((a, b) => a === b),
    );

    const view$ = Stream.zipLatestAll(
      block$,
      node$,
      viewInfo$,
      window$,
      typesStream,
      filteredPickerStream,
      textContentStream,
      childCountStream,
    ).pipe(
      Stream.map(
        ([
          blockEither,
          nodeEither,
          availableViews,
          { isActive, isSelected, goalX, goalLine },
          activeTypes,
          picker,
          textContent,
          childCount,
        ]) => {
          const block = Either.getOrThrow(blockEither);

          // Ghost blocks may not have a LiveStore node yet
          let nodeData: TeloiNode;
          if (Either.isLeft(nodeEither)) {
            if (block.ghostParentId) {
              nodeData = { id: nodeId, createdAt: 0, modifiedAt: 0 };
            } else {
              return Either.left(new BlockGoneError({ blockId, nodeId }));
            }
          } else {
            nodeData = Either.getOrThrow(nodeEither);
          }

          const activeViewId = block.activeViewId;
          const activeViewType = resolveActiveViewType(
            activeViewId,
            availableViews,
          );
          const selection =
            block.selection != null
              ? {
                  anchor: block.selection.anchor,
                  head: block.selection.head,
                  goalX,
                  goalLine,
                  assoc: block.selection.assoc,
                }
              : null;

          return Either.right({
            nodeData,
            isActive,
            isSelected,
            isExpanded: block.isExpanded,
            selection,
            activeViewId,
            activeViewType,
            availableViews,
            activeTypes,
            userTypes: activeTypes.filter((t) => !isSystemType(t)),
            textContent,
            picker,
            childCount,
            ghostChildId: block.ghostChildId ?? null,
            ghostParentId: block.ghostParentId ?? null,
          } satisfies BlockView);
        },
      ),
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

type BlockDoc = {
  isExpanded: boolean;
  activeViewId: Id.Node | null;
  ghostChildId: Id.Node | null;
  ghostParentId: Id.Node | null;
  selection?: {
    anchor: number;
    head: number;
    assoc: -1 | 0 | 1;
  } | null | undefined;
};

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
      // Don't fail on missing block doc - use default value (expanded)
      // Block docs are created lazily, so the first emission might be null
      Stream.map(
        (b): Either.Either<BlockDoc, never> =>
          Either.right(
              b ?? {
                isExpanded: true,
                activeViewId: null,
                ghostChildId: null,
                ghostParentId: null,
                selection: null,
              },
          ),
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
                nodeId: n.id,
                modifiedAt: n.modifiedAt,
              }),
            ),
        }),
      ),
    );
  });

interface WindowDerived {
  isActive: boolean;
  isSelected: boolean;
  goalX: number | null;
  goalLine: "first" | "last" | null;
}

const makeWindowDerivedStream = (
  windowId: Id.Window,
  frameId: Id.Frame,
  nodeId: Id.Node,
  blockId: Id.Block,
) =>
  Effect.gen(function* () {
    const Store = yield* StoreT;
    const query = queryDb(
      tables.window
        .select("value")
        .where("id", "=", windowId)
        .first({ fallback: () => null }),
    );
    const windowStream = yield* Store.subscribeStream(query).pipe(Effect.orDie);
    const frameQuery = queryDb(
      tables.frame
        .select("value")
        .where("id", "=", frameId)
        .first({ fallback: () => null }),
    );
    const frameStream = yield* Store.subscribeStream(frameQuery).pipe(
      Effect.orDie,
    );

    return Stream.zipLatestWith(
      windowStream,
      frameStream,
      (window, frame): WindowDerived => {
        const isStageActiveFrame =
          (window?.activeRegion ?? "stage") === "stage" &&
          window?.activeFrameId === frameId;
        const isActive = isStageActiveFrame && frame?.activeBlockId === blockId;

        const selectedBlocks = frame?.selectedBlocks ?? [];
        const isSelected = selectedBlocks.includes(nodeId);

        const goalX = frame?.goalX ?? null;
        const goalLine = frame?.goalLine ?? null;

        return { isActive, isSelected, goalX, goalLine };
      },
    ).pipe(
      Stream.changesWith(deepEqual),
      Stream.tap(({ isActive }) =>
        Effect.logDebug("[Block.Subscribe] Window-derived stream emitted").pipe(
          Effect.annotateLogs({
            blockId,
            isActive,
          }),
        ),
      ),
    );
  });
