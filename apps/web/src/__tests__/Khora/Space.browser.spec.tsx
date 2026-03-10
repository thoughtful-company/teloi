import "@/index.css";
import { Id } from "@/schema";
import { NodeT } from "@/services/domain/Node";
import { FrameT } from "@/services/ui/Frame";
import { WindowT } from "@/services/ui/Window";
import FrameView from "@/ui/FrameView";
import { Effect, Option } from "effect";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { waitFor } from "solid-testing-library";
import {
  Given,
  Then,
  When,
  setupClientTest,
  type BrowserRuntime,
} from "@/test-utils/bdd";

describe("Space in khora selection mode", () => {
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

  it("creates sibling block after focused block and enters editing mode", async () => {
    await Effect.gen(function* () {
      const { frameId, rootNodeId, childNodeIds } =
        yield* Given.A_FRAME_WITH_CHILDREN("Root", [{ text: "First block" }]);

      const firstKhoraId = Id.makeFrameKhoraId(frameId, childNodeIds[0]);
      render(() => <FrameView frameId={frameId} />);

      const Frame = yield* FrameT;
      const Window = yield* WindowT;
      yield* Frame.setKhoraSelection(
        frameId,
        [childNodeIds[0]],
        childNodeIds[0],
        childNodeIds[0],
      );
      yield* Window.setActiveElement(
        Option.some({ type: "frame" as const, id: frameId }),
      );
      yield* When.FOCUS_FRAME_CONTAINER(frameId);

      yield* Then.BLOCKS_ARE_SELECTED(frameId, [childNodeIds[0]]);

      yield* When.USER_PRESSES(" ");

      yield* Then.NODE_HAS_CHILDREN(rootNodeId, 2);

      const Node = yield* NodeT;
      const children = yield* Node.getNodeChildren(rootNodeId);

      expect(children[0]).toBe(childNodeIds[0]);

      const newNodeId = children[1]!;
      yield* Then.NODE_HAS_TEXT(newNodeId, "");

      yield* Effect.promise(() =>
        waitFor(
          async () => {
            const windowDoc = await Then.WINDOW_DOC_COMPAT(frameId).pipe(
              runtime.runPromise,
            );
            expect(Option.isSome(windowDoc)).toBe(true);
            const win = Option.getOrThrow(windowDoc);
            expect(win.activeElement?.type).toBe("khora");
            expect(win.selectedKhoras).toEqual([]);
          },
          { timeout: 2000 },
        ),
      );
    }).pipe(runtime.runPromise);
  });

  it("creates sibling at same level for nested blocks", async () => {
    await Effect.gen(function* () {
      const { frameId, rootNodeId, childNodeIds } =
        yield* Given.A_FRAME_WITH_CHILDREN("Root", [{ text: "Parent block" }]);

      const parentNodeId = childNodeIds[0];

      const nestedChild = yield* Given.INSERT_NODE_WITH_TEXT({
        parentId: parentNodeId,
        insert: "after",
        text: "Nested child",
      });

      const nestedBlockId = Id.makeFrameKhoraId(frameId, nestedChild);
      render(() => <FrameView frameId={frameId} />);

      const Frame = yield* FrameT;
      const Window = yield* WindowT;
      yield* Frame.setKhoraSelection(
        frameId,
        [nestedChild],
        nestedChild,
        nestedChild,
      );
      yield* Window.setActiveElement(
        Option.some({ type: "frame" as const, id: frameId }),
      );
      yield* When.FOCUS_FRAME_CONTAINER(frameId);

      yield* Then.BLOCKS_ARE_SELECTED(frameId, [nestedChild]);

      yield* When.USER_PRESSES(" ");

      const Node = yield* NodeT;

      yield* Then.NODE_HAS_CHILDREN(rootNodeId, 1);

      yield* Then.NODE_HAS_CHILDREN(parentNodeId, 2);

      const parentChildren = yield* Node.getNodeChildren(parentNodeId);
      expect(parentChildren[0]).toBe(nestedChild);
      const newSibling = parentChildren[1]!;
      yield* Then.NODE_HAS_TEXT(newSibling, "");
    }).pipe(runtime.runPromise);
  });
});
