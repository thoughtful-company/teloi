import "@/index.css";
import { Id } from "@/schema";
import { NodeT } from "@/services/domain/Node";
import { AutomergeT } from "@/services/external/Automerge";
import FrameView from "@/ui/FrameView";
import { doubleRaf } from "@/utils/effect";
import { Effect } from "effect";
import { beforeEach, describe, expect, it } from "vitest";
import { waitFor } from "solid-testing-library";
import { Given, setupClientTest, type BrowserRuntime } from "@/test-utils/bdd";

describe("Triangle chevron visibility", () => {
  let runtime: BrowserRuntime;
  let render: Awaited<ReturnType<typeof setupClientTest>>["render"];
  let cleanup: () => Promise<void>;

  beforeEach(async () => {
    if (cleanup!) await cleanup();
    const setup = await setupClientTest();
    runtime = setup.runtime;
    render = setup.render;
    cleanup = setup.cleanup;
  });

  it("triangle button is always visible when a block has children", async () => {
    await Effect.gen(function* () {
      const { frameId, childNodeIds } = yield* Given.A_FRAME_WITH_CHILDREN(
        "Root",
        [{ text: "Parent" }],
      );

      const parentNodeId = childNodeIds[0];
      const parentBlockId = Id.makeFrameBlockId(frameId, parentNodeId);

      // Give the parent a child so it has children
      yield* Given.INSERT_NODE_WITH_TEXT({
        parentId: parentNodeId,
        insert: "after",
        text: "Child of parent",
      });

      render(() => <FrameView frameId={frameId} />);

      yield* doubleRaf;

      const blockEl = document.querySelector(
        `[data-element-id="${parentBlockId}"]`,
      );
      expect(blockEl, "Block element should exist").not.toBeNull();

      const triangleButton = blockEl!.querySelector("button");
      expect(triangleButton, "Triangle button should exist").not.toBeNull();

      // When a block has children, the button should NOT have opacity-0
      expect(
        triangleButton!.classList.contains("opacity-0"),
        "Triangle button should not have opacity-0 class when block has children",
      ).toBe(false);
    }).pipe(runtime.runPromise);
  });

  it("triangle button has opacity-0 class when a block has no children", async () => {
    await Effect.gen(function* () {
      const { frameId, childNodeIds } = yield* Given.A_FRAME_WITH_CHILDREN(
        "Root",
        [{ text: "Childless block" }],
      );

      const childlessNodeId = childNodeIds[0];
      const childlessBlockId = Id.makeFrameBlockId(frameId, childlessNodeId);

      render(() => <FrameView frameId={frameId} />);

      yield* doubleRaf;

      const blockEl = document.querySelector(
        `[data-element-id="${childlessBlockId}"]`,
      );
      expect(blockEl, "Block element should exist").not.toBeNull();

      const triangleButton = blockEl!.querySelector("button");
      expect(triangleButton, "Triangle button should exist").not.toBeNull();

      // When a block has no children, the button should have opacity-0
      expect(
        triangleButton!.classList.contains("opacity-0"),
        "Triangle button should have opacity-0 class when block has no children",
      ).toBe(true);
    }).pipe(runtime.runPromise);
  });

  it("triangle button has hover:opacity-100 class for childless blocks", async () => {
    await Effect.gen(function* () {
      const { frameId, childNodeIds } = yield* Given.A_FRAME_WITH_CHILDREN(
        "Root",
        [{ text: "Childless block" }],
      );

      const childlessNodeId = childNodeIds[0];
      const childlessBlockId = Id.makeFrameBlockId(frameId, childlessNodeId);

      render(() => <FrameView frameId={frameId} />);

      yield* doubleRaf;

      const blockEl = document.querySelector(
        `[data-element-id="${childlessBlockId}"]`,
      );
      expect(blockEl, "Block element should exist").not.toBeNull();

      const triangleButton = blockEl!.querySelector("button");
      expect(triangleButton, "Triangle button should exist").not.toBeNull();

      // Childless blocks should have hover:opacity-100 so hovering reveals the button
      expect(
        triangleButton!.classList.contains("hover:opacity-100"),
        "Triangle button should have hover:opacity-100 class for childless blocks",
      ).toBe(true);
    }).pipe(runtime.runPromise);
  });

  it("triangle becomes visible when children are added to a childless block", async () => {
    await Effect.gen(function* () {
      const { frameId, childNodeIds } = yield* Given.A_FRAME_WITH_CHILDREN(
        "Root",
        [{ text: "Initially childless" }],
      );

      const nodeId = childNodeIds[0];
      const blockId = Id.makeFrameBlockId(frameId, nodeId);

      render(() => <FrameView frameId={frameId} />);

      yield* doubleRaf;

      // Verify the triangle starts with opacity-0 (no children)
      const blockEl = document.querySelector(`[data-element-id="${blockId}"]`);
      expect(blockEl, "Block element should exist").not.toBeNull();

      const triangleButton = blockEl!.querySelector("button");
      expect(triangleButton, "Triangle button should exist").not.toBeNull();
      expect(
        triangleButton!.classList.contains("opacity-0"),
        "Triangle should start hidden (opacity-0) when block has no children",
      ).toBe(true);

      // Add a child to the block
      const Node = yield* NodeT;
      const Automerge = yield* AutomergeT;
      const childId = yield* Node.insertNode({
        parentId: nodeId,
        insert: "after",
      });
      yield* Automerge.setText(childId, "New child");

      // Wait for the DOM to update and the opacity-0 class to be removed
      yield* Effect.promise(() =>
        waitFor(
          () => {
            const updatedBlockEl = document.querySelector(
              `[data-element-id="${blockId}"]`,
            );
            expect(
              updatedBlockEl,
              "Block element should still exist",
            ).not.toBeNull();

            const updatedButton = updatedBlockEl!.querySelector("button");
            expect(
              updatedButton,
              "Triangle button should still exist",
            ).not.toBeNull();

            expect(
              updatedButton!.classList.contains("opacity-0"),
              "Triangle should become visible (no opacity-0) after children are added",
            ).toBe(false);
          },
          { timeout: 3000 },
        ),
      );
    }).pipe(runtime.runPromise);
  });
});
