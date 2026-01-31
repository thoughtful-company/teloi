import "@/index.css";
import { Id } from "@/schema";
import { WindowT } from "@/services/ui/Window";
import BufferView from "@/ui/BufferView";
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
      const { bufferId, childNodeIds } = yield* Given.A_BUFFER_WITH_CHILDREN(
        "Document Title",
        [{ text: "Some text" }],
      );

      const blockId = Id.makeBufferBlockId(bufferId, childNodeIds[0]);

      render(() => <BufferView bufferId={bufferId} />);

      yield* Given.BLOCK_IS_FOCUSED_AT(blockId, 0);

      const Window = yield* WindowT;
      const stream1 = yield* Window.subscribeActiveElement();
      const activeElement1 = yield* stream1.pipe(Stream.runHead);
      expect(Option.isSome(activeElement1)).toBe(true);
      const element1 = Option.getOrNull(activeElement1)!;
      expect(Option.isSome(element1)).toBe(true);
      const elementValue1 = Option.getOrNull(element1)!;
      expect(elementValue1.type).toBe("block");
      expect((elementValue1 as { id: string }).id).toBe(blockId);

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

      const stream2 = yield* Window.subscribeActiveElement();
      const activeElement2 = yield* stream2.pipe(Stream.runHead);

      expect(Option.isSome(activeElement2)).toBe(true);
      const element2 = Option.getOrNull(activeElement2)!;
      expect(Option.isNone(element2)).toBe(true);
    }).pipe(runtime.runPromise);
  });
});
