/**
 * Unit test fixtures (Given helpers).
 * Pure Effect code - no browser dependencies.
 */

import { events } from "@/livestore/schema";
import { Entity, Id } from "@/schema";
import { NodeT } from "@/services/domain/Node";
import { AutomergeT } from "@/services/external/Automerge";
import { StoreT } from "@/services/external/Store";
import { WindowT } from "@/services/ui/Window";
import { Effect, Option } from "effect";
import { nanoid } from "nanoid";

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
    const Automerge = yield* AutomergeT;

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

    // Set root text in Automerge
    yield* Automerge.setText(rootNodeId, rootText);

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
        selectedBlocks: [],
        blockSelectionAnchor: null,
        blockSelectionFocus: null,
        lastFocusedBlockId: null,
        toggledNodes: [],
        selection: null,
        activeViewId: null,
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
      // Set child text in Automerge
      yield* Automerge.setText(childId, child.text);
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
 * Inserts a node with text content.
 * Wrapper around NodeT.insertNode that also populates Automerge.
 */
export const INSERT_NODE_WITH_TEXT = (args: {
  parentId: Id.Node;
  insert: "before" | "after";
  siblingId?: Id.Node;
  text: string;
}) =>
  Effect.gen(function* () {
    const Node = yield* NodeT;
    const Automerge = yield* AutomergeT;

    const nodeId = yield* Node.insertNode({
      parentId: args.parentId,
      insert: args.insert,
      ...(args.siblingId !== undefined && { siblingId: args.siblingId }),
    });

    yield* Automerge.setText(nodeId, args.text);

    return nodeId;
  }).pipe(Effect.withSpan("Given.INSERT_NODE_WITH_TEXT"));

/**
 * Sets the window's active element.
 * Use Entity helpers to construct the element:
 * - Block: { id: blockId, type: "block" }
 * - Title: Use Block with title's blockId (Id.makeBufferBlockId(bufferId, titleNodeId))
 */
export const ACTIVE_ELEMENT_IS = (element: Entity.Element) =>
  Effect.gen(function* () {
    const Window = yield* WindowT;
    yield* Window.setActiveElement(Option.some(element));
  }).pipe(Effect.withSpan("Given.ACTIVE_ELEMENT_IS"));

/**
 * Sets a block's expanded state.
 */
const SET_BLOCK_EXPANDED = (blockId: Id.Block, isExpanded: boolean) =>
  Effect.gen(function* () {
    const Store = yield* StoreT;

    const existingDoc = yield* Store.getDocument("block", blockId);
    const current = Option.isSome(existingDoc)
      ? existingDoc.value
      : { isExpanded: !isExpanded };

    yield* Store.setDocument("block", { ...current, isExpanded }, blockId);
  }).pipe(Effect.withSpan("Given.SET_BLOCK_EXPANDED"));

/** Collapse block - children hidden from navigation. */
export const BLOCK_IS_COLLAPSED = (blockId: Id.Block) =>
  SET_BLOCK_EXPANDED(blockId, false);

/** Expand block - children visible in navigation. */
export const BLOCK_IS_EXPANDED = (blockId: Id.Block) =>
  SET_BLOCK_EXPANDED(blockId, true);
