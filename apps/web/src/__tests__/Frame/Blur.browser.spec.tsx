import "@/index.css";
import { Id } from "@/schema";
import { WindowT } from "@/services/ui/Window";
import FrameView from "@/ui/FrameView";
import { Effect, Option, Stream } from "effect";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { Given, setupClientTest, type BrowserRuntime } from "@/test-utils/bdd";

describe("Block blur clears activeElement", () => {
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

  it("clears activeElement when clicking outside focused block", async () => {
    await Effect.gen(function* () {
      const { frameId, childNodeIds } = yield* Given.A_FRAME_WITH_CHILDREN(
        "Document Title",
        [{ text: "Some text" }],
      );

      const khoraId = Id.makeFrameKhoraId(frameId, childNodeIds[0]);

      render(() => <FrameView frameId={frameId} />);

      yield* Given.KHORA_IS_FOCUSED_AT(khoraId, 0);

      const Window = yield* WindowT;
      const stream1 = yield* Window.subscribeActiveElement();
      const activeElement1 = yield* stream1.pipe(Stream.runHead);
      expect(Option.isSome(activeElement1)).toBe(true);
      const element1 = Option.getOrNull(activeElement1)!;
      expect(Option.isSome(element1)).toBe(true);
      const elementValue1 = Option.getOrNull(element1)!;
      expect(elementValue1.type).toBe("khora");
      expect((elementValue1 as { id: string }).id).toBe(khoraId);

      yield* Effect.promise(async () => {
        const blockEl = document.querySelector(
          `[data-element-id="${khoraId}"]`,
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

      const stream2 = yield* Window.subscribeActiveElement();
      const activeElement2 = yield* stream2.pipe(Stream.runHead);

      expect(Option.isSome(activeElement2)).toBe(true);
      const element2 = Option.getOrNull(activeElement2)!;
      expect(Option.isNone(element2)).toBe(true);
    }).pipe(runtime.runPromise);
  });
});
