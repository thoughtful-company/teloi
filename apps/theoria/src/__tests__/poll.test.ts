import { waitFor } from "@solidjs/testing-library";
import { Cause, Effect, Option } from "effect";
import { createRoot } from "solid-js";
import { assert, describe, it } from "vitest";
import { createPolled } from "../poll.ts";

// createPolled is a plain function over an Effect, so the requests here are
// real effects that die or fail, and no server or mock stands in for one.
// Each keeps failing until the test lets it succeed, because a poll every
// few milliseconds would otherwise clear the failure before it can be seen.
describe("createPolled", () => {
  it("keeps polling after a defect and says what it was", async () => {
    let asked = 0;
    let healed = false;
    const request = () =>
      Effect.suspend(() => {
        asked += 1;
        return healed ? Effect.succeed(asked) : Effect.die("boom");
      });

    await createRoot(async (dispose) => {
      const polled = createPolled(request, "5 millis");

      await waitFor(() => assert.isTrue(Option.isSome(polled.failure())));
      assert.strictEqual(
        Option.getOrUndefined(Option.map(polled.failure(), Cause.squash)),
        "boom",
      );
      assert.isTrue(Option.isNone(polled.latest()));

      healed = true;

      // An answer arriving at all is the loop having survived the defect.
      await waitFor(() => assert.isTrue(Option.isSome(polled.latest())));
      assert.isTrue(Option.isNone(polled.failure()));
      assert.isAbove(Option.getOrUndefined(polled.latest()) ?? 0, 1);
      dispose();
    });
  });

  it("keeps the last answer when a later request fails", async () => {
    let asked = 0;
    let healed = true;
    const request = () =>
      Effect.suspend(() => {
        asked += 1;
        return healed
          ? Effect.succeed(asked)
          : Effect.fail({ _tag: "Gone" as const });
      });

    await createRoot(async (dispose) => {
      const polled = createPolled(request, "5 millis");

      await waitFor(() => assert.isTrue(Option.isSome(polled.latest())));
      const seen = Option.getOrUndefined(polled.latest());
      healed = false;

      await waitFor(() => assert.isTrue(Option.isSome(polled.failure())));
      // Whatever the last good answer was is still there beside the failure.
      assert.isDefined(Option.getOrUndefined(polled.latest()));
      assert.isAtLeast(Option.getOrUndefined(polled.latest()) ?? 0, seen ?? 0);

      healed = true;

      await waitFor(() => assert.isTrue(Option.isNone(polled.failure())));
      assert.isAbove(Option.getOrUndefined(polled.latest()) ?? 0, seen ?? 0);
      dispose();
    });
  });
});
