import "@/index.css";
import { Id } from "@/schema";
import { NodeT } from "@/services/domain/Node";
import EditorBuffer from "@/ui/EditorBuffer";
import { userEvent } from "@vitest/browser/context";
import { Effect } from "effect";
import { waitFor } from "solid-testing-library";
import { describe, expect, it } from "vitest";
import { Given, render, runtime, Then } from "../bdd";

describe("Body click creates block", () => {
  // Document structure:
  // Title: "Document Title" (no children)
  // Body: (empty)
  //
  // Expected after clicking body:
  // Title: "Document Title"
  // └─ Block: "" (new first child, cursor here)

  it("clicking on empty body creates first block", async () => {
    await Effect.gen(function* () {
      // Given: A buffer with only a title (no child blocks)
      const { bufferId, nodeId: rootNodeId } =
        yield* Given.A_BUFFER_WITH_TEXT("Document Title");

      render(() => <EditorBuffer bufferId={bufferId} />);

      // When: User clicks on the empty body area
      yield* Effect.promise(async () => {
        const bodyArea = await waitFor(
          () => {
            const el = document.querySelector("[data-testid='editor-body']");
            if (!el) throw new Error("Body area not found");
            return el as HTMLElement;
          },
          { timeout: 2000 },
        );
        bodyArea.click();
      });

      // Then: A new child block should be created
      yield* Then.BLOCK_COUNT_IS(1);
      yield* Then.NODE_HAS_CHILDREN(rootNodeId, 1);

      // And: The new block should be empty
      const Node = yield* NodeT;
      const children = yield* Node.getNodeChildren(rootNodeId);
      expect(children.length).toBe(1);
      yield* Then.NODE_HAS_TEXT(children[0]!, "");

      // And: Cursor should be in the new block at position 0
      const newBlockId = Id.makeBlockId(bufferId, children[0]!);
      yield* Effect.promise(() =>
        waitFor(
          () => {
            const sel = window.getSelection();
            if (!sel || sel.rangeCount === 0) throw new Error("No selection");
            const anchorNode = sel.anchorNode;
            if (!anchorNode) throw new Error("No anchor node");
            const element =
              anchorNode.nodeType === Node.ELEMENT_NODE
                ? (anchorNode as Element)
                : anchorNode.parentElement;
            const blockEl = element?.closest("[data-element-id]");
            const currentBlockId = blockEl?.getAttribute("data-element-id");
            if (currentBlockId !== newBlockId) {
              throw new Error(`Selection not on block: ${currentBlockId}`);
            }
          },
          { timeout: 2000 },
        ),
      );
      yield* Then.SELECTION_IS_COLLAPSED_AT_OFFSET(0);
    }).pipe(runtime.runPromise);
  });

  // Document structure:
  // Title: "Document Title"
  // └─ Block: "Existing block"
  //
  // Expected after clicking below the block:
  // Title: "Document Title"
  // ├─ Block: "Existing block"
  // └─ Block: "" (new last child, cursor here)

  it("clicking below last block creates new block at end", async () => {
    await Effect.gen(function* () {
      // Given: A buffer with one child block
      const { bufferId, rootNodeId, childNodeIds } =
        yield* Given.A_BUFFER_WITH_CHILDREN("Document Title", [
          { text: "Existing block" },
        ]);

      render(() => <EditorBuffer bufferId={bufferId} />);

      // When: User clicks on the body area below existing blocks
      yield* Effect.promise(async () => {
        const bodyArea = await waitFor(
          () => {
            const el = document.querySelector("[data-testid='editor-body']");
            if (!el) throw new Error("Body area not found");
            return el as HTMLElement;
          },
          { timeout: 2000 },
        );
        bodyArea.click();
      });

      // Then: A new child block should be created (total 2)
      yield* Then.BLOCK_COUNT_IS(2);
      yield* Then.NODE_HAS_CHILDREN(rootNodeId, 2);

      // And: Original block should be unchanged
      yield* Then.NODE_HAS_TEXT(childNodeIds[0], "Existing block");

      // And: New block should be empty and at the end
      const Node = yield* NodeT;
      const children = yield* Node.getNodeChildren(rootNodeId);
      expect(children.length).toBe(2);
      yield* Then.NODE_HAS_TEXT(children[1]!, "");

      // And: Cursor should be in the new block at position 0
      const newBlockId = Id.makeBlockId(bufferId, children[1]!);
      yield* Effect.promise(() =>
        waitFor(
          () => {
            const sel = window.getSelection();
            if (!sel || sel.rangeCount === 0) throw new Error("No selection");
            const anchorNode = sel.anchorNode;
            if (!anchorNode) throw new Error("No anchor node");
            const element =
              anchorNode.nodeType === Node.ELEMENT_NODE
                ? (anchorNode as Element)
                : anchorNode.parentElement;
            const blockEl = element?.closest("[data-element-id]");
            const currentBlockId = blockEl?.getAttribute("data-element-id");
            if (currentBlockId !== newBlockId) {
              throw new Error(`Selection not on block: ${currentBlockId}`);
            }
          },
          { timeout: 2000 },
        ),
      );
      yield* Then.SELECTION_IS_COLLAPSED_AT_OFFSET(0);
    }).pipe(runtime.runPromise);
  });

  // Document structure:
  // Title: "Document Title"
  // ├─ Block: "First block"
  // └─ Block: "" (already empty)
  //
  // Expected after clicking body:
  // Title: "Document Title"
  // ├─ Block: "First block"
  // └─ Block: "" (same block, now focused - NO new block created)

  it("focuses existing empty last block instead of creating new one", async () => {
    await Effect.gen(function* () {
      // Given: A buffer with blocks, where the last one is empty
      const { bufferId, rootNodeId, childNodeIds } =
        yield* Given.A_BUFFER_WITH_CHILDREN("Document Title", [
          { text: "First block" },
          { text: "" },
        ]);

      const emptyBlockId = Id.makeBlockId(bufferId, childNodeIds[1]);

      render(() => <EditorBuffer bufferId={bufferId} />);

      // When: User clicks on the body area
      yield* Effect.promise(async () => {
        const bodyArea = await waitFor(
          () => {
            const el = document.querySelector("[data-testid='editor-body']");
            if (!el) throw new Error("Body area not found");
            return el as HTMLElement;
          },
          { timeout: 2000 },
        );
        bodyArea.click();
      });

      // Then: No new block should be created (still 2 blocks)
      yield* Then.BLOCK_COUNT_IS(2);
      yield* Then.NODE_HAS_CHILDREN(rootNodeId, 2);

      // And: The existing empty block should be focused
      yield* Effect.promise(() =>
        waitFor(
          () => {
            const sel = window.getSelection();
            if (!sel || sel.rangeCount === 0) throw new Error("No selection");
            const anchorNode = sel.anchorNode;
            if (!anchorNode) throw new Error("No anchor node");
            const element =
              anchorNode.nodeType === Node.ELEMENT_NODE
                ? (anchorNode as Element)
                : anchorNode.parentElement;
            const blockEl = element?.closest("[data-element-id]");
            const currentBlockId = blockEl?.getAttribute("data-element-id");
            if (currentBlockId !== emptyBlockId) {
              throw new Error(`Selection not on empty block: ${currentBlockId}`);
            }
          },
          { timeout: 2000 },
        ),
      );
      yield* Then.SELECTION_IS_COLLAPSED_AT_OFFSET(0);
    }).pipe(runtime.runPromise);
  });

  // BUG REPRODUCTION: clicking body after focusing last empty block
  //
  // User reported:
  // 1. Click on last block (focused)
  // 2. Click below it → selection disappears
  // 3. Click again → still doesn't return to last block
  // 4. Typing doesn't work even though DOM selection appears to be there
  //
  // Document structure:
  // Title: "Document Title"
  // └─ Block: "" (empty)

  it("allows typing after clicking body when last block is empty", async () => {
    await Effect.gen(function* () {
      // Given: A buffer with one empty block
      const { bufferId, childNodeIds } =
        yield* Given.A_BUFFER_WITH_CHILDREN("Document Title", [
          { text: "" },
        ]);

      const emptyBlockId = Id.makeBlockId(bufferId, childNodeIds[0]);

      render(() => <EditorBuffer bufferId={bufferId} />);

      // Step 1: Click on the empty block's content to focus it
      yield* Effect.promise(async () => {
        const blockContent = await waitFor(
          () => {
            // Find the <p> element inside the block (the clickable content)
            const block = document.querySelector(`[data-element-id="${emptyBlockId}"]`);
            if (!block) throw new Error("Block not found");
            const p = block.querySelector("p");
            if (!p) throw new Error("Block content not found");
            return p as HTMLElement;
          },
          { timeout: 2000 },
        );
        blockContent.click();
      });

      // Wait for CodeMirror to be focused
      yield* Effect.promise(() =>
        waitFor(
          () => {
            const cm = document.querySelector(".cm-content");
            if (!cm) throw new Error("CodeMirror not found");
            if (document.activeElement !== cm && !cm.contains(document.activeElement)) {
              throw new Error("CodeMirror not focused");
            }
          },
          { timeout: 2000 },
        ),
      );

      // Step 2: Click on the body area below the block
      yield* Effect.promise(async () => {
        const bodyArea = document.querySelector("[data-testid='editor-body']") as HTMLElement;
        bodyArea.click();
      });

      // Step 3: Try to type - this is the REAL test
      yield* Effect.promise(async () => {
        await userEvent.keyboard("hello");
      });

      // Then: The text should have been typed into the block
      yield* Then.NODE_HAS_TEXT(childNodeIds[0], "hello");
    }).pipe(runtime.runPromise);
  });

  // BUG: Model selection not re-emitted when setting same value
  //
  // Root cause discovered:
  // 1. Click on block → model selection set to block:0
  // 2. Click on body → CodeMirror blurs, but model selection STAYS at block:0
  // 3. handleBodyClick sets selection to block:0 (same value!)
  // 4. Stream doesn't emit (no change) → createEffect doesn't fire → no focus
  //
  // Document structure:
  // Title: "Document Title"
  // └─ Block: "some text"

  it("refocuses CodeMirror when clicking body after block was focused", async () => {
    await Effect.gen(function* () {
      // Given: A buffer with a block containing text
      const { bufferId, childNodeIds } =
        yield* Given.A_BUFFER_WITH_CHILDREN("Document Title", [
          { text: "some text" },
        ]);

      const blockId = Id.makeBlockId(bufferId, childNodeIds[0]);

      render(() => <EditorBuffer bufferId={bufferId} />);

      // Step 1: Click on the block's text content to focus it
      yield* Effect.promise(async () => {
        const blockContent = await waitFor(
          () => {
            // Find the <p> element inside the block (the clickable content)
            const block = document.querySelector(`[data-element-id="${blockId}"]`);
            if (!block) throw new Error("Block not found");
            const p = block.querySelector("p");
            if (!p) throw new Error("Block content not found");
            return p as HTMLElement;
          },
          { timeout: 2000 },
        );
        blockContent.click();
      });

      // Wait for CodeMirror to be focused
      yield* Effect.promise(() =>
        waitFor(
          () => {
            const cm = document.querySelector(".cm-content");
            if (!cm) throw new Error("CodeMirror not found after initial click");
            if (document.activeElement !== cm && !cm.contains(document.activeElement)) {
              throw new Error("CodeMirror not focused after initial click");
            }
          },
          { timeout: 2000 },
        ),
      );

      // Step 2: Click on the body area below the block
      yield* Effect.promise(async () => {
        const bodyArea = document.querySelector("[data-testid='editor-body']") as HTMLElement;
        bodyArea.click();
      });

      // Step 3: Wait for CodeMirror to be re-focused after body click
      yield* Effect.promise(() =>
        waitFor(
          () => {
            const cm = document.querySelector(".cm-content");
            if (!cm) throw new Error("CodeMirror not found after body click");
            if (document.activeElement !== cm && !cm.contains(document.activeElement)) {
              throw new Error("CodeMirror not focused after body click");
            }
          },
          { timeout: 2000 },
        ),
      );

      // Then: Selection should be on this block at offset 0
      yield* Then.SELECTION_IS_ON_BLOCK(blockId);
      yield* Then.SELECTION_IS_COLLAPSED_AT_OFFSET(0);
    }).pipe(runtime.runPromise);
  });
});
