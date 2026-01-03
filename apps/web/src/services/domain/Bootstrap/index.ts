import { events, tables } from "@/livestore/schema";
import { Id, System } from "@/schema";
import { StoreT } from "@/services/external/Store";
import { YjsT } from "@/services/external/Yjs";
import { withContext } from "@/utils";
import { Context, Effect, Layer } from "effect";
import { generateKeyBetween } from "fractional-indexing";
import { TypeT } from "../Type";

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
      tables.nodes.select().where({ id: nodeId }).first({ fallback: () => null }),
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

const createChildNode = (nodeId: Id.Node, parentId: Id.Node, position: string) =>
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

const ensureSystemNodes = () =>
  Effect.gen(function* () {
    const Type = yield* TypeT;

    const rootExists = yield* nodeExists(System.ROOT);
    if (!rootExists) {
      yield* createRootNode(System.ROOT, generateKeyBetween(null, null));
      yield* setNodeText(System.ROOT, "System");
    }

    const renderingTypeExists = yield* nodeExists(System.RENDERING_TYPE);
    if (!renderingTypeExists) {
      yield* createChildNode(
        System.RENDERING_TYPE,
        System.ROOT,
        generateKeyBetween(null, null),
      );
      yield* setNodeText(System.RENDERING_TYPE, "Rendering Type");
    }

    const listElementExists = yield* nodeExists(System.LIST_ELEMENT);
    if (!listElementExists) {
      const pos = generateKeyBetween(generateKeyBetween(null, null), null);
      yield* createChildNode(System.LIST_ELEMENT, System.ROOT, pos);
      yield* setNodeText(System.LIST_ELEMENT, "List Element");
    }

    const hasRenderingType = yield* Type.hasType(
      System.LIST_ELEMENT,
      System.RENDERING_TYPE,
    );
    if (!hasRenderingType) {
      yield* Type.addType(System.LIST_ELEMENT, System.RENDERING_TYPE);
    }
  });

export const BootstrapLive = Layer.effect(
  BootstrapT,
  Effect.gen(function* () {
    const Store = yield* StoreT;
    const Type = yield* TypeT;
    const Yjs = yield* YjsT;
    const context = Context.make(StoreT, Store).pipe(
      Context.add(TypeT, Type),
      Context.add(YjsT, Yjs),
    );

    return {
      ensureSystemNodes: withContext(ensureSystemNodes)(context),
    };
  }),
);
