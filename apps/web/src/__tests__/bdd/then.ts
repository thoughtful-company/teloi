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

/** Mark types for text formatting */
type MarkType = "bold" | "italic" | "code";

/**
 * Asserts that a node has a specific mark at the specified range.
 * Checks the Y.Text deltas to verify the attribute is present.
 */
export const NODE_HAS_MARK_AT = (
  nodeId: Id.Node,
  index: number,
  length: number,
  mark: MarkType,
) =>
  Effect.gen(function* () {
    const Yjs = yield* YjsT;
    const ytext = Yjs.getText(nodeId);
    const deltas = ytext.toDelta();

    let pos = 0;
    let found = false;

    for (const delta of deltas) {
      const text = delta.insert as string;
      const deltaEnd = pos + text.length;

      if (deltaEnd > index && pos < index + length) {
        const hasMark = delta.attributes?.[mark] === true;
        if (hasMark) {
          const overlapStart = Math.max(pos, index);
          const overlapEnd = Math.min(deltaEnd, index + length);
          if (overlapStart < overlapEnd) {
            found = true;
          }
        }
      }
      pos = deltaEnd;
    }

    expect(found, `Expected ${mark} at index ${index}, length ${length}`).toBe(
      true,
    );
  }).pipe(Effect.withSpan(`Then.NODE_HAS_MARK_AT(${mark})`));

/**
 * Asserts that a node does NOT have a specific mark at the specified range.
 */
export const NODE_HAS_NO_MARK_AT = (
  nodeId: Id.Node,
  index: number,
  length: number,
  mark: MarkType,
) =>
  Effect.gen(function* () {
    const Yjs = yield* YjsT;
    const ytext = Yjs.getText(nodeId);
    const deltas = ytext.toDelta();

    let pos = 0;

    for (const delta of deltas) {
      const text = delta.insert as string;
      const deltaEnd = pos + text.length;

      if (deltaEnd > index && pos < index + length) {
        const hasMark = delta.attributes?.[mark] === true;
        expect(
          hasMark,
          `Expected no ${mark} at index ${index}, length ${length}, but found ${mark} in delta at ${pos}`,
        ).toBe(false);
      }
      pos = deltaEnd;
    }
  }).pipe(Effect.withSpan(`Then.NODE_HAS_NO_MARK_AT(${mark})`));

/** Convenience wrapper for bold */
export const NODE_HAS_BOLD_AT = (
  nodeId: Id.Node,
  index: number,
  length: number,
) => NODE_HAS_MARK_AT(nodeId, index, length, "bold");

/** Convenience wrapper for no bold */
export const NODE_HAS_NO_BOLD_AT = (
  nodeId: Id.Node,
  index: number,
  length: number,
) => NODE_HAS_NO_MARK_AT(nodeId, index, length, "bold");

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

/** Style detection config per mark type */
const markStyleConfig: Record<
  MarkType,
  {
    className: string;
    tagName?: string;
    computedCheck?: (style: CSSStyleDeclaration) => boolean;
  }
> = {
  bold: {
    className: ".font-bold",
    computedCheck: (s) => s.fontWeight === "700" || s.fontWeight === "bold",
  },
  italic: {
    className: ".italic",
    computedCheck: (s) => s.fontStyle === "italic",
  },
  code: {
    className: ".font-mono",
    tagName: "code",
    computedCheck: (s) =>
      s.fontFamily.includes("monospace") ||
      s.fontFamily.includes("mono") ||
      s.fontFamily.includes("Courier"),
  },
};

/**
 * Asserts that an unfocused block renders the specified text with a mark's styling.
 */
export const UNFOCUSED_BLOCK_HAS_MARK_TEXT = (
  blockId: Id.Block,
  expectedText: string,
  mark: MarkType,
) =>
  Effect.promise(() =>
    waitFor(
      () => {
        const blockEl = document.querySelector(
          `[data-element-id="${blockId}"][data-element-type="block"]`,
        );
        expect(blockEl, `Block ${blockId} not found`).not.toBeNull();

        const config = markStyleConfig[mark];

        // Check class selector
        const styledEl = blockEl!.querySelector(config.className);
        if (styledEl?.textContent?.includes(expectedText)) return;

        // Check tag name if applicable
        if (config.tagName) {
          const tagEl = blockEl!.querySelector(config.tagName);
          if (tagEl?.textContent?.includes(expectedText)) return;
        }

        // Fallback: computed style check
        if (config.computedCheck) {
          const allElements = blockEl!.querySelectorAll("span, code");
          for (const el of allElements) {
            if (config.computedCheck(window.getComputedStyle(el))) {
              if (el.textContent?.includes(expectedText)) return;
            }
          }
        }

        expect.fail(
          `No ${mark} styling found for text "${expectedText}" in unfocused block ${blockId}`,
        );
      },
      { timeout: 2000 },
    ),
  ).pipe(Effect.withSpan(`Then.UNFOCUSED_BLOCK_HAS_MARK_TEXT(${mark})`));

/** Convenience wrapper for bold text in unfocused block */
export const UNFOCUSED_BLOCK_HAS_BOLD_TEXT = (
  blockId: Id.Block,
  expectedText: string,
) => UNFOCUSED_BLOCK_HAS_MARK_TEXT(blockId, expectedText, "bold");

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

/** Convenience wrapper for italic */
export const NODE_HAS_ITALIC_AT = (
  nodeId: Id.Node,
  index: number,
  length: number,
) => NODE_HAS_MARK_AT(nodeId, index, length, "italic");

/** Convenience wrapper for no italic */
export const NODE_HAS_NO_ITALIC_AT = (
  nodeId: Id.Node,
  index: number,
  length: number,
) => NODE_HAS_NO_MARK_AT(nodeId, index, length, "italic");

/** Convenience wrapper for code */
export const NODE_HAS_CODE_AT = (
  nodeId: Id.Node,
  index: number,
  length: number,
) => NODE_HAS_MARK_AT(nodeId, index, length, "code");

/** Convenience wrapper for no code */
export const NODE_HAS_NO_CODE_AT = (
  nodeId: Id.Node,
  index: number,
  length: number,
) => NODE_HAS_NO_MARK_AT(nodeId, index, length, "code");

/** Convenience wrapper for italic text in unfocused block */
export const UNFOCUSED_BLOCK_HAS_ITALIC_TEXT = (
  blockId: Id.Block,
  expectedText: string,
) => UNFOCUSED_BLOCK_HAS_MARK_TEXT(blockId, expectedText, "italic");

/** Convenience wrapper for code text in unfocused block */
export const UNFOCUSED_BLOCK_HAS_CODE_TEXT = (
  blockId: Id.Block,
  expectedText: string,
) => UNFOCUSED_BLOCK_HAS_MARK_TEXT(blockId, expectedText, "code");

/**
 * Asserts that a block is expanded (showing its children).
 * Uses the BlockT service to check the actual model state.
 */
export const BLOCK_IS_EXPANDED = (blockId: Id.Block) =>
  Effect.gen(function* () {
    const Store = yield* StoreT;
    const blockDoc = yield* Store.getDocument("block", blockId);

    yield* Effect.try({
      try: () => {
        // Default state (no doc) is expanded
        if (Option.isNone(blockDoc)) {
          return; // Pass - no doc means expanded by default
        }
        const doc = Option.getOrThrow(blockDoc);
        expect(doc.isExpanded, `Block ${blockId} should be expanded`).toBe(true);
      },
      catch: (cause) => new AssertionError({ cause }),
    });
  }).pipe(
    Effect.retry(Schedule.spaced("50 millis").pipe(Schedule.upTo("2 seconds"))),
    Effect.withSpan("Then.BLOCK_IS_EXPANDED"),
  );

/**
 * Asserts that a block is collapsed (hiding its children).
 * Uses the BlockT service to check the actual model state.
 */
export const BLOCK_IS_COLLAPSED = (blockId: Id.Block) =>
  Effect.gen(function* () {
    const Store = yield* StoreT;
    const blockDoc = yield* Store.getDocument("block", blockId);

    yield* Effect.try({
      try: () => {
        expect(Option.isSome(blockDoc), `Block ${blockId} should have a document`).toBe(true);
        const doc = Option.getOrThrow(blockDoc);
        expect(doc.isExpanded, `Block ${blockId} should be collapsed`).toBe(false);
      },
      catch: (cause) => new AssertionError({ cause }),
    });
  }).pipe(
    Effect.retry(Schedule.spaced("50 millis").pipe(Schedule.upTo("2 seconds"))),
    Effect.withSpan("Then.BLOCK_IS_COLLAPSED"),
  );
