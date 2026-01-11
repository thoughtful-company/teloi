import { Id } from "@/schema";
import { NodeT } from "@/services/domain/Node";
import { StoreT } from "@/services/external/Store";
import { YjsT } from "@/services/external/Yjs";
import { EditorView } from "@codemirror/view";
import { Data, Effect, Option, Schedule } from "effect";
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
 * Asserts that a node's children are in the expected order.
 */
export const CHILDREN_ORDER_IS = Effect.fn("Then.CHILDREN_ORDER_IS")(function* (
  parentId: Id.Node,
  expectedOrder: readonly Id.Node[],
) {
  const Node = yield* NodeT;
  const actualChildren = yield* Node.getNodeChildren(parentId);

  expect(actualChildren.length).toBe(expectedOrder.length);

  for (let i = 0; i < expectedOrder.length; i++) {
    expect(actualChildren[i]).toBe(expectedOrder[i]);
  }
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

/** Typed error for assertion failures that can be retried */
class AssertionError extends Data.TaggedError("AssertionError")<{
  cause: unknown;
}> {}

/**
 * Asserts that the buffer has exactly the specified blocks selected.
 * Checks both the selectedBlocks array and optionally anchor/focus.
 * Uses Effect-native retry instead of waitFor for proper Effect composition.
 */
export const BLOCKS_ARE_SELECTED = (
  bufferId: Id.Buffer,
  expectedNodeIds: Id.Node[],
  options?: { anchor?: Id.Node; focus?: Id.Node },
) =>
  Effect.gen(function* () {
    const Store = yield* StoreT;
    const bufferDoc = yield* Store.getDocument("buffer", bufferId);

    yield* Effect.try({
      try: () => {
        expect(Option.isSome(bufferDoc)).toBe(true);
        const buf = Option.getOrThrow(bufferDoc);

        expect(buf.selectedBlocks).toHaveLength(expectedNodeIds.length);
        for (const nodeId of expectedNodeIds) {
          expect(buf.selectedBlocks).toContain(nodeId);
        }

        if (options?.anchor !== undefined) {
          expect(buf.blockSelectionAnchor).toBe(options.anchor);
        }
        if (options?.focus !== undefined) {
          expect(buf.blockSelectionFocus).toBe(options.focus);
        }
      },
      catch: (cause) => new AssertionError({ cause }),
    });
  }).pipe(
    Effect.retry(Schedule.spaced("50 millis").pipe(Schedule.upTo("2 seconds"))),
    Effect.withSpan("Then.BLOCKS_ARE_SELECTED"),
  );

/**
 * Asserts that the clipboard contains the expected text.
 * Requires clipboard mock to be set up in the test.
 */
export const CLIPBOARD_CONTAINS = (expectedText: string) =>
  Effect.promise(() =>
    waitFor(
      async () => {
        const clipboardText = await navigator.clipboard.readText();
        expect(clipboardText).toBe(expectedText);
      },
      { timeout: 2000 },
    ),
  ).pipe(Effect.withSpan("Then.CLIPBOARD_CONTAINS"));

/**
 * Asserts that a node has bold formatting at the specified range.
 * Checks the Y.Text deltas to verify bold attribute is present.
 */
export const NODE_HAS_BOLD_AT = Effect.fn("Then.NODE_HAS_BOLD_AT")(function* (
  nodeId: Id.Node,
  index: number,
  length: number,
) {
  const Yjs = yield* YjsT;
  const ytext = Yjs.getText(nodeId);
  const deltas = ytext.toDelta();

  // Find if the specified range has bold formatting
  let pos = 0;
  let foundBold = false;

  for (const delta of deltas) {
    const text = delta.insert as string;
    const deltaEnd = pos + text.length;

    // Check if this delta overlaps with our target range
    if (deltaEnd > index && pos < index + length) {
      // This delta overlaps - it should have bold
      const hasBold = delta.attributes?.bold === true;
      if (hasBold) {
        // Check if the bold covers our entire target range within this delta
        const overlapStart = Math.max(pos, index);
        const overlapEnd = Math.min(deltaEnd, index + length);
        if (overlapStart < overlapEnd) {
          foundBold = true;
        }
      }
    }
    pos = deltaEnd;
  }

  expect(foundBold, `Expected bold at index ${index}, length ${length}`).toBe(
    true,
  );
});

/**
 * Asserts that a node does NOT have bold formatting at the specified range.
 */
export const NODE_HAS_NO_BOLD_AT = Effect.fn("Then.NODE_HAS_NO_BOLD_AT")(
  function* (nodeId: Id.Node, index: number, length: number) {
    const Yjs = yield* YjsT;
    const ytext = Yjs.getText(nodeId);
    const deltas = ytext.toDelta();

    // Check that the specified range has no bold formatting
    let pos = 0;

    for (const delta of deltas) {
      const text = delta.insert as string;
      const deltaEnd = pos + text.length;

      // Check if this delta overlaps with our target range
      if (deltaEnd > index && pos < index + length) {
        // This delta overlaps - it should NOT have bold
        const hasBold = delta.attributes?.bold === true;
        expect(
          hasBold,
          `Expected no bold at index ${index}, length ${length}, but found bold in delta at ${pos}`,
        ).toBe(false);
      }
      pos = deltaEnd;
    }
  },
);

/**
 * Asserts that a node has no formatting at all (plain text).
 */
export const NODE_HAS_NO_FORMATTING = Effect.fn("Then.NODE_HAS_NO_FORMATTING")(
  function* (nodeId: Id.Node) {
    const Yjs = yield* YjsT;
    const ytext = Yjs.getText(nodeId);
    const deltas = ytext.toDelta();

    for (const delta of deltas) {
      expect(
        delta.attributes,
        "Expected no formatting attributes",
      ).toBeUndefined();
    }
  },
);

/**
 * Asserts that a node's entire text content is bold.
 */
export const NODE_IS_ENTIRELY_BOLD = Effect.fn("Then.NODE_IS_ENTIRELY_BOLD")(
  function* (nodeId: Id.Node) {
    const Yjs = yield* YjsT;
    const ytext = Yjs.getText(nodeId);
    const deltas = ytext.toDelta();

    // All deltas should have bold: true
    for (const delta of deltas) {
      expect(
        delta.attributes?.bold,
        `Expected entire text to be bold, but found non-bold segment: "${delta.insert}"`,
      ).toBe(true);
    }
  },
);

/**
 * Asserts that an unfocused block renders the specified text with bold styling.
 * Looks for a span with font-bold class or font-weight: 700.
 */
export const UNFOCUSED_BLOCK_HAS_BOLD_TEXT = (
  blockId: Id.Block,
  expectedText: string,
) =>
  Effect.promise(() =>
    waitFor(
      () => {
        // Find the block element by block ID
        const blockEl = document.querySelector(
          `[data-element-id="${blockId}"][data-element-type="block"]`,
        );
        expect(blockEl, `Block ${blockId} not found`).not.toBeNull();

        // Look for a span with font-bold class containing the expected text
        const boldSpan = blockEl!.querySelector(".font-bold");
        if (boldSpan) {
          expect(
            boldSpan.textContent,
            `Expected bold span to contain "${expectedText}"`,
          ).toContain(expectedText);
          return;
        }

        // Fallback: check for element with computed font-weight 700
        const allSpans = blockEl!.querySelectorAll("span");
        for (const span of allSpans) {
          const fontWeight = window.getComputedStyle(span).fontWeight;
          if (fontWeight === "700" || fontWeight === "bold") {
            expect(
              span.textContent,
              `Expected bold element to contain "${expectedText}"`,
            ).toContain(expectedText);
            return;
          }
        }

        // Neither found - fail with descriptive message
        expect.fail(
          `No bold styling found for text "${expectedText}" in unfocused block ${blockId}`,
        );
      },
      { timeout: 2000 },
    ),
  ).pipe(Effect.withSpan("Then.UNFOCUSED_BLOCK_HAS_BOLD_TEXT"));

/**
 * Asserts that an unfocused block renders the specified text WITHOUT bold styling.
 * The text should appear as plain text, not wrapped in a bold span.
 */
export const UNFOCUSED_BLOCK_HAS_PLAIN_TEXT = (
  blockId: Id.Block,
  expectedText: string,
) =>
  Effect.promise(() =>
    waitFor(
      () => {
        // Find the block element by block ID
        const blockEl = document.querySelector(
          `[data-element-id="${blockId}"][data-element-type="block"]`,
        );
        expect(blockEl, `Block ${blockId} not found`).not.toBeNull();

        // Verify the text exists in the block
        expect(
          blockEl!.textContent,
          `Block should contain "${expectedText}"`,
        ).toContain(expectedText);

        // Check that no bold span contains this text
        const boldSpans = blockEl!.querySelectorAll(".font-bold");
        for (const span of boldSpans) {
          expect(
            span.textContent,
            `Text "${expectedText}" should not be in a bold span`,
          ).not.toContain(expectedText);
        }

        // Also check computed styles
        const allSpans = blockEl!.querySelectorAll("span");
        for (const span of allSpans) {
          const fontWeight = window.getComputedStyle(span).fontWeight;
          if (fontWeight === "700" || fontWeight === "bold") {
            expect(
              span.textContent,
              `Text "${expectedText}" should not have bold styling`,
            ).not.toContain(expectedText);
          }
        }
      },
      { timeout: 2000 },
    ),
  ).pipe(Effect.withSpan("Then.UNFOCUSED_BLOCK_HAS_PLAIN_TEXT"));
