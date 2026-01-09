import { tables } from "@/livestore/schema";
import { Id, System } from "@/schema";
import { NodeT } from "@/services/domain/Node";
import { TypeT } from "@/services/domain/Type";
import { StoreT } from "@/services/external/Store";
import { YjsT } from "@/services/external/Yjs";
import { withContext } from "@/utils";
import { Context, Effect, Layer } from "effect";

/** Available type with ID and display name */
export interface AvailableType {
  id: Id.Node;
  name: string;
}

/** System types that should be filtered out from user-facing type picker */
const SYSTEM_TYPE_IDS = new Set<Id.Node>([
  System.LIST_ELEMENT,
  System.CHECKBOX,
  System.RENDERING_TYPE,
  System.BOOLEAN,
  System.TRUE,
  System.FALSE,
  System.TUPLE_TYPE,
  System.IS_CHECKED,
]);

/** Check if a type ID is a system type */
export const isSystemType = (typeId: Id.Node): boolean =>
  SYSTEM_TYPE_IDS.has(typeId);

export class TypePickerT extends Context.Tag("TypePickerT")<
  TypePickerT,
  {
    /**
     * Get all user-defined types (children of System.TYPES node).
     */
    getAvailableTypes: () => Effect.Effect<readonly AvailableType[]>;
    /**
     * Filter types by search query (case-insensitive substring match).
     */
    filterTypes: (
      types: readonly AvailableType[],
      query: string,
    ) => readonly AvailableType[];
    /**
     * Create a new type under System.TYPES and return its ID.
     */
    createType: (name: string) => Effect.Effect<Id.Node>;
    /**
     * Apply a type to a node.
     */
    applyType: (nodeId: Id.Node, typeId: Id.Node) => Effect.Effect<void>;
  }
>() {}

const getAvailableTypes = () =>
  Effect.gen(function* () {
    const Store = yield* StoreT;
    const Yjs = yield* YjsT;

    // Get all children of the Types node
    const childIds = yield* Store.query(
      tables.parentLinks
        .select("childId")
        .where("parentId", "=", System.TYPES)
        .orderBy("position", "asc"),
    );

    // Get names for each type from Yjs
    const types: AvailableType[] = [];
    for (const id of childIds as Id.Node[]) {
      const yText = Yjs.getText(id);
      const name = yText.toString();
      types.push({ id, name });
    }

    yield* Effect.logDebug("[TypePicker.getAvailableTypes] Fetched types").pipe(
      Effect.annotateLogs({
        count: types.length,
        types: types.map((t) => ({ id: t.id, name: t.name })),
      }),
    );

    return types;
  });

const filterTypes = (
  types: readonly AvailableType[],
  query: string,
): readonly AvailableType[] => {
  if (!query) return types;
  const lowerQuery = query.toLowerCase();
  return types.filter((type) => type.name.toLowerCase().includes(lowerQuery));
};

const createType = (name: string) =>
  Effect.gen(function* () {
    const Node = yield* NodeT;
    const Yjs = yield* YjsT;

    // Create a new node under System.TYPES
    const typeId = yield* Node.insertNode({
      parentId: System.TYPES,
      insert: "after",
    });

    // Set the text content
    const yText = Yjs.getText(typeId);
    yText.insert(0, name);

    yield* Effect.logDebug("[TypePicker.createType] Created new type").pipe(
      Effect.annotateLogs({ typeId, name }),
    );

    return typeId;
  }).pipe(Effect.orDie);

const applyType = (nodeId: Id.Node, typeId: Id.Node) =>
  Effect.gen(function* () {
    const Type = yield* TypeT;
    yield* Effect.logDebug("[TypePicker.applyType] Applying type to node").pipe(
      Effect.annotateLogs({ nodeId, typeId }),
    );
    yield* Type.addType(nodeId, typeId);
    yield* Effect.logDebug("[TypePicker.applyType] Type applied successfully").pipe(
      Effect.annotateLogs({ nodeId, typeId }),
    );
  });

export const TypePickerLive = Layer.effect(
  TypePickerT,
  Effect.gen(function* () {
    const Store = yield* StoreT;
    const Yjs = yield* YjsT;
    const Node = yield* NodeT;
    const Type = yield* TypeT;

    const context = Context.make(StoreT, Store).pipe(
      Context.add(YjsT, Yjs),
      Context.add(NodeT, Node),
      Context.add(TypeT, Type),
    );

    return {
      getAvailableTypes: withContext(getAvailableTypes)(context),
      filterTypes,
      createType: withContext(createType)(context),
      applyType: withContext(applyType)(context),
    };
  }),
);
