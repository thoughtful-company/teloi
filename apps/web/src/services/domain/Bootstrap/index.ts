import { events, tables } from "@/livestore/schema";
import { Id, System } from "@/schema";
import { StoreT } from "@/services/external/Store";
import { YjsT } from "@/services/external/Yjs";
import { withContext } from "@/utils";
import { Context, Effect, Layer } from "effect";
import { generateKeyBetween } from "fractional-indexing";
import { TypeT } from "../Type";
import { TupleT } from "../Tuple";

export class BootstrapT extends Context.Tag("BootstrapT")<
  BootstrapT,
  {
    /**
     * Ensures all system nodes exist. Idempotent - safe to call multiple times.
     */
    ensureSystemNodes: () => Effect.Effect<void>;
  }
>() {}

const nodeExists = (nodeId: Id.Node) =>
  Effect.gen(function* () {
    const Store = yield* StoreT;
    const node = yield* Store.query(
      tables.nodes
        .select()
        .where({ id: nodeId })
        .first({ fallback: () => null }),
    );
    return node !== null;
  });

const createRootNode = (nodeId: Id.Node, position: string) =>
  Effect.gen(function* () {
    const Store = yield* StoreT;
    yield* Store.commit(
      events.nodeCreated({
        timestamp: Date.now(),
        data: {
          nodeId,
          parentId: undefined,
          position,
        },
      }),
    );
  });

const createChildNode = (
  nodeId: Id.Node,
  parentId: Id.Node,
  position: string,
) =>
  Effect.gen(function* () {
    const Store = yield* StoreT;
    yield* Store.commit(
      events.nodeCreated({
        timestamp: Date.now(),
        data: {
          nodeId,
          parentId,
          position,
        },
      }),
    );
  });

const setNodeText = (nodeId: Id.Node, text: string) =>
  Effect.gen(function* () {
    const Yjs = yield* YjsT;
    const yText = Yjs.getText(nodeId);
    if (yText.length === 0) {
      yText.insert(0, text);
    }
  });

// Helper to get next position after a given position
const nextPosition = (prevPos: string | null) =>
  generateKeyBetween(prevPos, null);

const ensureSystemNodes = () =>
  Effect.gen(function* () {
    const Type = yield* TypeT;
    const Tuple = yield* TupleT;

    // === System Root ===
    const rootExists = yield* nodeExists(System.ROOT);
    if (!rootExists) {
      yield* createRootNode(System.ROOT, generateKeyBetween(null, null));
      yield* setNodeText(System.ROOT, "System");
    }

    // === Rendering Type (meta-type) ===
    let pos = generateKeyBetween(null, null);
    const renderingTypeExists = yield* nodeExists(System.RENDERING_TYPE);
    if (!renderingTypeExists) {
      yield* createChildNode(System.RENDERING_TYPE, System.ROOT, pos);
      yield* setNodeText(System.RENDERING_TYPE, "Rendering Type");
    }

    // === List Element (rendering type) ===
    pos = nextPosition(pos);
    const listElementExists = yield* nodeExists(System.LIST_ELEMENT);
    if (!listElementExists) {
      yield* createChildNode(System.LIST_ELEMENT, System.ROOT, pos);
      yield* setNodeText(System.LIST_ELEMENT, "List Element");
    }
    if (!(yield* Type.hasType(System.LIST_ELEMENT, System.RENDERING_TYPE))) {
      yield* Type.addType(System.LIST_ELEMENT, System.RENDERING_TYPE);
    }

    // === Boolean Type ===
    pos = nextPosition(pos);
    const booleanExists = yield* nodeExists(System.BOOLEAN);
    if (!booleanExists) {
      yield* createChildNode(System.BOOLEAN, System.ROOT, pos);
      yield* setNodeText(System.BOOLEAN, "Boolean");
    }

    // === True (boolean value) ===
    pos = nextPosition(pos);
    const trueExists = yield* nodeExists(System.TRUE);
    if (!trueExists) {
      yield* createChildNode(System.TRUE, System.ROOT, pos);
      yield* setNodeText(System.TRUE, "True");
    }
    if (!(yield* Type.hasType(System.TRUE, System.BOOLEAN))) {
      yield* Type.addType(System.TRUE, System.BOOLEAN);
    }

    // === False (boolean value) ===
    pos = nextPosition(pos);
    const falseExists = yield* nodeExists(System.FALSE);
    if (!falseExists) {
      yield* createChildNode(System.FALSE, System.ROOT, pos);
      yield* setNodeText(System.FALSE, "False");
    }
    if (!(yield* Type.hasType(System.FALSE, System.BOOLEAN))) {
      yield* Type.addType(System.FALSE, System.BOOLEAN);
    }

    // === Tuple Type (meta-type) ===
    pos = nextPosition(pos);
    const tupleTypeExists = yield* nodeExists(System.TUPLE_TYPE);
    if (!tupleTypeExists) {
      yield* createChildNode(System.TUPLE_TYPE, System.ROOT, pos);
      yield* setNodeText(System.TUPLE_TYPE, "Tuple Type");
    }

    // === IS_CHECKED (tuple type for checkbox state) ===
    pos = nextPosition(pos);
    const isCheckedExists = yield* nodeExists(System.IS_CHECKED);
    if (!isCheckedExists) {
      yield* createChildNode(System.IS_CHECKED, System.ROOT, pos);
      yield* setNodeText(System.IS_CHECKED, "Is Checked");
      yield* Type.addType(System.IS_CHECKED, System.TUPLE_TYPE);
      // Define IS_CHECKED schema: position 0 = subject (any node), position 1 = value (boolean)
      yield* Tuple.addRole(System.IS_CHECKED, 0, "subject", true);
      yield* Tuple.addRole(System.IS_CHECKED, 1, "value", true);
      yield* Tuple.addAllowedType(System.IS_CHECKED, 1, System.BOOLEAN);
    }

    // === Checkbox (rendering type) ===
    pos = nextPosition(pos);
    const checkboxExists = yield* nodeExists(System.CHECKBOX);
    if (!checkboxExists) {
      yield* createChildNode(System.CHECKBOX, System.ROOT, pos);
      yield* setNodeText(System.CHECKBOX, "Checkbox");
    }
    if (!(yield* Type.hasType(System.CHECKBOX, System.RENDERING_TYPE))) {
      yield* Type.addType(System.CHECKBOX, System.RENDERING_TYPE);
    }

    // === Workspace Home ===
    const workspaceExists = yield* nodeExists(System.WORKSPACE);
    if (!workspaceExists) {
      const workspacePos = generateKeyBetween(
        generateKeyBetween(null, null),
        null,
      );
      yield* createRootNode(System.WORKSPACE, workspacePos);
      yield* setNodeText(System.WORKSPACE, "Home");
    }
  });

export const BootstrapLive = Layer.effect(
  BootstrapT,
  Effect.gen(function* () {
    const Store = yield* StoreT;
    const Type = yield* TypeT;
    const Tuple = yield* TupleT;
    const Yjs = yield* YjsT;
    const context = Context.make(StoreT, Store).pipe(
      Context.add(TypeT, Type),
      Context.add(TupleT, Tuple),
      Context.add(YjsT, Yjs),
    );

    return {
      ensureSystemNodes: withContext(ensureSystemNodes)(context),
    };
  }),
);
