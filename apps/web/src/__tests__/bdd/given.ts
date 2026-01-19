import { events } from "@/livestore/schema";
import { Entity, Id, System } from "@/schema";
import { NodeInsertError, NodeNotFoundError } from "@/services/domain/errors";
import { NodeT } from "@/services/domain/Node";
import { TupleT } from "@/services/domain/Tuple";
import { StoreT } from "@/services/external/Store";
import { YjsT } from "@/services/external/Yjs";
import { BufferT } from "@/services/ui/Buffer";
import { WindowT } from "@/services/ui/Window";
import { Effect, Option } from "effect";
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

/** Recursive spec for nested children - supports arbitrary depth */
export interface NestedChildSpec {
  text: string;
  children?: readonly NestedChildSpec[];
}

/** Maps a single NestedChildSpec to its result type (preserves children structure) */
type NestedChildResult<T extends NestedChildSpec> = {
  nodeId: Id.Node;
} & (T["children"] extends readonly NestedChildSpec[]
  ? { children: NestedChildrenResult<T["children"]> }
  : object);

/** Maps a tuple of NestedChildSpec to a tuple of NestedChildResult */
type NestedChildrenResult<T extends readonly NestedChildSpec[]> = {
  [K in keyof T]: T[K] extends NestedChildSpec
    ? NestedChildResult<T[K]>
    : never;
};

export interface BufferWithNestedChildrenResult<
  T extends readonly NestedChildSpec[] = readonly NestedChildSpec[],
> {
  bufferId: Id.Buffer;
  rootNodeId: Id.Node;
  children: NestedChildrenResult<T>;
  windowId: Id.Window;
}

/**
 * Creates a buffer with a root node and nested child nodes.
 * Supports arbitrary depth - children can have children, etc.
 *
 * @example
 * ```ts
 * const { rootNodeId, children } = yield* Given.A_BUFFER_WITH_NESTED_CHILDREN("Root", [
 *   { text: "A", children: [
 *     { text: "A1" },
 *     { text: "A2" },
 *   ]},
 *   { text: "B", children: [
 *     { text: "B1" },
 *   ]},
 * ]);
 *
 * // Type-safe access:
 * children[0].nodeId         // A
 * children[0].children[0].nodeId  // A1
 * children[1].children[0].nodeId  // B1
 * ```
 */
export const A_BUFFER_WITH_NESTED_CHILDREN = <
  const T extends readonly NestedChildSpec[],
>(
  rootText: string,
  childrenSpecs: T,
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

    // Recursive Effect to create nested children
    const createNestedChildren = (
      parentId: Id.Node,
      specs: readonly NestedChildSpec[],
    ): Effect.Effect<
      NestedChildResult<NestedChildSpec>[],
      NodeNotFoundError | NodeInsertError
    > =>
      Effect.gen(function* () {
        const results: NestedChildResult<NestedChildSpec>[] = [];

        for (const spec of specs) {
          const childId = yield* Node.insertNode({
            parentId,
            insert: "after",
          });

          // Set child text in Yjs
          Yjs.getText(childId).insert(0, spec.text);

          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const result: any = { nodeId: childId };

          // Recursively create nested children if present
          if (spec.children && spec.children.length > 0) {
            result.children = yield* createNestedChildren(
              childId,
              spec.children,
            );
          }

          results.push(result);
        }

        return results;
      });

    const childResults = yield* createNestedChildren(rootNodeId, childrenSpecs);

    return {
      bufferId,
      rootNodeId,
      children: childResults as NestedChildrenResult<T>,
      windowId,
    };
  }).pipe(Effect.withSpan("Given.A_BUFFER_WITH_NESTED_CHILDREN"));

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

/**
 * Sets buffer cursor (collapsed selection) to a specific position in a node.
 * @param assoc - Cursor association at wrap boundaries: -1 = end of prev line, 0 = no preference, 1 = start of next line
 */
export const BUFFER_HAS_CURSOR = (
  bufferId: Id.Buffer,
  nodeId: Id.Node,
  offset: number,
  assoc: -1 | 0 | 1 = 0,
) =>
  Effect.gen(function* () {
    const Buffer = yield* BufferT;
    yield* Buffer.setSelection(
      bufferId,
      Option.some({
        anchor: { nodeId },
        anchorOffset: offset,
        focus: { nodeId },
        focusOffset: offset,
        goalX: null,
        goalLine: null,
        assoc,
      }),
    );
  }).pipe(Effect.withSpan("Given.BUFFER_HAS_CURSOR"));

/**
 * Sets buffer selection to a range (anchor ≠ focus).
 * Can span across nodes for multi-block selection.
 */
export const BUFFER_HAS_SELECTION = (
  bufferId: Id.Buffer,
  anchor: { nodeId: Id.Node; offset: number },
  focus: { nodeId: Id.Node; offset: number },
) =>
  Effect.gen(function* () {
    const Buffer = yield* BufferT;
    yield* Buffer.setSelection(
      bufferId,
      Option.some({
        anchor: { nodeId: anchor.nodeId },
        anchorOffset: anchor.offset,
        focus: { nodeId: focus.nodeId },
        focusOffset: focus.offset,
        goalX: null,
        goalLine: null,
        assoc: 0,
      }),
    );
  }).pipe(Effect.withSpan("Given.BUFFER_HAS_SELECTION"));

/**
 * Sets the window's active element.
 * Use Entity helpers to construct the element:
 * - Block: { id: blockId, type: "block" }
 * - Title: { bufferId, type: "title" }
 */
export const ACTIVE_ELEMENT_IS = (element: Entity.Element) =>
  Effect.gen(function* () {
    const Window = yield* WindowT;
    yield* Window.setActiveElement(Option.some(element));
  }).pipe(Effect.withSpan("Given.ACTIVE_ELEMENT_IS"));

/** Mark types for text formatting */
export type MarkType = "bold" | "italic" | "code";

/**
 * Applies a formatting mark to a range in a node's Y.Text.
 * Used to set up test state with pre-existing formatting.
 */
export const NODE_HAS_MARK = (
  nodeId: Id.Node,
  index: number,
  length: number,
  mark: MarkType,
) =>
  Effect.gen(function* () {
    const Yjs = yield* YjsT;
    const ytext = Yjs.getText(nodeId);
    ytext.format(index, length, { [mark]: true });
  }).pipe(Effect.withSpan(`Given.NODE_HAS_MARK(${mark})`));

/** Convenience wrapper for bold formatting */
export const NODE_HAS_BOLD = (nodeId: Id.Node, index: number, length: number) =>
  NODE_HAS_MARK(nodeId, index, length, "bold");

/** Convenience wrapper for italic formatting */
export const NODE_HAS_ITALIC = (
  nodeId: Id.Node,
  index: number,
  length: number,
) => NODE_HAS_MARK(nodeId, index, length, "italic");

/** Convenience wrapper for code formatting */
export const NODE_HAS_CODE = (nodeId: Id.Node, index: number, length: number) =>
  NODE_HAS_MARK(nodeId, index, length, "code");

export interface BufferWithParentAndChildrenResult<
  T extends readonly ChildSpec[] = readonly ChildSpec[],
> {
  bufferId: Id.Buffer;
  parentNodeId: Id.Node;
  rootNodeId: Id.Node;
  childNodeIds: ToNodeIds<T>;
  windowId: Id.Window;
}

/**
 * Creates a buffer whose root node has a parent (not visible in buffer).
 * Structure:
 * - parentNode (not visible in buffer)
 *   - rootNode (buffer's assignedNodeId)
 *     - children...
 *
 * Useful for testing edge cases where buffer root is not a top-level node.
 */
export const A_BUFFER_WITH_PARENT_AND_CHILDREN = <
  const T extends readonly ChildSpec[],
>(
  parentText: string,
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
    const parentNodeId = Id.Node.make(nanoid());

    // Create parent node in LiveStore (grandparent from buffer's perspective)
    yield* Store.commit(
      events.nodeCreated({
        timestamp: Date.now(),
        data: { nodeId: parentNodeId },
      }),
    );
    Yjs.getText(parentNodeId).insert(0, parentText);

    // Create root node as child of parent
    const rootNodeId = yield* Node.insertNode({
      parentId: parentNodeId,
      insert: "after",
    });
    Yjs.getText(rootNodeId).insert(0, rootText);

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

    // Create buffer document with assignedNodeId = rootNodeId (not parentNodeId)
    yield* Store.setDocument(
      "buffer",
      {
        windowId,
        parent: { id: paneId, type: "pane" },
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

    // Create child nodes under root
    const childNodeIds: Id.Node[] = [];
    for (const child of children) {
      const childId = yield* Node.insertNode({
        parentId: rootNodeId,
        insert: "after",
      });
      Yjs.getText(childId).insert(0, child.text);
      childNodeIds.push(childId);
    }

    return {
      bufferId,
      parentNodeId,
      rootNodeId,
      childNodeIds: childNodeIds as ToNodeIds<T>,
      windowId,
    };
  }).pipe(Effect.withSpan("Given.A_BUFFER_WITH_PARENT_AND_CHILDREN"));

export interface TypeWithNoColorResult {
  typeId: Id.Node;
}

/**
 * Creates a type without any color configuration.
 * Used for testing TypeColorT fallback to default colors.
 * NOTE: Creates a raw type node (not via TypePicker) to avoid auto-color assignment.
 */
export const A_TYPE_WITHOUT_COLOR = () =>
  Effect.gen(function* () {
    const Store = yield* StoreT;
    const Yjs = yield* YjsT;

    // Create the type as a raw node (not via TypePicker to avoid auto-color)
    const typeId = Id.Node.make(nanoid());
    yield* Store.commit(
      events.nodeCreated({
        timestamp: Date.now(),
        data: { nodeId: typeId, parentId: System.TYPES },
      }),
    );
    Yjs.getText(typeId).insert(0, `NoColorType_${nanoid(6)}`);

    return { typeId } satisfies TypeWithNoColorResult;
  }).pipe(Effect.withSpan("Given.A_TYPE_WITHOUT_COLOR"));

export interface TypeWithFullColorResult {
  typeId: Id.Node;
  colorNodeId: Id.Node;
  bgValueNodeId: Id.Node;
  fgValueNodeId: Id.Node;
  expectedBg: string;
  expectedFg: string;
}

/**
 * Creates a type with a full color node (has both COLOR_HAS_BACKGROUND and COLOR_HAS_FOREGROUND tuples).
 * Used for testing TypeColorT when colors are explicitly defined.
 * NOTE: Creates a raw type node (not via TypePicker) to avoid auto-color assignment.
 */
export const A_TYPE_WITH_FULL_COLOR = (colors: { bg: string; fg: string }) =>
  Effect.gen(function* () {
    const Store = yield* StoreT;
    const Tuple = yield* TupleT;
    const Yjs = yield* YjsT;

    // Create the type as a raw node (not via TypePicker to avoid auto-color)
    const typeId = Id.Node.make(nanoid());
    yield* Store.commit(
      events.nodeCreated({
        timestamp: Date.now(),
        data: { nodeId: typeId, parentId: System.TYPES },
      }),
    );
    Yjs.getText(typeId).insert(0, `ColoredType_${nanoid(6)}`);

    // Create color node
    const colorNodeId = Id.Node.make(nanoid());
    yield* Store.commit(
      events.nodeCreated({
        timestamp: Date.now(),
        data: { nodeId: colorNodeId },
      }),
    );
    Yjs.getText(colorNodeId).insert(0, "Custom Color");

    // Create background value node
    const bgValueNodeId = Id.Node.make(nanoid());
    yield* Store.commit(
      events.nodeCreated({
        timestamp: Date.now(),
        data: { nodeId: bgValueNodeId },
      }),
    );
    Yjs.getText(bgValueNodeId).insert(0, colors.bg);

    // Create foreground value node
    const fgValueNodeId = Id.Node.make(nanoid());
    yield* Store.commit(
      events.nodeCreated({
        timestamp: Date.now(),
        data: { nodeId: fgValueNodeId },
      }),
    );
    Yjs.getText(fgValueNodeId).insert(0, colors.fg);

    // Create COLOR_HAS_BACKGROUND tuple
    yield* Tuple.create(System.COLOR_HAS_BACKGROUND, [
      colorNodeId,
      bgValueNodeId,
    ]);

    // Create COLOR_HAS_FOREGROUND tuple
    yield* Tuple.create(System.COLOR_HAS_FOREGROUND, [
      colorNodeId,
      fgValueNodeId,
    ]);

    // Create TYPE_HAS_COLOR tuple linking type to color node
    yield* Tuple.create(System.TYPE_HAS_COLOR, [typeId, colorNodeId]);

    return {
      typeId,
      colorNodeId,
      bgValueNodeId,
      fgValueNodeId,
      expectedBg: colors.bg,
      expectedFg: colors.fg,
    } satisfies TypeWithFullColorResult;
  }).pipe(Effect.withSpan("Given.A_TYPE_WITH_FULL_COLOR"));

export interface TypeWithDirectColorResult {
  typeId: Id.Node;
  colorValueNodeId: Id.Node;
  expectedBg: string;
}

/**
 * Creates a type with a direct color value node (text content is the oklch color).
 * Foreground will be derived from the background by TypeColorT.
 * NOTE: Creates a raw type node (not via TypePicker) to avoid auto-color assignment.
 */
export const A_TYPE_WITH_DIRECT_COLOR = (bgColor: string) =>
  Effect.gen(function* () {
    const Store = yield* StoreT;
    const Tuple = yield* TupleT;
    const Yjs = yield* YjsT;

    // Create the type as a raw node (not via TypePicker to avoid auto-color)
    const typeId = Id.Node.make(nanoid());
    yield* Store.commit(
      events.nodeCreated({
        timestamp: Date.now(),
        data: { nodeId: typeId, parentId: System.TYPES },
      }),
    );
    Yjs.getText(typeId).insert(0, `DirectColorType_${nanoid(6)}`);

    // Create direct color value node (text content is the color)
    const colorValueNodeId = Id.Node.make(nanoid());
    yield* Store.commit(
      events.nodeCreated({
        timestamp: Date.now(),
        data: { nodeId: colorValueNodeId },
      }),
    );
    Yjs.getText(colorValueNodeId).insert(0, bgColor);

    // Create TYPE_HAS_COLOR tuple linking type to value node directly
    yield* Tuple.create(System.TYPE_HAS_COLOR, [typeId, colorValueNodeId]);

    return {
      typeId,
      colorValueNodeId,
      expectedBg: bgColor,
    } satisfies TypeWithDirectColorResult;
  }).pipe(Effect.withSpan("Given.A_TYPE_WITH_DIRECT_COLOR"));

// =============================================================================
// Tuple Type Setup Helpers
// =============================================================================

export interface TupleTypeWithRoleResult {
  tupleTypeId: Id.Node;
}

/**
 * Creates a tuple type with a role definition.
 * Returns the tuple type node ID for further configuration.
 */
export const A_TUPLE_TYPE_WITH_ROLE = (
  name: string,
  role: { position: number; name: string; required: boolean },
) =>
  Effect.gen(function* () {
    const { nodeId: tupleTypeId } = yield* A_BUFFER_WITH_TEXT(name);
    const Tuple = yield* TupleT;
    yield* Tuple.addRole(tupleTypeId, role.position, role.name, role.required);
    return { tupleTypeId } satisfies TupleTypeWithRoleResult;
  }).pipe(Effect.withSpan("Given.A_TUPLE_TYPE_WITH_ROLE"));

/**
 * Adds an allowed type constraint to an existing tuple type role.
 */
export const TUPLE_TYPE_ALLOWS = (
  tupleTypeId: Id.Node,
  position: number,
  allowedTypeId: Id.Node,
) =>
  Effect.gen(function* () {
    const Tuple = yield* TupleT;
    yield* Tuple.addAllowedType(tupleTypeId, position, allowedTypeId);
  }).pipe(Effect.withSpan("Given.TUPLE_TYPE_ALLOWS"));

export interface TupleInstanceResult {
  tupleId: Id.Tuple;
}

/**
 * Creates a tuple instance with the given members.
 */
export const A_TUPLE_INSTANCE = (
  tupleTypeId: Id.Node,
  members: readonly Id.Node[],
) =>
  Effect.gen(function* () {
    const Tuple = yield* TupleT;
    const tupleId = yield* Tuple.create(tupleTypeId, members);
    return { tupleId } satisfies TupleInstanceResult;
  }).pipe(Effect.withSpan("Given.A_TUPLE_INSTANCE"));
