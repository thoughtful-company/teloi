import "@/index.css";
import FrameView from "@/ui/FrameView";
import { Effect } from "effect";
import { waitFor } from "solid-testing-library";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { Given, setupClientTest, type BrowserRuntime } from "@/test-utils/bdd";

describe("Block whitespace rendering", () => {
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

  /**
   * Unfocused blocks render with a simple <p> tag.
   * HTML normally collapses whitespace, so we need to preserve it.
   */
  it("preserves newlines in unfocused blocks", async () => {
    await Effect.gen(function* () {
      const textContent = "first line\nsecond line";
      const { frameId } = yield* Given.A_FRAME_WITH_CHILDREN("Root", [
        { text: textContent },
      ]);

      render(() => <FrameView frameId={frameId} />);

      yield* Effect.promise(() =>
        waitFor(
          () => {
            const block = document.querySelector("[data-element-type='block']");
            expect(block).not.toBeNull();
            const p = block!.querySelector("p");
            expect(p).not.toBeNull();
            expect(p!.innerText).toBe("first line\nsecond line");
          },
          { timeout: 2000 },
        ),
      );
    }).pipe(runtime.runPromise);
  });

  it("preserves multiple consecutive spaces in unfocused blocks", async () => {
    await Effect.gen(function* () {
      const textContent = "word  word"; // double space
      const { frameId } = yield* Given.A_FRAME_WITH_CHILDREN("Root", [
        { text: textContent },
      ]);

      render(() => <FrameView frameId={frameId} />);

      yield* Effect.promise(() =>
        waitFor(
          () => {
            const block = document.querySelector("[data-element-type='block']");
            expect(block).not.toBeNull();
            const p = block!.querySelector("p");
            expect(p).not.toBeNull();
            expect(p!.innerText).toBe("word  word");
          },
          { timeout: 2000 },
        ),
      );
    }).pipe(runtime.runPromise);
  });
});
