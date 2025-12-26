import { events } from "@/livestore/schema";
import { Id } from "@/schema";
import { NodeT } from "@/services/domain/Node";
import { StoreT } from "@/services/external/Store";
import { Effect } from "effect";
import { nanoid } from "nanoid";

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

    const windowId = Id.Window.make(yield* Store.getSessionId());
    const bufferId = Id.Buffer.make(nanoid());
    const nodeId = Id.Node.make(nanoid());

    // Create node
    yield* Store.commit(
      events.nodeCreated({
        timestamp: Date.now(),
        data: {
          nodeId,
          textContent,
        },
      }),
    );

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

    const windowId = Id.Window.make(yield* Store.getSessionId());
    const bufferId = Id.Buffer.make(nanoid());
    const rootNodeId = Id.Node.make(nanoid());

    // Create root node
    yield* Store.commit(
      events.nodeCreated({
        timestamp: Date.now(),
        data: {
          nodeId: rootNodeId,
          textContent: rootText,
        },
      }),
    );

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
        textContent: child.text,
      });
      childNodeIds.push(childId);
    }

    return {
      bufferId,
      rootNodeId,
      childNodeIds: childNodeIds as ToNodeIds<T>,
      windowId,
    };
  }).pipe(Effect.withSpan("Given.A_BUFFER_WITH_CHILDREN"));
