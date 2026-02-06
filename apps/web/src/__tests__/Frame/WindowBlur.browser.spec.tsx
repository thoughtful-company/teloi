import "@/index.css";
import { Id } from "@/schema";
import { FrameT } from "@/services/ui/Frame";
import { WindowT } from "@/services/ui/Window";
import FrameView from "@/ui/FrameView";
import { Effect, Option, Stream } from "effect";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { Given, setupClientTest, type BrowserRuntime } from "@/test-utils/bdd";

describe("Window blur preserves selection", () => {
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

  it("preserves selection when window loses focus (alt-tab)", async () => {
    await Effect.gen(function* () {
      const { frameId, childNodeIds } = yield* Given.A_FRAME_WITH_CHILDREN(
        "Document Title",
        [{ text: "Some text" }],
      );

      const blockId = Id.makeFrameBlockId(frameId, childNodeIds[0]);

      render(() => <FrameView frameId={frameId} />);

      yield* Given.BLOCK_IS_FOCUSED_AT(blockId, 0);

      const Window = yield* WindowT;
      const Frame = yield* FrameT;
      const stream1 = yield* Window.subscribeActiveElement();
      const activeElement1 = yield* stream1.pipe(Stream.runHead);
      expect(Option.isSome(activeElement1)).toBe(true);
      const element1 = Option.getOrNull(activeElement1)!;
      expect(Option.isSome(element1)).toBe(true);

      const selectionBefore = yield* Frame.getSelection(frameId);
      expect(Option.isSome(selectionBefore)).toBe(true);

      yield* Effect.promise(async () => {
        const originalHasFocus = document.hasFocus.bind(document);
        document.hasFocus = () => false;

        try {
          const blockEl = document.querySelector(
            `[data-element-id="${blockId}"]`,
          );
          const cm = blockEl?.querySelector(".cm-content") as HTMLElement;
          if (!cm) throw new Error("Block CodeMirror not found");

          cm.dispatchEvent(
            new FocusEvent("focusout", { bubbles: true, relatedTarget: null }),
          );
          cm.blur();

          await new Promise((r) => setTimeout(r, 100));
        } finally {
          document.hasFocus = originalHasFocus;
        }
      });

      yield* Effect.sleep("300 millis");

      const selectionAfter = yield* Frame.getSelection(frameId);
      expect(Option.isSome(selectionAfter)).toBe(true);

      const stream2 = yield* Window.subscribeActiveElement();
      const activeElement2 = yield* stream2.pipe(Stream.runHead);
      expect(Option.isSome(activeElement2)).toBe(true);
      const element2 = Option.getOrNull(activeElement2)!;
      expect(Option.isSome(element2)).toBe(true);
    }).pipe(runtime.runPromise);
  });

  it("still clears selection when user clicks outside (document has focus)", async () => {
    await Effect.gen(function* () {
      const { frameId, childNodeIds } = yield* Given.A_FRAME_WITH_CHILDREN(
        "Document Title",
        [{ text: "Some text" }],
      );

      const blockId = Id.makeFrameBlockId(frameId, childNodeIds[0]);

      render(() => <FrameView frameId={frameId} />);

      yield* Given.BLOCK_IS_FOCUSED_AT(blockId, 0);

      const Frame = yield* FrameT;
      const selectionBefore = yield* Frame.getSelection(frameId);
      expect(Option.isSome(selectionBefore)).toBe(true);

      yield* Effect.promise(async () => {
        const blockEl = document.querySelector(
          `[data-element-id="${blockId}"]`,
        );
        const cm = blockEl?.querySelector(".cm-content") as HTMLElement;
        if (!cm) throw new Error("Block CodeMirror not found");

        cm.dispatchEvent(
          new FocusEvent("focusout", {
            bubbles: true,
            relatedTarget: document.body,
          }),
        );
        cm.blur();
      });

      yield* Effect.sleep("300 millis");

      const selectionAfter = yield* Frame.getSelection(frameId);
      expect(Option.isNone(selectionAfter)).toBe(true);
    }).pipe(runtime.runPromise);
  });
});
