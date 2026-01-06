import { Id } from "@/schema";
import { NodeT } from "@/services/domain/Node";
import { YjsT } from "@/services/external/Yjs";
import { EditorView } from "@codemirror/view";
import { Effect } from "effect";
import { screen, waitFor } from "solid-testing-library";
import { expect } from "vitest";

/**
 * Gets the block element ID containing the current DOM selection anchor.
 */
const getSelectionBlockId = (): string | null => {
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0) return null;

  const anchorNode = sel.anchorNode;
  if (!anchorNode) return null;

  const element =
    anchorNode.nodeType === Node.ELEMENT_NODE
      ? (anchorNode as Element)
      : anchorNode.parentElement;

  const blockEl = element?.closest("[data-element-id]");
  return blockEl?.getAttribute("data-element-id") ?? null;
};

/**
 * Asserts that the given text is visible on the screen.
 */
export const TEXT_IS_VISIBLE = (text: string) =>
  Effect.promise(() =>
    waitFor(
      () => {
        expect(screen.getByText(text)).toBeTruthy();
      },
      { timeout: 100 },
    ),
  ).pipe(Effect.withSpan("Then.TEXT_IS_VISIBLE"));

/**
 * Asserts that a node has the expected number of children.
 */
export const NODE_HAS_CHILDREN = Effect.fn("Then.NODE_HAS_CHILDREN")(function* (
  nodeId: Id.Node,
  count: number,
) {
  const Node = yield* NodeT;
  const children = yield* Node.getNodeChildren(nodeId);
  expect(children.length).toBe(count);
});

/**
 * Asserts that a node has the expected text content (checks Yjs, not LiveStore).
 */
export const NODE_HAS_TEXT = Effect.fn("Then.NODE_HAS_TEXT")(function* (
  nodeId: Id.Node,
  expectedText: string,
) {
  const Yjs = yield* YjsT;
  const ytext = Yjs.getText(nodeId);
  expect(ytext.toString()).toBe(expectedText);
});

/**
 * Waits for the DOM to have exactly N block elements.
 */
export const BLOCK_COUNT_IS = (count: number) =>
  Effect.promise(() =>
    waitFor(
      () => {
        const blocks = document.querySelectorAll("[data-element-type='block']");
        expect(blocks.length).toBe(count);
      },
      { timeout: 3000 },
    ),
  ).pipe(Effect.withSpan("Then.BLOCK_COUNT_IS"));

/**
 * Asserts that the DOM selection is collapsed and at the expected offset.
 */
export const SELECTION_IS_COLLAPSED_AT_OFFSET = (offset: number) =>
  Effect.promise(() =>
    waitFor(
      () => {
        const sel = window.getSelection();
        expect(sel).not.toBeNull();
        expect(sel!.isCollapsed).toBe(true);
        expect(sel!.anchorOffset).toBe(offset);
      },
      { timeout: 2000 },
    ),
  ).pipe(Effect.withSpan("Then.SELECTION_IS_COLLAPSED_AT_OFFSET"));

/**
 * Asserts that the DOM selection is NOT in the specified block.
 */
export const SELECTION_IS_NOT_ON_BLOCK = (blockId: Id.Block) =>
  Effect.promise(() =>
    waitFor(
      () => {
        const currentBlockId = getSelectionBlockId();
        expect(currentBlockId).not.toBeNull();
        expect(currentBlockId).not.toBe(blockId);
      },
      { timeout: 1000 },
    ),
  ).pipe(Effect.withSpan("Then.SELECTION_IS_NOT_ON_BLOCK"));

/**
 * Asserts that the DOM selection IS in the specified block.
 */
export const SELECTION_IS_ON_BLOCK = (blockId: Id.Block) =>
  Effect.promise(() =>
    waitFor(
      () => {
        const currentBlockId = getSelectionBlockId();
        expect(currentBlockId).toBe(blockId);
      },
      { timeout: 1000 },
    ),
  ).pipe(Effect.withSpan("Then.SELECTION_IS_ON_BLOCK"));

/**
 * Gets the element ID of the title containing the current DOM selection.
 */
const getSelectionTitleId = (): string | null => {
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0) return null;

  const anchorNode = sel.anchorNode;
  if (!anchorNode) return null;

  const element =
    anchorNode.nodeType === Node.ELEMENT_NODE
      ? (anchorNode as Element)
      : anchorNode.parentElement;

  const titleEl = element?.closest("[data-element-type='title']");
  return titleEl?.getAttribute("data-element-id") ?? null;
};

/**
 * Asserts that the DOM selection IS in the title for the specified buffer.
 */
export const SELECTION_IS_ON_TITLE = (bufferId: Id.Buffer) =>
  Effect.sync(() => {
    const currentTitleId = getSelectionTitleId();
    expect(currentTitleId).toBe(bufferId);
  }).pipe(Effect.withSpan("Then.SELECTION_IS_ON_TITLE"));

/**
 * Gets the CodeMirror EditorView from the focused .cm-content element.
 */
const getCodeMirrorView = (): EditorView | null => {
  const cmContent = document.querySelector<HTMLElement>(".cm-content");
  if (!cmContent) return null;
  return EditorView.findFromDOM(cmContent);
};

/**
 * Asserts CodeMirror's selection state (head position, and optionally assoc).
 * Unlike SELECTION_IS_COLLAPSED_AT_OFFSET which uses DOM selection,
 * this checks CodeMirror's internal state directly.
 */
export const CM_CURSOR_IS_AT = (
  expectedHead: number,
  expectedAssoc?: -1 | 0 | 1,
) =>
  Effect.promise(() =>
    waitFor(
      () => {
        const view = getCodeMirrorView();
        expect(view, "CodeMirror view not found").not.toBeNull();

        const sel = view!.state.selection.main;
        expect(sel.head, "cursor head position").toBe(expectedHead);

        if (expectedAssoc !== undefined) {
          expect(sel.assoc, "cursor assoc").toBe(expectedAssoc);
        }
      },
      { timeout: 2000 },
    ),
  ).pipe(Effect.withSpan("Then.CM_CURSOR_IS_AT"));
