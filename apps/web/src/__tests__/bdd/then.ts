import { tables } from "@/livestore/schema";
import { Id } from "@/schema";
import { NodeT } from "@/services/domain/Node";
import { StoreT } from "@/services/external/Store";
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
export const NODE_HAS_CHILDREN = Effect.fn("Then.NODE_HAS_CHILDREN")(
  function* (nodeId: Id.Node, count: number) {
    const Node = yield* NodeT;
    const children = yield* Node.getNodeChildren(nodeId);
    expect(children.length).toBe(count);
  },
);

/**
 * Asserts that a node has the expected text content.
 */
export const NODE_HAS_TEXT = Effect.fn("Then.NODE_HAS_TEXT")(
  function* (nodeId: Id.Node, expectedText: string) {
    const Store = yield* StoreT;
    // When selecting a single column, LiveStore returns the value directly
    const textContent = yield* Store.query(
      tables.nodes
        .select("textContent")
        .where({ id: nodeId })
        .first({ fallback: () => null }),
    );
    if (textContent === null) {
      throw new Error(`Node ${nodeId} not found`);
    }
    expect(textContent).toBe(expectedText);
  },
);

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
  Effect.sync(() => {
    const sel = window.getSelection();
    expect(sel).not.toBeNull();
    expect(sel!.isCollapsed).toBe(true);
    expect(sel!.anchorOffset).toBe(offset);
  }).pipe(Effect.withSpan("Then.SELECTION_IS_COLLAPSED_AT_OFFSET"));

/**
 * Asserts that the DOM selection is NOT in the specified block.
 */
export const SELECTION_IS_NOT_ON_BLOCK = (blockId: Id.Block) =>
  Effect.sync(() => {
    const currentBlockId = getSelectionBlockId();
    expect(currentBlockId).not.toBeNull();
    expect(currentBlockId).not.toBe(blockId);
  }).pipe(Effect.withSpan("Then.SELECTION_IS_NOT_ON_BLOCK"));
