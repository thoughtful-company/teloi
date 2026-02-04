import { tables, TeloiNode } from "@/livestore/schema";
import { Id, System } from "@/schema";
import * as IdT from "@/schema/id/id";
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
  ViewT,
  type ViewInfo,
  type ViewType,
} from "@/services/ui/View";
import { settleActiveElement, WindowT } from "@/services/ui/Window";
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
}

export const subscribe = (blockId: Id.Block) =>
  Effect.gen(function* () {
    const ctx = yield* Id.parseBlockContext(blockId);
    const Node = yield* NodeT;
    const Window = yield* WindowT;
    const Tuple = yield* TupleT;
    const Type = yield* TypeT;
    const Picker = yield* PickerT;
    const Automerge = yield* AutomergeT;
    const View = yield* ViewT;

    // Extract bufferId and nodeId based on block type
    let bufferId: Id.Buffer;
    let nodeId: Id.Node;

    if (ctx.type === "buffer") {
      bufferId = ctx.bufferId;
      nodeId = ctx.nodeId;
    } else {
      // Section block: derive nodeId from tuple lookup
      bufferId = ctx.bufferId;

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

    yield* Node.attestExistence(nodeId);

    const block$ = yield* makeBlockStreamEither(blockId);
    const node$ = yield* makeNodeStreamEither(nodeId);
    const selection$ = yield* makeSelectionStream(bufferId, nodeId, blockId);
    const isSelected$ = yield* makeIsSelectedStream(bufferId, nodeId);

    const viewInfo$ = yield* View.subscribeViewInfo(nodeId);

    const unsettledActiveElement = yield* Window.subscribeActiveElement();
    // Settle the stream: delay by 2 frames so selection state propagates first
    const activeElementStream = settleActiveElement(unsettledActiveElement);
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
        Effect.logDebug("[Block.Subscribe] isActive stream emitted").pipe(
          Effect.annotateLogs({ blockId, isActive }),
        ),
      ),
    );

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
      isActiveStream,
      selection$,
      isSelected$,
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
          isActive,
          selection,
          isSelected,
          activeTypes,
          picker,
          textContent,
          childCount,
        ]) => {
          // Block doc uses default if missing (created lazily)
          if (Either.isLeft(nodeEither)) {
            return Either.left(new BlockGoneError({ blockId, nodeId }));
          }

          const block = Either.getOrThrow(blockEither);
          const nodeData = Either.getOrThrow(nodeEither);

          const activeViewId = block.activeViewId;
          const activeViewType = resolveActiveViewType(
            activeViewId,
            availableViews,
          );

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

type BlockDoc = { isExpanded: boolean; activeViewId: Id.Node | null };

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
          Either.right(b ?? { isExpanded: false, activeViewId: null }),
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

/**
 * Extract display nodeId from a BlockContext.
 * For buffer blocks, returns the nodeId directly.
 * For section blocks, this would need tuple lookup, but for selection comparison
 * we compare blockIds directly instead.
 */
const getDisplayNodeIdFromContext = (ctx: Id.BlockContext): Id.Node | null => {
  if (ctx.type === "buffer") {
    return ctx.nodeId;
  }
  // Section blocks don't have nodeId directly - we can't derive it without
  // async tuple lookup, so selection comparison uses blockId instead
  return null;
};

const makeSelectionStream = (
  bufferId: Id.Buffer,
  nodeId: Id.Node,
  blockId: Id.Block,
) =>
  Effect.gen(function* () {
    const Store = yield* StoreT;
    const query = queryDb(
      tables.buffer
        .select("value")
        .where("id", "=", bufferId)
        .first({ fallback: () => null }),
    );
    const stream = yield* Store.subscribeStream(query).pipe(Effect.orDie);

    return stream.pipe(
      Stream.mapEffect((buffer): Effect.Effect<BlockSelection | null> => {
        if (!buffer?.selection) return Effect.succeed(null);

        const sel = buffer.selection;
        // Only return selection if both anchor and focus are on this block
        // Use blockId comparison for section blocks (since they don't have nodeId in context)
        return Effect.all({
          anchorContext: IdT.parseBlockContext(sel.anchor.elementId),
          focusContext: IdT.parseBlockContext(sel.focus.elementId),
        }).pipe(
          Effect.map(({ anchorContext, focusContext }) => {
            // For buffer blocks, compare nodeId directly
            // For section blocks, compare the full blockId
            const anchorNodeId = getDisplayNodeIdFromContext(anchorContext);
            const focusNodeId = getDisplayNodeIdFromContext(focusContext);

            // If we can extract nodeIds, compare them (buffer blocks)
            if (anchorNodeId !== null && focusNodeId !== null) {
              if (anchorNodeId !== nodeId || focusNodeId !== nodeId) {
                return null;
              }
            } else {
              // Section blocks: compare full block IDs
              if (
                sel.anchor.elementId !== blockId ||
                sel.focus.elementId !== blockId
              ) {
                return null;
              }
            }

            return {
              anchor: sel.anchorOffset,
              head: sel.focusOffset,
              goalX: sel.goalX ?? null,
              goalLine: sel.goalLine ?? null,
              assoc: sel.assoc,
            };
          }),
          Effect.orDie,
        );
      }),
      Stream.changesWith(deepEqual),
      Stream.tap((sel) =>
        Effect.logDebug("[Block.Subscribe] Selection stream emitted").pipe(
          Effect.annotateLogs({
            nodeId,
            selection: sel,
            isNull: sel === null,
          }),
        ),
      ),
    );
  });

const makeIsSelectedStream = (bufferId: Id.Buffer, nodeId: Id.Node) =>
  Effect.gen(function* () {
    const Store = yield* StoreT;
    const query = queryDb(
      tables.buffer
        .select("value")
        .where("id", "=", bufferId)
        .first({ fallback: () => null }),
    );
    const stream = yield* Store.subscribeStream(query).pipe(Effect.orDie);

    return stream.pipe(
      Stream.map((buffer): boolean => {
        if (!buffer?.selectedBlocks) return false;
        return buffer.selectedBlocks.includes(nodeId);
      }),
      Stream.changesWith((a, b) => a === b),
      Stream.tap((isSelected) =>
        Effect.logTrace("[Block.Subscribe] isSelected emitted").pipe(
          Effect.annotateLogs({ nodeId, isSelected }),
        ),
      ),
    );
  });
