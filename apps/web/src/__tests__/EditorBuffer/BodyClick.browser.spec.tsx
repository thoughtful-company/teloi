import "@/index.css";
import { Id } from "@/schema";
import { NodeT } from "@/services/domain/Node";
import { BufferT } from "@/services/ui/Buffer";
import EditorBuffer from "@/ui/EditorBuffer";
import { userEvent } from "@vitest/browser/context";
import { Effect, Option } from "effect";
import { waitFor } from "solid-testing-library";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { Given, Then, setupClientTest, type BrowserRuntime } from "../bdd";

describe("Body click creates block", () => {
  let runtime: BrowserRuntime;
  let render: Awaited<ReturnType<typeof setupClientTest>>["render"];
  let cleanup: () => Promise<void>;

  beforeEach(async () => {
    const setup = await setupClientTest();
    runtime = setup.runtime;
    render = setup.render;
    cleanup = setup.cleanup;
  });

  afterEach(async () => {
    await cleanup();
  });

  it("clicking on empty body creates first block", async () => {
    await Effect.gen(function* () {
      const { bufferId, nodeId: rootNodeId } =
        yield* Given.A_BUFFER_WITH_TEXT("Document Title");

      render(() => <EditorBuffer bufferId={bufferId} />);

      yield* Effect.promise(async () => {
        const clickZone = await waitFor(
          () => {
            const el = document.querySelector(
              "[data-testid='editor-click-zone']",
            );
            if (!el) throw new Error("Click zone not found");
            return el as HTMLElement;
          },
          { timeout: 2000 },
        );
        clickZone.click();
      });

      yield* Then.BLOCK_COUNT_IS(1);
      yield* Then.NODE_HAS_CHILDREN(rootNodeId, 1);

      const NodeService = yield* NodeT;
      const children = yield* NodeService.getNodeChildren(rootNodeId);
      expect(children.length).toBe(1);
      yield* Then.NODE_HAS_TEXT(children[0]!, "");

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

  it("clicking below last block creates new block at end", async () => {
    await Effect.gen(function* () {
      const { bufferId, rootNodeId, childNodeIds } =
        yield* Given.A_BUFFER_WITH_CHILDREN("Document Title", [
          { text: "Existing block" },
        ]);

      render(() => <EditorBuffer bufferId={bufferId} />);

      yield* Effect.promise(async () => {
        const clickZone = await waitFor(
          () => {
            const el = document.querySelector(
              "[data-testid='editor-click-zone']",
            );
            if (!el) throw new Error("Click zone not found");
            return el as HTMLElement;
          },
          { timeout: 2000 },
        );
        clickZone.click();
      });

      yield* Then.BLOCK_COUNT_IS(2);
      yield* Then.NODE_HAS_CHILDREN(rootNodeId, 2);

      yield* Then.NODE_HAS_TEXT(childNodeIds[0], "Existing block");

      const NodeService = yield* NodeT;
      const children = yield* NodeService.getNodeChildren(rootNodeId);
      expect(children.length).toBe(2);
      yield* Then.NODE_HAS_TEXT(children[1]!, "");

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

  it("focuses existing empty last block instead of creating new one", async () => {
    await Effect.gen(function* () {
      const { bufferId, rootNodeId, childNodeIds } =
        yield* Given.A_BUFFER_WITH_CHILDREN("Document Title", [
          { text: "First block" },
          { text: "" },
        ]);

      const emptyBlockId = Id.makeBlockId(bufferId, childNodeIds[1]);

      render(() => <EditorBuffer bufferId={bufferId} />);

      yield* Effect.promise(async () => {
        const clickZone = await waitFor(
          () => {
            const el = document.querySelector(
              "[data-testid='editor-click-zone']",
            );
            if (!el) throw new Error("Click zone not found");
            return el as HTMLElement;
          },
          { timeout: 2000 },
        );
        clickZone.click();
      });

      yield* Then.BLOCK_COUNT_IS(2);
      yield* Then.NODE_HAS_CHILDREN(rootNodeId, 2);

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
              throw new Error(
                `Selection not on empty block: ${currentBlockId}`,
              );
            }
          },
          { timeout: 2000 },
        ),
      );
      yield* Then.SELECTION_IS_COLLAPSED_AT_OFFSET(0);
    }).pipe(runtime.runPromise);
  });

  it("allows typing after clicking body when last block is empty", async () => {
    await Effect.gen(function* () {
      const { bufferId, childNodeIds } = yield* Given.A_BUFFER_WITH_CHILDREN(
        "Document Title",
        [{ text: "" }],
      );

      const emptyBlockId = Id.makeBlockId(bufferId, childNodeIds[0]);

      render(() => <EditorBuffer bufferId={bufferId} />);

      yield* Effect.promise(async () => {
        const blockContent = await waitFor(
          () => {
            const block = document.querySelector(
              `[data-element-id="${emptyBlockId}"]`,
            );
            if (!block) throw new Error("Block not found");
            const p = block.querySelector("p");
            if (!p) throw new Error("Block content not found");
            return p as HTMLElement;
          },
          { timeout: 2000 },
        );
        blockContent.click();
      });

      yield* Effect.promise(() =>
        waitFor(
          () => {
            const cm = document.querySelector(".cm-content");
            if (!cm) throw new Error("CodeMirror not found");
            if (
              document.activeElement !== cm &&
              !cm.contains(document.activeElement)
            ) {
              throw new Error("CodeMirror not focused");
            }
          },
          { timeout: 2000 },
        ),
      );

      yield* Effect.promise(async () => {
        const clickZone = document.querySelector(
          "[data-testid='editor-click-zone']",
        ) as HTMLElement;
        clickZone.click();
      });

      yield* Effect.promise(async () => {
        await userEvent.keyboard("hello");
      });

      yield* Then.NODE_HAS_TEXT(childNodeIds[0], "hello");
    }).pipe(runtime.runPromise);
  });

  it("refocuses CodeMirror when clicking body after block was focused", async () => {
    await Effect.gen(function* () {
      const { bufferId, childNodeIds } = yield* Given.A_BUFFER_WITH_CHILDREN(
        "Document Title",
        [{ text: "some text" }],
      );

      const blockId = Id.makeBlockId(bufferId, childNodeIds[0]);

      render(() => <EditorBuffer bufferId={bufferId} />);

      yield* Effect.promise(async () => {
        const blockContent = await waitFor(
          () => {
            const block = document.querySelector(
              `[data-element-id="${blockId}"]`,
            );
            if (!block) throw new Error("Block not found");
            const p = block.querySelector("p");
            if (!p) throw new Error("Block content not found");
            return p as HTMLElement;
          },
          { timeout: 2000 },
        );
        blockContent.click();
      });

      yield* Effect.promise(() =>
        waitFor(
          () => {
            const cm = document.querySelector(".cm-content");
            if (!cm)
              throw new Error("CodeMirror not found after initial click");
            if (
              document.activeElement !== cm &&
              !cm.contains(document.activeElement)
            ) {
              throw new Error("CodeMirror not focused after initial click");
            }
          },
          { timeout: 2000 },
        ),
      );

      yield* Effect.promise(async () => {
        const clickZone = document.querySelector(
          "[data-testid='editor-click-zone']",
        ) as HTMLElement;
        clickZone.click();
      });

      yield* Effect.promise(() =>
        waitFor(
          () => {
            const cm = document.querySelector(".cm-content");
            if (!cm) throw new Error("CodeMirror not found after body click");
            if (
              document.activeElement !== cm &&
              !cm.contains(document.activeElement)
            ) {
              throw new Error("CodeMirror not focused after body click");
            }
          },
          { timeout: 2000 },
        ),
      );

      yield* Then.SELECTION_IS_ON_BLOCK(blockId);
      yield* Then.SELECTION_IS_COLLAPSED_AT_OFFSET(0);
    }).pipe(runtime.runPromise);
  });

  it("clicking beside a block does NOT create or focus last block", async () => {
    await Effect.gen(function* () {
      const { bufferId, rootNodeId } = yield* Given.A_BUFFER_WITH_CHILDREN(
        "Document Title",
        [{ text: "some text" }],
      );

      render(() => <EditorBuffer bufferId={bufferId} />);

      const blockElement = yield* Effect.promise(() =>
        waitFor(
          () => {
            const block = document.querySelector("[data-element-type='block']");
            if (!block) throw new Error("Block not found");
            return block as HTMLElement;
          },
          { timeout: 2000 },
        ),
      );

      const blockRect = blockElement.getBoundingClientRect();
      const bodyArea = document.querySelector(
        "[data-testid='editor-body']",
      ) as HTMLElement;
      const bodyRect = bodyArea.getBoundingClientRect();

      const clickX = blockRect.right + 20;
      const clickY = blockRect.top + blockRect.height / 2;

      expect(
        clickX < bodyRect.right,
        `Test requires space beside block, but clickX (${clickX}) >= bodyRect.right (${bodyRect.right})`,
      ).toBe(true);

      const targetElement = document.elementFromPoint(clickX, clickY);

      const isClickingOnBlock =
        targetElement?.closest("[data-element-type='block']") !== null;
      expect(
        isClickingOnBlock,
        `Test requires clicking beside block, but coordinates (${clickX}, ${clickY}) land on block element`,
      ).toBe(false);

      yield* Effect.promise(async () => {
        if (targetElement) {
          const eventInit: MouseEventInit = {
            bubbles: true,
            cancelable: true,
            clientX: clickX,
            clientY: clickY,
            button: 0,
            buttons: 1,
          };
          targetElement.dispatchEvent(new MouseEvent("mousedown", eventInit));
          targetElement.dispatchEvent(new MouseEvent("mouseup", eventInit));
          targetElement.dispatchEvent(new MouseEvent("click", eventInit));
        }
      });

      yield* Then.BLOCK_COUNT_IS(1);
      yield* Then.NODE_HAS_CHILDREN(rootNodeId, 1);

      const cm = document.querySelector(".cm-content");
      expect(cm).toBeNull();

      const Buffer = yield* BufferT;
      const modelSelection = yield* Buffer.getSelection(bufferId);
      expect(Option.isNone(modelSelection)).toBe(true);
    }).pipe(runtime.runPromise);
  });
});
