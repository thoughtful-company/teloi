import "@/index.css";
import FrameView from "@/ui/FrameView";
import { Effect } from "effect";
import { afterEach, beforeEach, describe, it } from "vitest";
import {
  Given,
  Then,
  setupClientTest,
  type BrowserRuntime,
} from "@/test-utils/bdd";

describe("Frame", () => {
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
      const { frameId } = yield* Given.A_FRAME_WITH_TEXT(textContent);

      render(() => <FrameView frameId={frameId} />);

      yield* Then.TEXT_IS_VISIBLE(textContent);
    }).pipe(runtime.runPromise);
  });

  // Isolation test: This test creates specific data that should NOT be visible
  // in the following test. If isolation works, each test gets a fresh store.
  it("isolation test part 1: creates unique data", async () => {
    await Effect.gen(function* () {
      const uniqueMarker = "ISOLATION_MARKER_XYZ_12345";
      const { frameId } = yield* Given.A_FRAME_WITH_TEXT(uniqueMarker);

      render(() => <FrameView frameId={frameId} />);

      yield* Then.TEXT_IS_VISIBLE(uniqueMarker);
    }).pipe(runtime.runPromise);
  });

  // This test should NOT see the data from the previous test
  it("isolation test part 2: previous test data should not exist", async () => {
    await Effect.gen(function* () {
      // Create a different frame with different content
      const differentContent = "This is a completely different frame";
      const { frameId } = yield* Given.A_FRAME_WITH_TEXT(differentContent);

      render(() => <FrameView frameId={frameId} />);

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
