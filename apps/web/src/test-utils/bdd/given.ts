import { events } from "@/livestore/schema";
import { Entity, Id, System } from "@/schema";
import { posAtCoordsInElement } from "@/services/browser/TextBlock";
import { getVisualLines } from "@/services/browser/TextBlock/getVisualLines";
import { NodeT } from "@/services/domain/Node";
import { TupleT } from "@/services/domain/Tuple";
import { TypeT } from "@/services/domain/Type";
import { AutomergeT } from "@/services/external/Automerge";
import { StoreT } from "@/services/external/Store";
import { FrameT } from "@/services/ui/Frame";
import { doubleRaf } from "@/utils/effect";
import { EditorSelection } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { screen } from "@testing-library/dom";
import { Effect, Option } from "effect";
import { nanoid } from "nanoid";

export interface FrameWithNodeResult {
  frameId: Id.Frame;
  nodeId: Id.Node;
  worldId: Id.World;
  textContent: string;
}

/**
 * Creates a frame with an assigned node containing the given text.
 * Sets up the minimal required documents: world, frame, node.
 */
export const A_FRAME_WITH_TEXT = (textContent: string) =>
  Effect.gen(function* () {
    const Store = yield* StoreT;
    const Automerge = yield* AutomergeT;

    const worldId = Id.World.make(yield* Store.getSessionId());
    const frameId = Id.Frame.make(nanoid());
    const nodeId = Id.Node.make(nanoid());

    // Create node in LiveStore
    yield* Store.commit(
      events.nodeCreated({
        timestamp: Date.now(),
        data: { nodeId },
      }),
    );

    // Set text content in Automerge
    yield* Automerge.setText(nodeId, textContent);

    // Create world document (required for active element tracking)
    yield* Store.setDocument(
      "world",
      {
        panes: [],
      },
      worldId,
    );

    // Create frame document
    yield* Store.setDocument(
      "frame",
      {
        worldId,
        parent: { id: Id.Pane.make("test-pane"), type: "pane" },
        assignedKhoraId: nodeId,
        toggledNodes: [],
        popup: null,
      },
      frameId,
    );

    return {
      frameId,
      nodeId,
      worldId,
      textContent,
    } satisfies FrameWithNodeResult;
  }).pipe(Effect.withSpan("Given.A_FRAME_WITH_TEXT"));

export interface ChildSpec {
  text: string;
}

/** Maps a tuple of ChildSpec to a tuple of Id.Node with matching length */
type ToNodeIds<T extends readonly ChildSpec[]> = { [K in keyof T]: Id.Node };

export interface FrameWithChildrenResult<
  T extends readonly ChildSpec[] = readonly ChildSpec[],
> {
  frameId: Id.Frame;
  rootNodeId: Id.Node;
  childNodeIds: ToNodeIds<T>;
  worldId: Id.World;
}

/**
 * Creates a frame with a root node and child nodes.
 * Uses NodeT.insertNode to create children with proper positioning.
 */
export const A_FRAME_WITH_CHILDREN = <const T extends readonly ChildSpec[]>(
  rootText: string,
  children: T,
) =>
  Effect.gen(function* () {
    const Store = yield* StoreT;
    const Node = yield* NodeT;
    const Automerge = yield* AutomergeT;

    const worldId = Id.World.make(yield* Store.getSessionId());
    const frameId = Id.Frame.make(nanoid());
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

    // Create world document
    yield* Store.setDocument(
      "world",
      {
        panes: [],
      },
      worldId,
    );

    // Create frame document
    yield* Store.setDocument(
      "frame",
      {
        worldId,
        parent: { id: Id.Pane.make("test-pane"), type: "pane" },
        assignedKhoraId: rootNodeId,
        toggledNodes: [],
        popup: null,
      },
      frameId,
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
      frameId,
      rootNodeId,
      childNodeIds: childNodeIds as ToNodeIds<T>,
      worldId,
    };
  }).pipe(Effect.withSpan("Given.A_FRAME_WITH_CHILDREN"));

/**
 * Creates a property node under System.SCHEMA with the given Automerge text.
 * Mirrors the real Property.createProperty shape minus tuple wiring — which
 * callers of this helper (setSelection, enterKhoraEditing, Khora.subscribe —
 * propertyTitle variant) don't exercise.
 */
export const A_PROPERTY_WITH_TEXT = (text: string) =>
  Effect.gen(function* () {
    const Store = yield* StoreT;
    const Automerge = yield* AutomergeT;

    const propertyId = Id.Node.make(nanoid());
    yield* Store.commit(
      events.nodeCreated({
        timestamp: Date.now(),
        data: { nodeId: propertyId, parentId: System.SCHEMA, position: "a0" },
      }),
    );
    yield* Automerge.setText(propertyId, text);
    return propertyId;
  }).pipe(Effect.withSpan("Given.A_PROPERTY_WITH_TEXT"));

export interface FrameWithPropertyTitleSelectedResult {
  frameId: Id.Frame;
  hostNodeId: Id.Node;
  propertyId: Id.Node;
  propertyTitleKhoraId: Id.Khora;
  worldId: Id.World;
}

/**
 * Creates a frame + property and drives world/frame state directly into
 * khora-selection mode with the propertyTitle as the anchor/focus.
 *
 * Writes the docs via StoreT instead of going through Frame.setKhoraSelection
 * because the latter runs ancestor expansion on the selected node — irrelevant
 * noise when the selection is a property that lives outside the outline tree.
 */
export const A_FRAME_WITH_PROPERTY_TITLE_SELECTED = (opts: {
  hostText: string;
  titleText: string;
}) =>
  Effect.gen(function* () {
    const { frameId, nodeId: hostNodeId, worldId } =
      yield* A_FRAME_WITH_TEXT(opts.hostText);
    const propertyId = yield* A_PROPERTY_WITH_TEXT(opts.titleText);
    const propertyTitleKhoraId = Id.makePropertyTitleKhoraId(
      frameId,
      hostNodeId,
      propertyId,
    );

    const Store = yield* StoreT;

    const currentWorld = yield* Store.getDocument("world", worldId);
    yield* Store.setDocument(
      "world",
      {
        ...Option.getOrThrow(currentWorld),
        activeRegion: "stage",
        activeFrameId: frameId,
      },
      worldId,
    );

    const currentFrame = yield* Store.getDocument("frame", frameId);
    yield* Store.setDocument(
      "frame",
      {
        ...Option.getOrThrow(currentFrame),
        activePart: "khora" as const,
        activeKhoraId: null,
        selectedKhoras: [propertyTitleKhoraId],
        khoraSelectionAnchor: propertyTitleKhoraId,
        khoraSelectionFocus: propertyTitleKhoraId,
      },
      frameId,
    );

    return {
      frameId,
      hostNodeId,
      propertyId,
      propertyTitleKhoraId,
      worldId,
    } satisfies FrameWithPropertyTitleSelectedResult;
  }).pipe(Effect.withSpan("Given.A_FRAME_WITH_PROPERTY_TITLE_SELECTED"));

/**
 * Sets the frame container to a specific width.
 * Useful for testing line wrapping behavior.
 */
export const FRAME_HAS_WIDTH = (width: number) =>
  Effect.promise(async () => {
    const frame = await screen.findByTestId("frame");
    frame.style.width = `${width}px`;
    frame.style.maxWidth = `${width}px`; // Also set max-width to prevent overflow
    // Force reflow so text wrapping takes effect before we continue
    void frame.offsetHeight;
    // Wait for two animation frames to ensure layout is fully complete
    await new Promise((r) => requestAnimationFrame(r));
    await new Promise((r) => requestAnimationFrame(r));
  }).pipe(Effect.withSpan("Given.FRAME_HAS_WIDTH"));

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

export interface FullHierarchyResult {
  frameId: Id.Frame;
  nodeId: Id.Node;
  paneId: Id.Pane;
  worldId: Id.World;
  textContent: string;
}

/**
 * Creates the full world → pane → frame → node hierarchy.
 * Required for NavigationT tests which look up frame via world.panes[0].
 */
export const A_FULL_HIERARCHY_WITH_TEXT = (textContent: string) =>
  Effect.gen(function* () {
    const Store = yield* StoreT;
    const Automerge = yield* AutomergeT;

    const worldId = Id.World.make(yield* Store.getSessionId());
    const paneId = Id.Pane.make(nanoid());
    const frameId = Id.Frame.make(nanoid());
    const nodeId = Id.Node.make(nanoid());

    // Create node in LiveStore
    yield* Store.commit(
      events.nodeCreated({
        timestamp: Date.now(),
        data: { nodeId },
      }),
    );

    // Set text in Automerge
    yield* Automerge.setText(nodeId, textContent);

    // Create world document with pane reference
    yield* Store.setDocument(
      "world",
      {
        panes: [paneId],
      },
      worldId,
    );

    // Create pane document with frame reference
    yield* Store.setDocument(
      "pane",
      {
        parent: { id: worldId, type: "world" },
        frames: [frameId],
      },
      paneId,
    );

    // Create frame document (assignedKhoraId starts as null for navigation tests)
    yield* Store.setDocument(
      "frame",
      {
        worldId,
        parent: { id: paneId, type: "pane" },
        assignedKhoraId: null,
        toggledNodes: [],
        popup: null,
      },
      frameId,
    );

    return {
      frameId,
      nodeId,
      paneId,
      worldId,
      textContent,
    } satisfies FullHierarchyResult;
  }).pipe(Effect.withSpan("Given.A_FULL_HIERARCHY_WITH_TEXT"));

export interface FullHierarchyWithChildrenResult<
  T extends readonly ChildSpec[] = readonly ChildSpec[],
> {
  frameId: Id.Frame;
  rootNodeId: Id.Node;
  childNodeIds: ToNodeIds<T>;
  paneId: Id.Pane;
  worldId: Id.World;
}

/**
 * Creates the full world → pane → frame → node hierarchy with child nodes.
 * Required for NavigationT tests which look up frame via world.panes[0].
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
    const Automerge = yield* AutomergeT;

    const worldId = Id.World.make(yield* Store.getSessionId());
    const paneId = Id.Pane.make(nanoid());
    const frameId = Id.Frame.make(nanoid());
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

    // Create world document with pane reference
    yield* Store.setDocument(
      "world",
      {
        panes: [paneId],
      },
      worldId,
    );

    // Create pane document with frame reference
    yield* Store.setDocument(
      "pane",
      {
        parent: { id: worldId, type: "world" },
        frames: [frameId],
      },
      paneId,
    );

    // Create frame document
    yield* Store.setDocument(
      "frame",
      {
        worldId,
        parent: { id: paneId, type: "pane" },
        assignedKhoraId: rootNodeId,
        toggledNodes: [],
        popup: null,
      },
      frameId,
    );

    // Create child nodes using NodeT.insertNode
    const childNodeIds: Id.Node[] = [];
    for (const child of children) {
      const childId = yield* Node.insertNode({
        parentId: rootNodeId,
        insert: "after",
      });
      // Set child text in Automerge
      yield* Automerge.setText(childId, child.text);
      childNodeIds.push(childId);
    }

    return {
      frameId,
      rootNodeId,
      childNodeIds: childNodeIds as ToNodeIds<T>,
      paneId,
      worldId,
    };
  }).pipe(Effect.withSpan("Given.A_FULL_HIERARCHY_WITH_CHILDREN"));

/**
 * Sets frame cursor (collapsed selection) to a specific position in a node.
 * @param assoc - Cursor association at wrap boundaries: -1 = end of prev line, 0 = no preference, 1 = start of next line
 */
export const FRAME_HAS_CURSOR = (
  frameId: Id.Frame,
  nodeId: Id.Node,
  offset: number,
  assoc: -1 | 0 | 1 = 0,
) =>
  Effect.gen(function* () {
    const Frame = yield* FrameT;
    const elementId = Id.makeFrameKhoraId(frameId, nodeId);
    yield* Frame.setSelection(
      frameId,
      Option.some({
        khoraId: elementId,
        selection: {
          anchor: offset,
          head: offset,
          assoc,
        },
        goalX: null,
        goalLine: null,
      }),
    );
  }).pipe(Effect.withSpan("Given.FRAME_HAS_CURSOR"));

/**
 * Sets frame selection to a range within a single block.
 */
export const FRAME_HAS_SELECTION = (
  frameId: Id.Frame,
  anchor: { nodeId: Id.Node; offset: number },
  focus: { nodeId: Id.Node; offset: number },
) =>
  Effect.gen(function* () {
    const Frame = yield* FrameT;
    if (anchor.nodeId !== focus.nodeId) {
      throw new Error(
        "FRAME_HAS_SELECTION only supports one-khora selection; use khora selection helpers for multi-block state.",
      );
    }
    const khoraId = Id.makeFrameKhoraId(frameId, anchor.nodeId);
    yield* Frame.setSelection(
      frameId,
      Option.some({
        khoraId,
        selection: {
          anchor: anchor.offset,
          head: focus.offset,
          assoc: 0,
        },
        goalX: null,
        goalLine: null,
      }),
    );
  }).pipe(Effect.withSpan("Given.FRAME_HAS_SELECTION"));

/**
 * Sets the window's active element.
 * Use Entity helpers to construct the element:
 * - Block: { id: khoraId, type: "khora" }
 * - Title: Use Block with title's khoraId (Id.makeFrameKhoraId(frameId, titleNodeId))
 */
export const ACTIVE_ELEMENT_IS = (element: Entity.Element) =>
  Effect.gen(function* () {
    const Frame = yield* FrameT;

    switch (element.type) {
      case "khora":
        yield* Frame.enterKhoraEditing(element.id);
        return;
      case "frame":
        yield* Frame.enterKhoraSelection(element.id);
        return;
      case "title": {
        const assignedKhoraId = yield* Frame.getAssignedKhoraId(element.frameId);
        if (assignedKhoraId == null) return;
        const titleBlockId = Id.makeFrameKhoraId(
          element.frameId,
          assignedKhoraId,
        );
        yield* Frame.enterKhoraEditing(titleBlockId);
        return;
      }
      default:
        return;
    }
  }).pipe(Effect.withSpan("Given.ACTIVE_ELEMENT_IS"));

/**
 * Sets up a block as focused with cursor at a specific position.
 * Combines frame selection + active element setting in one helper.
 * @param assoc - Cursor association at wrap boundaries: -1 = end of prev line, 0 = no preference, 1 = start of next line
 */
export const KHORA_IS_FOCUSED_AT = (
  khoraId: Id.Khora,
  offset: number,
  assoc: -1 | 0 | 1 = 0,
  opts?: { goalX?: number | null },
) =>
  Effect.gen(function* () {
    const Frame = yield* FrameT;

    yield* Effect.async<void>((resume) => {
      const timeout = requestAnimationFrame(() =>
        requestAnimationFrame(() => {
          resume(
            Frame.enterKhoraEditing(khoraId, {
              anchor: offset,
              head: offset,
              assoc,
              goalX: opts?.goalX ?? null,
            }),
          );
        }),
      );

      return Effect.sync(() => clearTimeout(timeout));
    });
  }).pipe(Effect.withSpan("Given.KHORA_IS_FOCUSED_AT"));

/**
 * Queries the character offset and assoc at the start or end of a visual line.
 * Uses posAtCoordsInElement so assoc correctly disambiguates wrap boundaries.
 */
export const VISUAL_LINE_OFFSET = (
  khoraId: Id.Khora,
  opts: { line: number; side: "start" | "end" },
) =>
  Effect.gen(function* () {
    const blockEl = document.querySelector<HTMLElement>(
      `[data-element-id="${khoraId}"]`,
    );
    if (!blockEl) throw new Error(`Block element not found: ${khoraId}`);

    const textEl =
      blockEl.querySelector<HTMLElement>(".cm-line") ??
      blockEl.querySelector<HTMLElement>("p");
    if (!textEl) throw new Error("No text element found in block");

    const lines = yield* getVisualLines(textEl);
    const line = lines.find((l) => l.lineNumber === opts.line);
    if (!line) {
      throw new Error(
        `Block has ${lines.length} visual lines, requested line ${opts.line}`,
      );
    }

    const x = opts.side === "start" ? line.left : line.right;
    const y = (line.top + line.bottom) / 2;
    const pos = posAtCoordsInElement(textEl, x, y);
    if (!pos) {
      throw new Error(
        `Could not determine offset at ${opts.side} of visual line ${opts.line}`,
      );
    }

    return pos;
  }).pipe(Effect.withSpan("Given.VISUAL_LINE_OFFSET"));

/**
 * Focuses a block and places cursor at the start or end of a visual line.
 * Requires the block to be rendered (call after render + FRAME_HAS_WIDTH).
 * Errors if the block has fewer visual lines than requested.
 * Returns the computed { offset, assoc }.
 */
export const KHORA_IS_FOCUSED_AT_VISUAL_LINE = (
  khoraId: Id.Khora,
  opts: { line: number; side: "start" | "end" },
) =>
  Effect.gen(function* () {
    const Frame = yield* FrameT;

    // Mount the editor by focusing at offset 0, then wait for CM to render
    yield* KHORA_IS_FOCUSED_AT(khoraId, 0);
    yield* doubleRaf;

    const { offset, assoc } = yield* VISUAL_LINE_OFFSET(khoraId, opts);

    // Dispatch directly to CodeMirror so its internal state matches
    const cmContent = document.querySelector<HTMLElement>(".cm-content");
    const view = cmContent && EditorView.findFromDOM(cmContent);
    if (!view) throw new Error("No CodeMirror view found");
    view.dispatch({
      selection: EditorSelection.create([
        EditorSelection.cursor(offset, assoc),
      ]),
    });

    // Keep frame state in sync
    const [frameId] = yield* Id.parseKhoraId(khoraId);
    yield* Frame.setSelection(
      frameId,
      Option.some({
        khoraId,
        selection: {
          anchor: offset,
          head: offset,
          assoc,
        },
        goalX: null,
        goalLine: null,
      }),
    );

    return { offset, assoc };
  }).pipe(Effect.withSpan("Given.KHORA_IS_FOCUSED_AT_VISUAL_LINE"));

/**
 * Sets up a title as focused with cursor at a specific position.
 * Combines frame selection + active element setting for titles.
 */
export const TITLE_IS_FOCUSED_AT = (
  frameId: Id.Frame,
  rootNodeId: Id.Node,
  offset: number,
) =>
  Effect.gen(function* () {
    const Frame = yield* FrameT;

    const elementId = Id.makeFrameKhoraId(frameId, rootNodeId);

    yield* Effect.async<void>((resume) => {
      const timeout = requestAnimationFrame(() =>
        requestAnimationFrame(() => {
          resume(
            Frame.enterKhoraEditing(elementId, {
              anchor: offset,
              head: offset,
            }),
          );
        }),
      );

      return Effect.sync(() => clearTimeout(timeout));
    });
  }).pipe(Effect.withSpan("Given.TITLE_IS_FOCUSED_AT"));

/** Mark types for text formatting */
export type MarkType = "bold" | "italic" | "code";

/**
 * Applies a formatting mark to a range in a node's text.
 * NOTE: Automerge stores plain strings, so rich text formatting requires
 * a different approach (e.g., storing marks separately or using a rich text library).
 * This is a stub that logs a warning - formatting tests need to be updated.
 */
export const NODE_HAS_MARK = (
  _nodeId: Id.Node,
  _index: number,
  _length: number,
  mark: MarkType,
) =>
  Effect.gen(function* () {
    yield* Effect.logWarning(
      `NODE_HAS_MARK(${mark}) called but Automerge stores plain strings. ` +
        `Formatting tests need to be updated for the new text storage approach.`,
    );
    // No-op: Automerge doesn't support rich text formatting in the same way
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

export interface FrameWithParentAndChildrenResult<
  T extends readonly ChildSpec[] = readonly ChildSpec[],
> {
  frameId: Id.Frame;
  parentNodeId: Id.Node;
  rootNodeId: Id.Node;
  childNodeIds: ToNodeIds<T>;
  worldId: Id.World;
}

/**
 * Creates a frame whose root node has a parent (not visible in frame).
 * Structure:
 * - parentNode (not visible in frame)
 *   - rootNode (frame's assignedKhoraId)
 *     - children...
 *
 * Useful for testing edge cases where frame root is not a top-level node.
 */
export const A_FRAME_WITH_PARENT_AND_CHILDREN = <
  const T extends readonly ChildSpec[],
>(
  parentText: string,
  rootText: string,
  children: T,
) =>
  Effect.gen(function* () {
    const Store = yield* StoreT;
    const Node = yield* NodeT;
    const Automerge = yield* AutomergeT;

    const worldId = Id.World.make(yield* Store.getSessionId());
    const paneId = Id.Pane.make(nanoid());
    const frameId = Id.Frame.make(nanoid());
    const parentNodeId = Id.Node.make(nanoid());

    // Create parent node in LiveStore (grandparent from frame's perspective)
    yield* Store.commit(
      events.nodeCreated({
        timestamp: Date.now(),
        data: { nodeId: parentNodeId },
      }),
    );
    yield* Automerge.setText(parentNodeId, parentText);

    // Create root node as child of parent
    const rootNodeId = yield* Node.insertNode({
      parentId: parentNodeId,
      insert: "after",
    });
    yield* Automerge.setText(rootNodeId, rootText);

    // Create world document with pane reference
    yield* Store.setDocument(
      "world",
      {
        panes: [paneId],
      },
      worldId,
    );

    // Create pane document with frame reference
    yield* Store.setDocument(
      "pane",
      {
        parent: { id: worldId, type: "world" },
        frames: [frameId],
      },
      paneId,
    );

    // Create frame document with assignedKhoraId = rootNodeId (not parentNodeId)
    yield* Store.setDocument(
      "frame",
      {
        worldId,
        parent: { id: paneId, type: "pane" },
        assignedKhoraId: rootNodeId,
        toggledNodes: [],
        popup: null,
      },
      frameId,
    );

    // Create child nodes under root
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
      frameId,
      parentNodeId,
      rootNodeId,
      childNodeIds: childNodeIds as ToNodeIds<T>,
      worldId,
    };
  }).pipe(Effect.withSpan("Given.A_FRAME_WITH_PARENT_AND_CHILDREN"));

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
    const Automerge = yield* AutomergeT;

    // Create the type as a raw node (not via TypePicker to avoid auto-color)
    const typeId = Id.Node.make(nanoid());
    yield* Store.commit(
      events.nodeCreated({
        timestamp: Date.now(),
        data: { nodeId: typeId, parentId: System.SCHEMA },
      }),
    );
    yield* Automerge.setText(typeId, `NoColorType_${nanoid(6)}`);

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
    const Automerge = yield* AutomergeT;

    // Create the type as a raw node (not via TypePicker to avoid auto-color)
    const typeId = Id.Node.make(nanoid());
    yield* Store.commit(
      events.nodeCreated({
        timestamp: Date.now(),
        data: { nodeId: typeId, parentId: System.SCHEMA },
      }),
    );
    yield* Automerge.setText(typeId, `ColoredType_${nanoid(6)}`);

    // Create color node
    const colorNodeId = Id.Node.make(nanoid());
    yield* Store.commit(
      events.nodeCreated({
        timestamp: Date.now(),
        data: { nodeId: colorNodeId },
      }),
    );
    yield* Automerge.setText(colorNodeId, "Custom Color");

    // Create background value node
    const bgValueNodeId = Id.Node.make(nanoid());
    yield* Store.commit(
      events.nodeCreated({
        timestamp: Date.now(),
        data: { nodeId: bgValueNodeId },
      }),
    );
    yield* Automerge.setText(bgValueNodeId, colors.bg);

    // Create foreground value node
    const fgValueNodeId = Id.Node.make(nanoid());
    yield* Store.commit(
      events.nodeCreated({
        timestamp: Date.now(),
        data: { nodeId: fgValueNodeId },
      }),
    );
    yield* Automerge.setText(fgValueNodeId, colors.fg);

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
    const Automerge = yield* AutomergeT;

    // Create the type as a raw node (not via TypePicker to avoid auto-color)
    const typeId = Id.Node.make(nanoid());
    yield* Store.commit(
      events.nodeCreated({
        timestamp: Date.now(),
        data: { nodeId: typeId, parentId: System.SCHEMA },
      }),
    );
    yield* Automerge.setText(typeId, `DirectColorType_${nanoid(6)}`);

    // Create direct color value node (text content is the color)
    const colorValueNodeId = Id.Node.make(nanoid());
    yield* Store.commit(
      events.nodeCreated({
        timestamp: Date.now(),
        data: { nodeId: colorValueNodeId },
      }),
    );
    yield* Automerge.setText(colorValueNodeId, bgColor);

    // Create TYPE_HAS_COLOR tuple linking type to value node directly
    yield* Tuple.create(System.TYPE_HAS_COLOR, [typeId, colorValueNodeId]);

    return {
      typeId,
      colorValueNodeId,
      expectedBg: bgColor,
    } satisfies TypeWithDirectColorResult;
  }).pipe(Effect.withSpan("Given.A_TYPE_WITH_DIRECT_COLOR"));

export interface ChatFrameResult {
  frameId: Id.Frame;
  chatNodeId: Id.Node;
  worldId: Id.World;
}

export const A_CHAT_FRAME = () =>
  Effect.gen(function* () {
    const { frameId, rootNodeId, worldId } = yield* A_FRAME_WITH_CHILDREN(
      "Chat",
      [],
    );

    return {
      frameId,
      chatNodeId: rootNodeId,
      worldId,
    } satisfies ChatFrameResult;
  }).pipe(Effect.withSpan("Given.A_CHAT_FRAME"));

export const A_CHAT_MESSAGE = (
  chatNodeId: Id.Node,
  fractionalIndex: string,
  roleTypeId: Id.Node,
) =>
  Effect.gen(function* () {
    const Node = yield* NodeT;
    const Tuple = yield* TupleT;
    const Type = yield* TypeT;

    const msgNodeId = yield* Node.insertNode({
      parentId: chatNodeId,
      insert: "after",
    });

    yield* Tuple.create(
      System.CHAT_HAS_MESSAGE,
      [chatNodeId, msgNodeId],
      ["", fractionalIndex],
    );

    yield* Type.addType(msgNodeId, roleTypeId);

    return msgNodeId;
  }).pipe(Effect.withSpan("Given.A_CHAT_MESSAGE"));

export const AN_UNTYPED_CHAT_MESSAGE = (
  chatNodeId: Id.Node,
  fractionalIndex: string,
) =>
  Effect.gen(function* () {
    const Node = yield* NodeT;
    const Tuple = yield* TupleT;

    const msgNodeId = yield* Node.insertNode({
      parentId: chatNodeId,
      insert: "after",
    });

    yield* Tuple.create(
      System.CHAT_HAS_MESSAGE,
      [chatNodeId, msgNodeId],
      ["", fractionalIndex],
    );

    return msgNodeId;
  }).pipe(Effect.withSpan("Given.AN_UNTYPED_CHAT_MESSAGE"));
