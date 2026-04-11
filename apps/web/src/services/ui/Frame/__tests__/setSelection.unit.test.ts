import { Id } from "@/schema";
import { StoreT } from "@/services/external/Store";
import { setSelection } from "@/services/ui/Frame/setSelection";
import * as Given from "@/test-utils/bdd/given";
import { setupUnitTest, type UnitRuntime } from "@/test-utils/unit/setup";
import { Effect, Option } from "effect";
import { beforeEach, describe, expect, it } from "vitest";

describe("Frame.setSelection — propertyTitle variant", () => {
  let runtime: UnitRuntime;
  let cleanup: (() => Promise<void>) | undefined;

  beforeEach(async () => {
    await cleanup?.();
    const setup = await setupUnitTest();
    runtime = setup.runtime;
    cleanup = setup.cleanup;
  });

  it("clamps anchor/head against the property title's own text length, not the host node's", async () => {
    await Effect.gen(function* () {
      // Host page has long text; the property title is short.
      // If the code mistakenly clamps against the host, the offset passes through uncorrected.
      const { frameId, rootNodeId: hostNodeId } =
        yield* Given.A_FRAME_WITH_CHILDREN(
          "A long page title with many characters",
          [],
        );

      const propertyId = yield* Given.A_PROPERTY_WITH_TEXT("Foo");

      const khoraId = Id.makePropertyTitleKhoraId(
        frameId,
        hostNodeId,
        propertyId,
      );

      // Offset 10 is inside the host text (39 chars) but beyond "Foo" (3 chars).
      yield* setSelection(
        frameId,
        Option.some({
          khoraId,
          selection: { anchor: 10, head: 10, assoc: 0 },
          goalX: null,
          goalLine: null,
        }),
      );

      const Store = yield* StoreT;
      const khoraDoc = yield* Store.getDocument("khora", khoraId);
      expect(Option.isSome(khoraDoc)).toBe(true);
      const textSelection = Option.getOrThrow(khoraDoc).textSelection;
      expect(textSelection).not.toBeNull();
      expect(textSelection!.anchor).toBe(3);
      expect(textSelection!.head).toBe(3);
    }).pipe(runtime.runPromise);
  });

  it("writes textSelection to the khora doc keyed by the propertyTitle khoraId", async () => {
    await Effect.gen(function* () {
      const { frameId, rootNodeId: hostNodeId } =
        yield* Given.A_FRAME_WITH_CHILDREN("Host", []);
      const propertyId = yield* Given.A_PROPERTY_WITH_TEXT("Price");
      const khoraId = Id.makePropertyTitleKhoraId(
        frameId,
        hostNodeId,
        propertyId,
      );

      yield* setSelection(
        frameId,
        Option.some({
          khoraId,
          selection: { anchor: 2, head: 4, assoc: 0 },
          goalX: null,
          goalLine: null,
        }),
      );

      const Store = yield* StoreT;
      const khoraDoc = yield* Store.getDocument("khora", khoraId);
      const textSelection = Option.getOrThrow(khoraDoc).textSelection;
      expect(textSelection).toEqual({
        anchor: 2,
        head: 4,
        assoc: 0,
        goalX: null,
        goalLine: null,
      });

      // The frame doc's activeKhoraId should point to the propertyTitle khora.
      const frameDoc = yield* Store.getDocument("frame", frameId);
      expect(Option.getOrThrow(frameDoc).activeKhoraId).toBe(khoraId);
    }).pipe(runtime.runPromise);
  });

  it("does not trigger ancestor expansion for propertyTitle (property nodes live outside the outline)", async () => {
    await Effect.gen(function* () {
      const { frameId, rootNodeId: hostNodeId } =
        yield* Given.A_FRAME_WITH_CHILDREN("Host", []);
      const propertyId = yield* Given.A_PROPERTY_WITH_TEXT("Foo");
      const khoraId = Id.makePropertyTitleKhoraId(
        frameId,
        hostNodeId,
        propertyId,
      );

      const Store = yield* StoreT;

      // Record the frame doc's toggledNodes before the call.
      const before = yield* Store.getDocument("frame", frameId);
      const toggledBefore = [...(Option.getOrThrow(before).toggledNodes ?? [])];

      yield* setSelection(
        frameId,
        Option.some({
          khoraId,
          selection: { anchor: 0, head: 0, assoc: 0 },
          goalX: null,
          goalLine: null,
        }),
      );

      // After the call, toggledNodes should be untouched — propertyTitle has no
      // outline ancestors to expand.
      const after = yield* Store.getDocument("frame", frameId);
      const toggledAfter = [...(Option.getOrThrow(after).toggledNodes ?? [])];
      expect(toggledAfter).toEqual(toggledBefore);
    }).pipe(runtime.runPromise);
  });
});
