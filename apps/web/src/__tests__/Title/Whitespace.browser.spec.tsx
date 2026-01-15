import "@/index.css";
import EditorBuffer from "@/ui/EditorBuffer";
import { Effect } from "effect";
import { waitFor } from "solid-testing-library";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { Given, setupClientTest, type BrowserRuntime } from "../bdd";

describe("Title whitespace rendering", () => {
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
   * Unfocused titles render with a simple <h1> tag.
   * HTML normally collapses whitespace, so we need to preserve it.
   */
  it("preserves newlines in unfocused title", async () => {
    await Effect.gen(function* () {
      const titleText = "first line\nsecond line";
      const { bufferId } = yield* Given.A_BUFFER_WITH_CHILDREN(titleText, []);

      render(() => <EditorBuffer bufferId={bufferId} />);

      yield* Effect.promise(() =>
        waitFor(
          () => {
            const title = document.querySelector("[data-element-type='title']");
            expect(title).not.toBeNull();
            const h1 = title!.querySelector("h1");
            expect(h1).not.toBeNull();
            expect(h1!.innerText).toBe("first line\nsecond line");
          },
          { timeout: 2000 },
        ),
      );
    }).pipe(runtime.runPromise);
  });

  it("preserves multiple consecutive spaces in unfocused title", async () => {
    await Effect.gen(function* () {
      const titleText = "word  word"; // double space
      const { bufferId } = yield* Given.A_BUFFER_WITH_CHILDREN(titleText, []);

      render(() => <EditorBuffer bufferId={bufferId} />);

      yield* Effect.promise(() =>
        waitFor(
          () => {
            const title = document.querySelector("[data-element-type='title']");
            expect(title).not.toBeNull();
            const h1 = title!.querySelector("h1");
            expect(h1).not.toBeNull();
            expect(h1!.innerText).toBe("word  word");
          },
          { timeout: 2000 },
        ),
      );
    }).pipe(runtime.runPromise);
  });
});
