import "@/index.css";
import { WindowT } from "@/services/ui/Window";
import FrameView from "@/ui/FrameView";
import { Effect, Option, Stream } from "effect";
import { waitFor } from "solid-testing-library";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  Given,
  When,
  setupClientTest,
  type BrowserRuntime,
} from "@/test-utils/bdd";

describe("Title blur clears activeElement", () => {
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

  it("clears activeElement when clicking outside focused title", async () => {
    await Effect.gen(function* () {
      const { frameId } = yield* Given.A_FRAME_WITH_CHILDREN(
        "Document Title",
        [{ text: "Some text" }],
      );

      render(() => <FrameView frameId={frameId} />);

      yield* When.USER_CLICKS_TITLE(frameId);

      yield* Effect.promise(() =>
        waitFor(
          () => {
            const titleEl = document.querySelector(
              `[data-element-type="title"]`,
            );
            const cm = titleEl?.querySelector(".cm-content");
            if (!cm) throw new Error("Title CodeMirror not found");
            if (
              document.activeElement !== cm &&
              !cm.contains(document.activeElement)
            ) {
              throw new Error("Title CodeMirror not focused");
            }
          },
          { timeout: 2000 },
        ),
      );

      const Window = yield* WindowT;
      const stream1 = yield* Window.subscribeActiveElement();
      const activeElement1 = yield* stream1.pipe(Stream.runHead);
      expect(Option.isSome(activeElement1)).toBe(true);
      const element1 = Option.getOrNull(activeElement1)!;
      expect(Option.isSome(element1)).toBe(true);
      const elementValue1 = Option.getOrNull(element1)!;
      expect(elementValue1.type).toBe("title");
      expect((elementValue1 as { frameId: string }).frameId).toBe(frameId);

      yield* Effect.promise(async () => {
        const titleEl = document.querySelector(`[data-element-type="title"]`);
        const cm = titleEl?.querySelector(".cm-content") as HTMLElement;
        if (!cm) throw new Error("Title CodeMirror not found");
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
