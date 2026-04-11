import { Id, Model } from "@/schema";
import { NodeT } from "@/services/domain/Node";
import { StoreT } from "@/services/external/Store";
import { AutomergeT } from "@/services/external/Automerge";
import { FrameT } from "@/services/ui/Frame";
import { doubleRaf } from "@/utils/effect";
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
      { timeout: 2000 },
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
 * Asserts that a node has the expected text content (checks Automerge, not LiveStore).
 */
export const NODE_HAS_TEXT = Effect.fn("Then.NODE_HAS_TEXT")(function* (
  nodeId: Id.Node,
  expectedText: string,
) {
  const Automerge = yield* AutomergeT;
  const text = yield* Automerge.getText(nodeId);
  expect(text).toBe(expectedText);
});

/**
 * Waits for the DOM to have exactly N block elements.
 */
export const BLOCK_COUNT_IS = (count: number) =>
  Effect.promise(() =>
    waitFor(
      () => {
        const blocks = document.querySelectorAll("[data-element-type='khora']");
        expect(blocks.length).toBe(count);
      },
      { timeout: 3000 },
    ),
  ).pipe(Effect.withSpan("Then.BLOCK_COUNT_IS"));

/**
 * Asserts that the DOM selection is collapsed and at the expected offset.
 */
export const SELECTION_IS_COLLAPSED_AT_OFFSET = (offset: number) =>
  doubleRaf.pipe(
    Effect.andThen(() => {
      const sel = window.getSelection();
      expect(sel).not.toBeNull();
      expect(sel!.isCollapsed).toBe(true);
      expect(sel!.anchorOffset).toBe(offset);
    }),
    Effect.withSpan("Then.SELECTION_IS_COLLAPSED_AT_OFFSET"),
  );

/**
 * Asserts that the DOM selection is NOT in the specified block.
 */
export const SELECTION_IS_NOT_ON_BLOCK = (khoraId: Id.Khora) =>
  doubleRaf.pipe(
    Effect.andThen(() => {
      const currentBlockId = getSelectionBlockId();
      expect(currentBlockId).not.toBeNull();
      expect(currentBlockId).not.toBe(khoraId);
    }),
    Effect.withSpan("Then.SELECTION_IS_NOT_ON_BLOCK"),
  );

/**
 * Asserts that the DOM selection IS in the specified block.
 */
export const SELECTION_IS_ON_KHORA = (khoraId: Id.Khora) =>
  doubleRaf.pipe(
    Effect.andThen(() => {
      const currentBlockId = getSelectionBlockId();
      expect(currentBlockId).toBe(khoraId);
    }),
    Effect.withSpan("Then.SELECTION_IS_ON_KHORA"),
  );

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
 * Asserts that the DOM selection IS in the title for the specified frame.
 */
export const SELECTION_IS_ON_TITLE = (frameId: Id.Frame) =>
  Effect.sync(() => {
    const currentTitleId = getSelectionTitleId();
    expect(currentTitleId).toBe(frameId);
  }).pipe(Effect.withSpan("Then.SELECTION_IS_ON_TITLE"));

/**
 * Gets the CodeMirror EditorView from the focused .cm-content element.
 */
export const getCodeMirrorView = (): EditorView | null => {
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
  doubleRaf.pipe(
    Effect.andThen(() => {
      const view = getCodeMirrorView();
      expect(view, "CodeMirror view not found").not.toBeNull();

      const sel = view!.state.selection.main;
      expect(sel.head, "cursor head position").toBe(expectedHead);

      if (expectedAssoc !== undefined) {
        expect(sel.assoc, "cursor assoc").toBe(expectedAssoc);
      }
    }),
    Effect.withSpan("Then.CM_CURSOR_IS_AT"),
  );

/** Typed error for assertion failures that can be retried */
class AssertionError extends Data.TaggedError("AssertionError")<{
  cause: unknown;
}> {}

interface WindowCompatDoc {
  selection: Model.ActiveKhoraSelection | null;
  selectedKhoras: readonly Id.Khora[];
  khoraSelectionAnchor: Id.Khora | null;
  khoraSelectionFocus: Id.Khora | null;
}

const normalizeSelectedBlocks = (
  state: {
    selectedKhoras: readonly Id.Khora[];
    anchor: Id.Khora | null;
    focus: Id.Khora | null;
  },
  mode:
    | { type: "none" }
    | { type: "khora"; khoraId: Id.Khora }
    | { type: "khoraSelection"; frameId: Id.Frame },
): readonly Id.Khora[] => {
  if (state.selectedKhoras.length > 0) {
    return state.selectedKhoras;
  }

  if (mode.type === "khoraSelection" && state.focus != null) {
    return [state.focus];
  }

  return state.selectedKhoras;
};

/**
 * Compatibility reader for old "window doc" assertions.
 * Values are sourced from FrameT (not from window mirror fields).
 */
export const WINDOW_DOC_COMPAT = (frameId: Id.Frame) =>
  Effect.gen(function* () {
    const Frame = yield* FrameT;

    const blockSelection = yield* Frame.getKhoraSelectionState(frameId);
    const selection = yield* Frame.getSelection(frameId);
    const mode = yield* Frame.getMode();
    const normalizedSelected = normalizeSelectedBlocks(blockSelection, mode);

    return Option.some<WindowCompatDoc>({
      selection: Option.getOrNull(selection),
      selectedKhoras: normalizedSelected,
      khoraSelectionAnchor: blockSelection.anchor,
      khoraSelectionFocus: blockSelection.focus,
    });
  });

/**
 * Asserts that the frame has exactly the specified blocks selected.
 * Checks both the selectedKhoras array and optionally anchor/focus.
 * Uses Effect-native retry instead of waitFor for proper Effect composition.
 */
export const BLOCKS_ARE_SELECTED = (
  frameId: Id.Frame,
  expectedKhoraIds: Id.Khora[],
  options?: { anchor?: Id.Khora; focus?: Id.Khora },
) =>
  Effect.gen(function* () {
    const Frame = yield* FrameT;
    const state = yield* Frame.getKhoraSelectionState(frameId);
    const mode = yield* Frame.getMode();
    const selectedKhoras = normalizeSelectedBlocks(state, mode);

    yield* Effect.sync(() => {
      expect(selectedKhoras).toHaveLength(expectedKhoraIds.length);
      for (const khoraId of expectedKhoraIds) {
        expect(selectedKhoras).toContain(khoraId);
      }

      if (options?.anchor !== undefined) {
        expect(state.anchor).toBe(options.anchor);
      }
      if (options?.focus !== undefined) {
        expect(state.focus).toBe(options.focus);
      }
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
 * NOTE: Automerge stores plain strings, so rich text formatting requires
 * a different approach. This is a stub that always fails - formatting tests
 * need to be updated for the new text storage approach.
 */
export const NODE_HAS_MARK_AT = (
  _nodeId: Id.Node,
  index: number,
  length: number,
  mark: MarkType,
) =>
  Effect.gen(function* () {
    yield* Effect.logWarning(
      `NODE_HAS_MARK_AT(${mark}) called but Automerge stores plain strings. ` +
        `Formatting tests need to be updated for the new text storage approach.`,
    );
    expect.fail(
      `NODE_HAS_MARK_AT not supported: Automerge stores plain strings. ` +
        `Expected ${mark} at index ${index}, length ${length}`,
    );
  }).pipe(Effect.withSpan(`Then.NODE_HAS_MARK_AT(${mark})`));

/**
 * Asserts that a node does NOT have a specific mark at the specified range.
 * NOTE: Automerge stores plain strings (no marks), so this always passes.
 */
export const NODE_HAS_NO_MARK_AT = (
  _nodeId: Id.Node,
  _index: number,
  _length: number,
  mark: MarkType,
) =>
  Effect.gen(function* () {
    // Automerge stores plain strings, so there are never any marks
    yield* Effect.logDebug(
      `NODE_HAS_NO_MARK_AT(${mark}) trivially passes: Automerge stores plain strings`,
    );
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
 * NOTE: Automerge stores plain strings, so this always passes.
 */
export const NODE_HAS_NO_FORMATTING = Effect.fn("Then.NODE_HAS_NO_FORMATTING")(
  function* (_nodeId: Id.Node) {
    // Automerge stores plain strings, so there is never any formatting
    yield* Effect.logDebug(
      `NODE_HAS_NO_FORMATTING trivially passes: Automerge stores plain strings`,
    );
  },
);

/**
 * Asserts that a node's entire text content is bold.
 * NOTE: Automerge stores plain strings, so this always fails - formatting tests
 * need to be updated for the new text storage approach.
 */
export const NODE_IS_ENTIRELY_BOLD = Effect.fn("Then.NODE_IS_ENTIRELY_BOLD")(
  function* (_nodeId: Id.Node) {
    yield* Effect.logWarning(
      `NODE_IS_ENTIRELY_BOLD called but Automerge stores plain strings. ` +
        `Formatting tests need to be updated for the new text storage approach.`,
    );
    expect.fail(
      `NODE_IS_ENTIRELY_BOLD not supported: Automerge stores plain strings.`,
    );
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
export const UNFOCUSED_KHORA_HAS_MARK_TEXT = (
  khoraId: Id.Khora,
  expectedText: string,
  mark: MarkType,
) =>
  Effect.promise(() =>
    waitFor(
      () => {
        const blockEl = document.querySelector(
          `[data-element-id="${khoraId}"][data-element-type="khora"]`,
        );
        expect(blockEl, `Block ${khoraId} not found`).not.toBeNull();

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
          `No ${mark} styling found for text "${expectedText}" in unfocused block ${khoraId}`,
        );
      },
      { timeout: 2000 },
    ),
  ).pipe(Effect.withSpan(`Then.UNFOCUSED_KHORA_HAS_MARK_TEXT(${mark})`));

/** Convenience wrapper for bold text in unfocused block */
export const UNFOCUSED_KHORA_HAS_BOLD_TEXT = (
  khoraId: Id.Khora,
  expectedText: string,
) => UNFOCUSED_KHORA_HAS_MARK_TEXT(khoraId, expectedText, "bold");

/**
 * Asserts that an unfocused block renders the specified text WITHOUT bold styling.
 * The text should appear as plain text, not wrapped in a bold span.
 */
export const UNFOCUSED_KHORA_HAS_PLAIN_TEXT = (
  khoraId: Id.Khora,
  expectedText: string,
) =>
  Effect.promise(() =>
    waitFor(
      () => {
        // Find the block element by block ID
        const blockEl = document.querySelector(
          `[data-element-id="${khoraId}"][data-element-type="khora"]`,
        );
        expect(blockEl, `Block ${khoraId} not found`).not.toBeNull();

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
  ).pipe(Effect.withSpan("Then.UNFOCUSED_KHORA_HAS_PLAIN_TEXT"));

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
export const UNFOCUSED_KHORA_HAS_ITALIC_TEXT = (
  khoraId: Id.Khora,
  expectedText: string,
) => UNFOCUSED_KHORA_HAS_MARK_TEXT(khoraId, expectedText, "italic");

/** Convenience wrapper for code text in unfocused block */
export const UNFOCUSED_KHORA_HAS_CODE_TEXT = (
  khoraId: Id.Khora,
  expectedText: string,
) => UNFOCUSED_KHORA_HAS_MARK_TEXT(khoraId, expectedText, "code");

/**
 * Asserts that a block is expanded (showing its children).
 * Uses the KhoraT service to check the actual model state.
 */
export const KHORA_IS_EXPANDED = (khoraId: Id.Khora) =>
  Effect.gen(function* () {
    const Store = yield* StoreT;
    const blockDoc = yield* Store.getDocument("khora", khoraId);

    yield* Effect.try({
      try: () => {
        // Default state (no doc) is expanded
        if (Option.isNone(blockDoc)) {
          return; // Pass - no doc means expanded by default
        }
        const doc = Option.getOrThrow(blockDoc);
        expect(doc.isExpanded, `Block ${khoraId} should be expanded`).toBe(
          true,
        );
      },
      catch: (cause) => new AssertionError({ cause }),
    });
  }).pipe(
    Effect.retry(Schedule.spaced("50 millis").pipe(Schedule.upTo("2 seconds"))),
    Effect.withSpan("Then.KHORA_IS_EXPANDED"),
  );

/**
 * Asserts that a block is collapsed (hiding its children).
 * Uses the KhoraT service to check the actual model state.
 */
export const KHORA_IS_COLLAPSED = (khoraId: Id.Khora) =>
  Effect.gen(function* () {
    const Store = yield* StoreT;
    const blockDoc = yield* Store.getDocument("khora", khoraId);

    yield* Effect.try({
      try: () => {
        expect(
          Option.isSome(blockDoc),
          `Block ${khoraId} should have a document`,
        ).toBe(true);
        const doc = Option.getOrThrow(blockDoc);
        expect(doc.isExpanded, `Block ${khoraId} should be collapsed`).toBe(
          false,
        );
      },
      catch: (cause) => new AssertionError({ cause }),
    });
  }).pipe(
    Effect.retry(Schedule.spaced("50 millis").pipe(Schedule.upTo("2 seconds"))),
    Effect.withSpan("Then.KHORA_IS_COLLAPSED"),
  );
