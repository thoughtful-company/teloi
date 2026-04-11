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
import { KhoraGoneError, VirtualBlockError } from "./errors";

export interface KhoraTextSelection {
  anchor: number;
  head: number;
  goalX: number | null;
  goalLine: "first" | "last" | null;
  assoc: -1 | 0 | 1;
}

export interface KhoraView {
  nodeData: TeloiNode;
  isActive: boolean;
  isSelected: boolean;
  isExpanded: boolean;
  selection: KhoraTextSelection | null;

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

export const subscribe = (khoraId: Id.Khora) =>
  Effect.gen(function* () {
    const ctx = yield* Id.parseKhoraContext(khoraId);
    const Node = yield* NodeT;
    const Tuple = yield* TupleT;
    const Type = yield* TypeT;
    const Picker = yield* PickerT;
    const Automerge = yield* AutomergeT;

    // Property titles are leaf nodes under workspace:schema — no views, no
    // children, no picker. Short-circuit into a minimal pipeline and return
    // early so the rest of the builder doesn't subscribe streams that would
    // always be empty anyway.
    if (ctx.type === "propertyTitle") {
      return yield* subscribePropertyTitle(ctx, khoraId);
    }

    // Extract nodeId based on block type
    let nodeId: Id.Node;

    if (ctx.type === "frame") {
      nodeId = ctx.nodeId;
    } else {
      // Section block: derive nodeId from tuple lookup

      // Virtual blocks cannot be subscribed to
      if (ctx.tupleId === Id.VIRTUAL_TUPLE) {
        return yield* Effect.fail(new VirtualBlockError({ khoraId }));
      }

      const maybeTuple = yield* Tuple.get(ctx.tupleId);
      if (Option.isNone(maybeTuple)) {
        return yield* Effect.fail(
          new KhoraGoneError({ khoraId, nodeId: Id.Node.make(ctx.tupleId) }),
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
    const initialDoc = yield* Store.getDocument("khora", khoraId);
    const isGhost =
      Option.isSome(initialDoc) && !!initialDoc.value.ghostParentId;
    if (!isGhost) {
      yield* Node.attestExistence(nodeId);
    }

    // Resolve worldId once for selection/isSelected streams
    const sessionId = yield* Store.getSessionId();
    const worldId = Id.World.make(sessionId);
    const frameId = ctx.frameId;

    const block$ = yield* makeBlockStreamEither(khoraId);
    const node$ = yield* makeNodeStreamEither(nodeId);
    const window$ = yield* makeWindowDerivedStream(worldId, frameId, khoraId);

    const viewInfo$ = yield* subscribeViewInfo(nodeId);

    const typesStream = yield* Type.subscribeTypes(nodeId);

    // Prepend current state since ref.changes might not emit initial value immediately
    const initialPickerState = yield* Picker.getState();
    const pickerStream = yield* Picker.subscribe();
    const filteredPickerStream = Stream.concat(
      Stream.make(initialPickerState),
      pickerStream,
    ).pipe(
      Stream.map((state) => (state?.elementId === khoraId ? state : null)),
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
          { isActive, isSelected, selection },
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
              return Either.left(new KhoraGoneError({ khoraId, nodeId }));
            }
          } else {
            nodeData = Either.getOrThrow(nodeEither);
          }

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
            ghostChildId: block.ghostChildId ?? null,
            ghostParentId: block.ghostParentId ?? null,
          } satisfies KhoraView);
        },
      ),
      finalizeKhoraViewStream(khoraId),
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
};

const makeBlockStreamEither = (khoraId: Id.Khora) =>
  Effect.gen(function* () {
    const Store = yield* StoreT;
    const query = queryDb(
      tables.khora
        .select("value")
        .where("id", "=", khoraId)
        .first({ fallback: () => null }),
    );
    const stream = yield* Store.subscribeStream(query).pipe(Effect.orDie);

    return stream.pipe(
      Stream.changesWith(deepEqual),
      Stream.tap((b) =>
        Effect.logTrace("[Khora.Subscribe] Khora value emitted").pipe(
          Effect.annotateLogs({ khoraId, ...(b || {}) }),
        ),
      ),
      // Don't fail on missing block doc - use default value (expanded)
      // Khora docs are created lazily, so the first emission might be null
      Stream.map(
        (b): Either.Either<BlockDoc, never> =>
          Either.right(
            b ?? {
              isExpanded: true,
              activeViewId: null,
              ghostChildId: null,
              ghostParentId: null,
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
            Effect.logTrace("[Khora.Subscribe] Node value emitted").pipe(
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
  selection: KhoraTextSelection | null;
}

const makeWindowDerivedStream = (
  worldId: Id.World,
  frameId: Id.Frame,
  khoraId: Id.Khora,
) =>
  Effect.gen(function* () {
    const Store = yield* StoreT;
    const query = queryDb(
      tables.world
        .select("value")
        .where("id", "=", worldId)
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
    // Subscribe to this khora's doc for text selection
    const khoraQuery = queryDb(
      tables.khora
        .select("value")
        .where("id", "=", khoraId)
        .first({ fallback: () => null }),
    );
    const khoraStream = yield* Store.subscribeStream(khoraQuery).pipe(
      Effect.orDie,
    );

    return Stream.zipLatestAll(windowStream, frameStream, khoraStream).pipe(
      Stream.map(([window, frame, khoraDocs]): WindowDerived => {
        const isStageActiveFrame =
          (window?.activeRegion ?? "stage") === "stage" &&
          window?.activeFrameId === frameId;
        const isActive = isStageActiveFrame && frame?.activeKhoraId === khoraId;

        const selectedKhoras = frame?.selectedKhoras ?? [];
        const isSelected = selectedKhoras.includes(khoraId);

        const ts = khoraDocs?.textSelection;
        const selection: KhoraTextSelection | null =
          ts != null
            ? {
                anchor: ts.anchor,
                head: ts.head,
                goalX: ts.goalX,
                goalLine: ts.goalLine,
                assoc: ts.assoc,
              }
            : null;

        return { isActive, isSelected, selection };
      }),
      Stream.changesWith(deepEqual),
      Stream.tap(({ isActive }) =>
        Effect.logDebug("[Khora.Subscribe] World-derived stream emitted").pipe(
          Effect.annotateLogs({
            khoraId,
            isActive,
          }),
        ),
      ),
    );
  });

/**
 * Property-title subscription pipeline.
 *
 * Property titles are leaves that live under workspace:schema, so they skip
 * the view/picker/childCount subscriptions that frame khoras need. The backing
 * Automerge text is keyed on `ctx.propertyId`, not any hostNode — getting that
 * wrong would clamp/display against the host page's text.
 */
const subscribePropertyTitle = (
  ctx: Extract<Id.KhoraContext, { type: "propertyTitle" }>,
  khoraId: Id.Khora,
) =>
  Effect.gen(function* () {
    const Node = yield* NodeT;
    const Type = yield* TypeT;
    const Automerge = yield* AutomergeT;
    const Store = yield* StoreT;

    const nodeId = ctx.propertyId;

    yield* Node.attestExistence(nodeId);

    const sessionId = yield* Store.getSessionId();
    const worldId = Id.World.make(sessionId);

    const block$ = yield* makeBlockStreamEither(khoraId);
    const node$ = yield* makeNodeStreamEither(nodeId);
    const window$ = yield* makeWindowDerivedStream(
      worldId,
      ctx.frameId,
      khoraId,
    );
    const typesStream = yield* Type.subscribeTypes(nodeId);
    const textStream = yield* Automerge.subscribeText(nodeId);
    const textContentStream = textStream.pipe(
      Stream.map((textData) => textData.content),
    );

    return Stream.zipLatestAll(
      block$,
      node$,
      window$,
      typesStream,
      textContentStream,
    ).pipe(
      Stream.map(
        ([
          blockEither,
          nodeEither,
          { isActive, isSelected, selection },
          activeTypes,
          textContent,
        ]): Either.Either<KhoraView, KhoraGoneError> => {
          const block = Either.getOrThrow(blockEither);

          if (Either.isLeft(nodeEither)) {
            return Either.left(new KhoraGoneError({ khoraId, nodeId }));
          }
          const nodeData = Either.getOrThrow(nodeEither);

          return Either.right({
            nodeData,
            isActive,
            isSelected,
            isExpanded: block.isExpanded,
            selection,
            activeViewId: null,
            activeViewType: "page",
            availableViews: [],
            activeTypes,
            userTypes: activeTypes.filter((t) => !isSystemType(t)),
            textContent,
            picker: null,
            childCount: 0,
            ghostChildId: null,
            ghostParentId: null,
          } satisfies KhoraView);
        },
      ),
      finalizeKhoraViewStream(khoraId),
    );
  });

/**
 * Shared error-handling tail for both the main and propertyTitle pipelines:
 * logs KhoraGoneError on the left branch, then unwraps the Either into a
 * failing Effect so downstream consumers see a clean Stream<KhoraView, KhoraGoneError>.
 */
const finalizeKhoraViewStream =
  (khoraId: Id.Khora) =>
  <R>(
    stream: Stream.Stream<Either.Either<KhoraView, KhoraGoneError>, never, R>,
  ): Stream.Stream<KhoraView, KhoraGoneError, R> =>
    stream.pipe(
      Stream.tap((either) =>
        Either.match(either, {
          onLeft: (error) =>
            Effect.logError("[Khora.Subscribe] Stream error").pipe(
              Effect.annotateLogs({ error: error._tag, khoraId }),
            ),
          onRight: () => Effect.void,
        }),
      ),
      Stream.mapEffect((either) =>
        Either.match(either, {
          onLeft: Effect.fail,
          onRight: Effect.succeed,
        }),
      ),
    );
