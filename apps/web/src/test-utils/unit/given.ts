import { events } from "@/livestore/schema";
import { Entity, Id } from "@/schema";
import { NodeT } from "@/services/domain/Node";
import { AutomergeT } from "@/services/external/Automerge";
import { StoreT } from "@/services/external/Store";
import { BufferT } from "@/services/ui/Buffer";
import type { EditorTestHandle } from "@/services/ui/Editor/test";
import { WindowT } from "@/services/ui/Window";
import { makeCollapsedSelection } from "@/utils/selectionStrategy";
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

    yield* Store.commit(
      events.nodeCreated({
        timestamp: Date.now(),
        data: { nodeId: rootNodeId },
      }),
    );

    yield* Automerge.setText(rootNodeId, rootText);

    yield* Store.setDocument(
      "window",
      {
        panes: [],
        activeElement: null,
      },
      windowId,
    );

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

    const childNodeIds: Id.Node[] = [];
    for (const child of children) {
      const childId = yield* Node.insertNode({
        parentId: rootNodeId,
        insert: "after",
      });
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

export const ACTIVE_ELEMENT_IS = (element: Entity.Element) =>
  Effect.gen(function* () {
    const Window = yield* WindowT;
    yield* Window.setActiveElement(Option.some(element));
  }).pipe(Effect.withSpan("Given.ACTIVE_ELEMENT_IS"));

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

export const CURSOR_AT_START = (editor: EditorTestHandle) =>
  editor.setCursorAtStart(true);

export const CURSOR_NOT_AT_START = (editor: EditorTestHandle) =>
  editor.setCursorAtStart(false);

export const CURSOR_AT_END = (editor: EditorTestHandle) =>
  editor.setCursorAtEnd(true);

export const CURSOR_NOT_AT_END = (editor: EditorTestHandle) =>
  editor.setCursorAtEnd(false);

export const CURSOR_ON_FIRST_LINE = (editor: EditorTestHandle) =>
  editor.setCursorOnFirstLine(true);

export const CURSOR_NOT_ON_FIRST_LINE = (editor: EditorTestHandle) =>
  editor.setCursorOnFirstLine(false);

export const CURSOR_ON_LAST_LINE = (editor: EditorTestHandle) =>
  editor.setCursorOnLastLine(true);

export const CURSOR_NOT_ON_LAST_LINE = (editor: EditorTestHandle) =>
  editor.setCursorOnLastLine(false);

export const GOAL_X = (editor: EditorTestHandle, value: number) =>
  editor.setGoalX(value);

export const SELECTION_WITH_GOAL_X = (
  bufferId: Id.Buffer,
  blockId: Id.Block,
  goalX: number,
) =>
  Effect.gen(function* () {
    const Buffer = yield* BufferT;
    yield* Buffer.setSelection(
      bufferId,
      makeCollapsedSelection(blockId, 0, { goalX }),
    );
  }).pipe(Effect.withSpan("Given.SELECTION_WITH_GOAL_X"));

export const MOVE_TRACKING_RESET = (editor: EditorTestHandle) =>
  Effect.all([
    editor.resetMoveLeftCalled(),
    editor.resetMoveRightCalled(),
    editor.resetMoveUpCalled(),
    editor.resetMoveDownCalled(),
  ]).pipe(Effect.asVoid);
