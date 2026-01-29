/**
 * Unit test setup utilities.
 * Uses mock layers for fast, isolated testing without LiveStore/browser dependencies.
 */

import { BrandedId, ClientDocumentModel } from "@/livestore/schema";
import { Entity, Id, Model } from "@/schema";
import { NodeHasNoParentError } from "@/services/domain/errors";
import { NodeT } from "@/services/domain/Node";
import { makeAutomergeLive } from "@/services/external/Automerge";
import { StoreT } from "@/services/external/Store";
import { BufferT } from "@/services/ui/Buffer";
import {
  makeEditorTest,
  type EditorTestHandle,
} from "@/services/ui/Editor/test";
import { WindowT } from "@/services/ui/Window";
import { Context, Effect, Layer, ManagedRuntime, Option, Ref } from "effect";
import { nanoid } from "nanoid";

// Re-export for convenience
export type { EditorTestHandle };

type ParentLink = {
  parentId: Id.Node;
  childId: Id.Node;
  position: string;
  inShadow: boolean;
};

/**
 * In-memory store for unit tests.
 * Provides minimal Store interface without real LiveStore.
 */
const makeInMemoryStore = () =>
  Effect.gen(function* () {
    // In-memory storage for documents
    const documents = new Map<string, Map<string, unknown>>();
    const sessionId = nanoid();

    // Initialize document maps for known document types
    documents.set("window", new Map());
    documents.set("buffer", new Map());
    documents.set("block", new Map());
    documents.set("pane", new Map());

    // In-memory storage for nodes and parent links
    const nodes = new Map<Id.Node, { nodeId: Id.Node }>();
    const parentLinks = new Map<string, ParentLink>();

    const store = {
      getSessionId: () => Effect.succeed(sessionId),

      getDocument: <K extends Model.DocumentName>(
        name: K,
        id?: BrandedId<K>,
      ): Effect.Effect<Option.Option<NonNullable<ClientDocumentModel<K>>>> =>
        Effect.sync(() => {
          const docMap = documents.get(name);
          if (!docMap) return Option.none();
          const doc = docMap.get(id as string);
          return doc
            ? Option.some(doc as NonNullable<ClientDocumentModel<K>>)
            : Option.none();
        }),

      setDocument: <K extends Model.DocumentName>(
        name: K,
        doc: ClientDocumentModel<K>,
        id?: BrandedId<K>,
      ): Effect.Effect<void> =>
        Effect.sync(() => {
          let docMap = documents.get(name);
          if (!docMap) {
            docMap = new Map();
            documents.set(name, docMap);
          }
          docMap.set(id as string, doc);
        }),

      subscribeStream: () => {
        throw new Error("subscribeStream not implemented in mock store");
      },

      commit: (event: unknown) =>
        Effect.sync(() => {
          // Handle nodeCreated events
          const e = event as {
            type: string;
            data: { nodeId: Id.Node; parentId?: Id.Node };
          };
          if (e.type === "nodeCreated") {
            nodes.set(e.data.nodeId, { nodeId: e.data.nodeId });
          }
        }),

      query: <T>(): Effect.Effect<T> => Effect.sync(() => [] as T),
    };

    return {
      store: store as unknown as Context.Tag.Service<StoreT>,
      nodes,
      parentLinks,
    };
  });

/**
 * In-memory Node service for unit tests.
 */
const makeInMemoryNode = (
  nodesRef: Ref.Ref<Map<Id.Node, { nodeId: Id.Node }>>,
  parentLinksRef: Ref.Ref<Map<string, ParentLink>>,
) =>
  Layer.succeed(NodeT, {
    insertNode: (args: {
      parentId: Id.Node;
      insert: "before" | "after";
      siblingId?: Id.Node;
    }) =>
      Effect.gen(function* () {
        const nodeId = Id.Node.make(nanoid());

        // Add to nodes
        const nodes = yield* Ref.get(nodesRef);
        nodes.set(nodeId, { nodeId });
        yield* Ref.set(nodesRef, nodes);

        // Add parent link
        const links = yield* Ref.get(parentLinksRef);
        // Generate a fractional position
        const existingChildren = Array.from(links.values())
          .filter((l) => l.parentId === args.parentId && !l.inShadow)
          .map((l) => l.position)
          .sort();

        let position: string;
        if (existingChildren.length === 0) {
          position = "a0";
        } else {
          // Append at end
          const last = existingChildren[existingChildren.length - 1]!;
          position = last + "0";
        }

        links.set(`${args.parentId}:${nodeId}`, {
          parentId: args.parentId,
          childId: nodeId,
          position,
          inShadow: false,
        });
        yield* Ref.set(parentLinksRef, links);

        return nodeId;
      }),

    getParent: (nodeId: Id.Node) =>
      Effect.gen(function* () {
        const links = yield* Ref.get(parentLinksRef);
        for (const [, link] of links) {
          if (link.childId === nodeId && !link.inShadow) {
            return link.parentId;
          }
        }
        return yield* Effect.fail(new NodeHasNoParentError({ nodeId }));
      }),

    getNodeChildren: (parentId: Id.Node) =>
      Effect.gen(function* () {
        const links = yield* Ref.get(parentLinksRef);
        const children: { childId: Id.Node; position: string }[] = [];
        for (const [, link] of links) {
          if (link.parentId === parentId && !link.inShadow) {
            children.push({ childId: link.childId, position: link.position });
          }
        }
        children.sort((a, b) => a.position.localeCompare(b.position));
        return children.map((c) => c.childId);
      }),

    // Stub implementations for unused methods
    setParent: () => Effect.void,
    removeNode: () => Effect.void,
    getNodeTree: () =>
      Effect.succeed({ nodeId: Id.Node.make("stub"), text: "", children: [] }),
    getTree: () => Effect.succeed([]),
  } as unknown as Context.Tag.Service<NodeT>);

/**
 * Creates a command test environment with mock services.
 * Fast and isolated - perfect for unit testing command logic.
 */
export const setupCommandTest = async () => {
  const storeId = `test-${Date.now()}-${Math.random().toString(36).slice(2)}`;

  const nodesRef = await Effect.runPromise(
    Ref.make(new Map<Id.Node, { nodeId: Id.Node }>()),
  );
  const parentLinksRef = await Effect.runPromise(
    Ref.make(new Map<string, ParentLink>()),
  );

  const { store, nodes, parentLinks } =
    await Effect.runPromise(makeInMemoryStore());

  const editorHandle = await Effect.runPromise(makeEditorTest());

  await Effect.runPromise(Ref.set(nodesRef, nodes));
  await Effect.runPromise(Ref.set(parentLinksRef, parentLinks));

  const StoreLayer = Layer.succeed(StoreT, store);
  const NodeLayer = makeInMemoryNode(nodesRef, parentLinksRef);
  const AutomergeLayer = makeAutomergeLive({
    workspaceName: storeId,
    persist: false,
  });

  const activeElementRef = await Effect.runPromise(
    Ref.make<Option.Option<Entity.Element>>(Option.none()),
  );

  const WindowLayer = Layer.succeed(WindowT, {
    subscribeActiveElement: () => {
      throw new Error("subscribeActiveElement not needed in unit tests");
    },
    setActiveElement: (element: Option.Option<Entity.Element>) =>
      Ref.set(activeElementRef, element),
    getActiveElement: () => Ref.get(activeElementRef),
    getActiveBufferId: () => Effect.succeed(Option.none()),
  } as unknown as Context.Tag.Service<WindowT>);

  // Create Buffer layer with findPreviousVisibleNode
  const BufferLayer = Layer.effect(
    BufferT,
    Effect.gen(function* () {
      const Store = yield* StoreT;
      const Node = yield* NodeT;

      // Helper to check if block is expanded
      const isBlockExpanded = (bufferId: Id.Buffer, nodeId: Id.Node) =>
        Effect.gen(function* () {
          const blockId = Id.makeBufferBlockId(bufferId, nodeId);
          const blockDoc = yield* Store.getDocument("block", blockId);
          if (Option.isNone(blockDoc)) return true; // Default expanded
          return blockDoc.value.isExpanded;
        });

      // Helper to find deepest last child
      const findDeepestLastChild = (
        startNodeId: Id.Node,
        bufferId: Id.Buffer,
      ): Effect.Effect<Id.Node> =>
        Effect.gen(function* () {
          const expanded = yield* isBlockExpanded(bufferId, startNodeId);
          if (!expanded) return startNodeId;

          const children = yield* Node.getNodeChildren(startNodeId);
          if (children.length === 0) return startNodeId;

          const lastChild = children[children.length - 1]!;
          return yield* findDeepestLastChild(lastChild, bufferId);
        });

      return {
        subscribe: () => {
          throw new Error("subscribe not implemented");
        },
        getSelection: (bufferId: Id.Buffer) =>
          Effect.gen(function* () {
            const doc = yield* Store.getDocument("buffer", bufferId);
            if (Option.isNone(doc)) return Option.none();
            return Option.fromNullable(doc.value.selection);
          }),
        getAssignedNodeId: (bufferId: Id.Buffer) =>
          Effect.gen(function* () {
            const doc = yield* Store.getDocument("buffer", bufferId);
            if (Option.isNone(doc)) return null;
            const nodeId = doc.value.assignedNodeId;
            return nodeId ? Id.Node.make(nodeId) : null;
          }),
        setSelection: (
          bufferId: Id.Buffer,
          selection: Option.Option<Model.BufferSelection>,
        ) =>
          Effect.gen(function* () {
            const doc = yield* Store.getDocument("buffer", bufferId);
            if (Option.isNone(doc)) return;

            yield* Store.setDocument(
              "buffer",
              {
                ...doc.value,
                selection: Option.getOrNull(selection),
              },
              bufferId,
            );
          }),
        setAssignedNodeId: () => Effect.void,
        setBlockSelection: () => Effect.void,
        getMode: () => Effect.succeed({ type: "none" as const }),
        enterBlockSelection: () => Effect.void,
        enterBlockEditing: () => Effect.void,
        clearFocus: () => Effect.void,
        indent: () => Effect.succeed(Option.none()),
        outdent: () => Effect.succeed(false),
        mergeBackward: () => Effect.succeed(Option.none()),
        mergeForward: () => Effect.succeed(Option.none()),
        forceDelete: () => Effect.succeed(Option.none()),
        split: () =>
          Effect.succeed({ newNodeId: Id.Node.make("stub"), cursorOffset: 0 }),
        swap: () => Effect.succeed(false),
        moveToFirst: () => Effect.succeed(false),
        moveToLast: () => Effect.succeed(false),

        findPreviousVisibleNode: (currentId: Id.Node, bufferId: Id.Buffer) =>
          Effect.gen(function* () {
            // Get parent
            const parentIdResult = yield* Node.getParent(currentId).pipe(
              Effect.catchTag("NodeHasNoParentError", () =>
                Effect.succeed<Id.Node | null>(null),
              ),
            );
            if (!parentIdResult) return Option.none();

            const siblings = yield* Node.getNodeChildren(parentIdResult);
            const idx = siblings.indexOf(currentId);
            if (idx === -1) return Option.none();

            if (idx > 0) {
              const prevSiblingId = siblings[idx - 1]!;
              const deepest = yield* findDeepestLastChild(
                prevSiblingId,
                bufferId,
              );
              return Option.some(deepest);
            }

            // First child - return parent
            return Option.some(parentIdResult);
          }),
      } as unknown as Context.Tag.Service<BufferT>;
    }),
  );

  // Compose layers
  const TestLayer = BufferLayer.pipe(
    Layer.provideMerge(WindowLayer),
    Layer.provideMerge(editorHandle.layer),
    Layer.provideMerge(NodeLayer),
    Layer.provideMerge(AutomergeLayer),
    Layer.provideMerge(StoreLayer),
  );

  const testRuntime = ManagedRuntime.make(TestLayer);

  return {
    runtime: testRuntime,
    editor: editorHandle,
    cleanup: async () => {
      await testRuntime.dispose();
    },
  };
};

export type CommandRuntime = Awaited<
  ReturnType<typeof setupCommandTest>
>["runtime"];
