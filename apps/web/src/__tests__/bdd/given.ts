import { events } from "@/livestore/schema";
import { Id } from "@/schema";
import { NodeT } from "@/services/domain/Node";
import { StoreT } from "@/services/external/Store";
import { YjsT } from "@/services/external/Yjs";
import { Effect } from "effect";
import { nanoid } from "nanoid";
import { screen } from "@testing-library/dom";

export interface BufferWithNodeResult {
  bufferId: Id.Buffer;
  nodeId: Id.Node;
  windowId: Id.Window;
  textContent: string;
}

/**
 * Creates a buffer with an assigned node containing the given text.
 * Sets up the minimal required documents: window, buffer, node.
 */
export const A_BUFFER_WITH_TEXT = (textContent: string) =>
  Effect.gen(function* () {
    const Store = yield* StoreT;
    const Yjs = yield* YjsT;

    const windowId = Id.Window.make(yield* Store.getSessionId());
    const bufferId = Id.Buffer.make(nanoid());
    const nodeId = Id.Node.make(nanoid());

    // Create node in LiveStore
    yield* Store.commit(
      events.nodeCreated({
        timestamp: Date.now(),
        data: { nodeId },
      }),
    );

    // Set text content in Yjs
    const ytext = Yjs.getText(nodeId);
    ytext.insert(0, textContent);

    // Create window document (required for active element tracking)
    yield* Store.setDocument(
      "window",
      {
        panes: [],
        activeElement: null,
      },
      windowId,
    );

    // Create buffer document
    yield* Store.setDocument(
      "buffer",
      {
        windowId,
        parent: { id: Id.Pane.make("test-pane"), type: "pane" },
        assignedNodeId: nodeId,
        selectedNodes: [],
        toggledNodes: [],
        selection: null,
      },
      bufferId,
    );

    return {
      bufferId,
      nodeId,
      windowId,
      textContent,
    } satisfies BufferWithNodeResult;
  }).pipe(Effect.withSpan("Given.A_BUFFER_WITH_TEXT"));

export interface ChildSpec {
  text: string;
}

/** Maps a tuple of ChildSpec to a tuple of Id.Node with matching length */
type ToNodeIds<T extends readonly ChildSpec[]> = { [K in keyof T]: Id.Node };

export interface BufferWithChildrenResult<
  T extends readonly ChildSpec[] = readonly ChildSpec[],
> {
  bufferId: Id.Buffer;
  rootNodeId: Id.Node;
  childNodeIds: ToNodeIds<T>;
  windowId: Id.Window;
}

/**
 * Creates a buffer with a root node and child nodes.
 * Uses NodeT.insertNode to create children with proper positioning.
 */
export const A_BUFFER_WITH_CHILDREN = <const T extends readonly ChildSpec[]>(
  rootText: string,
  children: T,
) =>
  Effect.gen(function* () {
    const Store = yield* StoreT;
    const Node = yield* NodeT;
    const Yjs = yield* YjsT;

    const windowId = Id.Window.make(yield* Store.getSessionId());
    const bufferId = Id.Buffer.make(nanoid());
    const rootNodeId = Id.Node.make(nanoid());

    // Create root node in LiveStore
    yield* Store.commit(
      events.nodeCreated({
        timestamp: Date.now(),
        data: { nodeId: rootNodeId },
      }),
    );

    // Set root text in Yjs
    const rootYtext = Yjs.getText(rootNodeId);
    rootYtext.insert(0, rootText);

    // Create window document
    yield* Store.setDocument(
      "window",
      {
        panes: [],
        activeElement: null,
      },
      windowId,
    );

    // Create buffer document
    yield* Store.setDocument(
      "buffer",
      {
        windowId,
        parent: { id: Id.Pane.make("test-pane"), type: "pane" },
        assignedNodeId: rootNodeId,
        selectedNodes: [],
        toggledNodes: [],
        selection: null,
      },
      bufferId,
    );

    // Create child nodes using NodeT.insertNode
    const childNodeIds: Id.Node[] = [];
    for (const child of children) {
      const childId = yield* Node.insertNode({
        parentId: rootNodeId,
        insert: "after", // Append at end
      });
      // Set child text in Yjs
      const childYtext = Yjs.getText(childId);
      childYtext.insert(0, child.text);
      childNodeIds.push(childId);
    }

    return {
      bufferId,
      rootNodeId,
      childNodeIds: childNodeIds as ToNodeIds<T>,
      windowId,
    };
  }).pipe(Effect.withSpan("Given.A_BUFFER_WITH_CHILDREN"));

/**
 * Sets the buffer container to a specific width.
 * Useful for testing line wrapping behavior.
 */
export const BUFFER_HAS_WIDTH = (width: number) =>
  Effect.promise(async () => {
    const buffer = await screen.findByTestId("editor-buffer");
    buffer.style.width = `${width}px`;
  }).pipe(Effect.withSpan("Given.BUFFER_HAS_WIDTH"));

/**
 * Inserts a node with text content.
 * Wrapper around NodeT.insertNode that also populates Yjs.
 */
export const INSERT_NODE_WITH_TEXT = (args: {
  parentId: Id.Node;
  insert: "before" | "after";
  siblingId?: Id.Node;
  text: string;
}) =>
  Effect.gen(function* () {
    const Node = yield* NodeT;
    const Yjs = yield* YjsT;

    const nodeId = yield* Node.insertNode({
      parentId: args.parentId,
      insert: args.insert,
      ...(args.siblingId !== undefined && { siblingId: args.siblingId }),
    });

    const ytext = Yjs.getText(nodeId);
    ytext.insert(0, args.text);

    return nodeId;
  }).pipe(Effect.withSpan("Given.INSERT_NODE_WITH_TEXT"));

export interface FullHierarchyResult {
  bufferId: Id.Buffer;
  nodeId: Id.Node;
  paneId: Id.Pane;
  windowId: Id.Window;
  textContent: string;
}

/**
 * Creates the full window → pane → buffer → node hierarchy.
 * Required for NavigationT tests which look up buffer via window.panes[0].
 */
export const A_FULL_HIERARCHY_WITH_TEXT = (textContent: string) =>
  Effect.gen(function* () {
    const Store = yield* StoreT;
    const Yjs = yield* YjsT;

    const windowId = Id.Window.make(yield* Store.getSessionId());
    const paneId = Id.Pane.make(nanoid());
    const bufferId = Id.Buffer.make(nanoid());
    const nodeId = Id.Node.make(nanoid());

    // Create node in LiveStore
    yield* Store.commit(
      events.nodeCreated({
        timestamp: Date.now(),
        data: { nodeId },
      }),
    );

    // Set text in Yjs
    const ytext = Yjs.getText(nodeId);
    ytext.insert(0, textContent);

    // Create window document with pane reference
    yield* Store.setDocument(
      "window",
      {
        panes: [paneId],
        activeElement: null,
      },
      windowId,
    );

    // Create pane document with buffer reference
    yield* Store.setDocument(
      "pane",
      {
        parent: { id: windowId, type: "window" },
        buffers: [bufferId],
      },
      paneId,
    );

    // Create buffer document (assignedNodeId starts as null for navigation tests)
    yield* Store.setDocument(
      "buffer",
      {
        windowId,
        parent: { id: paneId, type: "pane" },
        assignedNodeId: null,
        selectedNodes: [],
        toggledNodes: [],
        selection: null,
      },
      bufferId,
    );

    return {
      bufferId,
      nodeId,
      paneId,
      windowId,
      textContent,
    } satisfies FullHierarchyResult;
  }).pipe(Effect.withSpan("Given.A_FULL_HIERARCHY_WITH_TEXT"));

export interface FullHierarchyWithChildrenResult<
  T extends readonly ChildSpec[] = readonly ChildSpec[],
> {
  bufferId: Id.Buffer;
  rootNodeId: Id.Node;
  childNodeIds: ToNodeIds<T>;
  paneId: Id.Pane;
  windowId: Id.Window;
}

/**
 * Creates the full window → pane → buffer → node hierarchy with child nodes.
 * Required for NavigationT tests which look up buffer via window.panes[0].
 */
export const A_FULL_HIERARCHY_WITH_CHILDREN = <
  const T extends readonly ChildSpec[],
>(
  rootText: string,
  children: T,
) =>
  Effect.gen(function* () {
    const Store = yield* StoreT;
    const Node = yield* NodeT;
    const Yjs = yield* YjsT;

    const windowId = Id.Window.make(yield* Store.getSessionId());
    const paneId = Id.Pane.make(nanoid());
    const bufferId = Id.Buffer.make(nanoid());
    const rootNodeId = Id.Node.make(nanoid());

    // Create root node in LiveStore
    yield* Store.commit(
      events.nodeCreated({
        timestamp: Date.now(),
        data: { nodeId: rootNodeId },
      }),
    );

    // Set root text in Yjs
    const rootYtext = Yjs.getText(rootNodeId);
    rootYtext.insert(0, rootText);

    // Create window document with pane reference
    yield* Store.setDocument(
      "window",
      {
        panes: [paneId],
        activeElement: null,
      },
      windowId,
    );

    // Create pane document with buffer reference
    yield* Store.setDocument(
      "pane",
      {
        parent: { id: windowId, type: "window" },
        buffers: [bufferId],
      },
      paneId,
    );

    // Create buffer document
    yield* Store.setDocument(
      "buffer",
      {
        windowId,
        parent: { id: paneId, type: "pane" },
        assignedNodeId: rootNodeId,
        selectedNodes: [],
        toggledNodes: [],
        selection: null,
      },
      bufferId,
    );

    // Create child nodes using NodeT.insertNode
    const childNodeIds: Id.Node[] = [];
    for (const child of children) {
      const childId = yield* Node.insertNode({
        parentId: rootNodeId,
        insert: "after",
      });
      // Set child text in Yjs
      const childYtext = Yjs.getText(childId);
      childYtext.insert(0, child.text);
      childNodeIds.push(childId);
    }

    return {
      bufferId,
      rootNodeId,
      childNodeIds: childNodeIds as ToNodeIds<T>,
      paneId,
      windowId,
    };
  }).pipe(Effect.withSpan("Given.A_FULL_HIERARCHY_WITH_CHILDREN"));
