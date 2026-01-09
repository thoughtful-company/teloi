import "@/index.css";
import EditorBuffer from "@/ui/EditorBuffer";
import { Effect } from "effect";
import { afterEach, beforeEach, describe, it } from "vitest";
import { Given, Then, setupClientTest, type BrowserRuntime } from "./bdd";

describe("EditorBuffer", () => {
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

  it("renders block with node text content", async () => {
    await Effect.gen(function* () {
      const textContent = "Hello, this is a test block";
      const { bufferId } = yield* Given.A_BUFFER_WITH_TEXT(textContent);

      render(() => <EditorBuffer bufferId={bufferId} />);

      yield* Then.TEXT_IS_VISIBLE(textContent);
    }).pipe(runtime.runPromise);
  });

  // Isolation test: This test creates specific data that should NOT be visible
  // in the following test. If isolation works, each test gets a fresh store.
  it("isolation test part 1: creates unique data", async () => {
    await Effect.gen(function* () {
      const uniqueMarker = "ISOLATION_MARKER_XYZ_12345";
      const { bufferId } = yield* Given.A_BUFFER_WITH_TEXT(uniqueMarker);

      render(() => <EditorBuffer bufferId={bufferId} />);

      yield* Then.TEXT_IS_VISIBLE(uniqueMarker);
    }).pipe(runtime.runPromise);
  });

  // This test should NOT see the data from the previous test
  it("isolation test part 2: previous test data should not exist", async () => {
    await Effect.gen(function* () {
      // Create a different buffer with different content
      const differentContent = "This is a completely different buffer";
      const { bufferId } = yield* Given.A_BUFFER_WITH_TEXT(differentContent);

      render(() => <EditorBuffer bufferId={bufferId} />);

      // This should be visible (our own data)
      yield* Then.TEXT_IS_VISIBLE(differentContent);

      // The marker from the previous test should NOT be visible
      // If this passes, isolation is working!
      yield* Effect.sync(() => {
        const marker = document.body.textContent?.includes(
          "ISOLATION_MARKER_XYZ_12345",
        );
        if (marker) {
          throw new Error(
            "ISOLATION FAILURE: Data from previous test leaked into this test!",
          );
        }
      });
    }).pipe(runtime.runPromise);
  });
});
