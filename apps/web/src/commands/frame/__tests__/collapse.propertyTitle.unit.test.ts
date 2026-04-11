/**
 * Real-service unit test pinning the contract:
 * when Collapse fires in khora-selection mode on a propertyTitle target,
 * it no-ops. Without the guard, handleKhoraSelectionMode passes propertyId
 * into Khora.get (which silently returns defaults because it only knows
 * how to build frame khora IDs), walks Node.getParent to System.SCHEMA,
 * and teleports the user's selection to a phantom frame:{frameId}/node:{schema}
 * khora — writing a bogus khora doc along the way. No crash, pure state
 * corruption.
 */

import { Collapse } from "@/commands/frame/collapse";
import { Id, System } from "@/schema";
import { NodeT } from "@/services/domain/Node";
import { AutomergeT } from "@/services/external/Automerge";
import { StoreT } from "@/services/external/Store";
import { FrameT } from "@/services/ui/Frame";
import { KhoraT } from "@/services/ui/Khora";
import { PickerT } from "@/services/ui/Picker";
import { ViewT } from "@/services/ui/View";
import * as Given from "@/test-utils/bdd/given";
import {
  buildUiTestLayer,
  setupUnitTestWith,
} from "@/test-utils/unit/setup";
import { Effect, Option } from "effect";
import { beforeEach, describe, expect, it } from "vitest";

describe("Collapse command — propertyTitle in selection", () => {
  let runtime: Awaited<
    ReturnType<
      typeof setupUnitTestWith<
        StoreT | FrameT | KhoraT | ViewT | PickerT | NodeT | AutomergeT
      >
    >
  >["runtime"];
  let cleanup: (() => Promise<void>) | undefined;

  beforeEach(async () => {
    await cleanup?.();
    const setup = await setupUnitTestWith(
      buildUiTestLayer,
      "test-collapse-proptitle",
    );
    runtime = setup.runtime;
    cleanup = setup.cleanup;
  });

  it("no-ops when the selected target is a propertyTitle", async () => {
    await Effect.gen(function* () {
      const Store = yield* StoreT;

      const { frameId, propertyTitleKhoraId } =
        yield* Given.A_FRAME_WITH_PROPERTY_TITLE_SELECTED({
          hostText: "Host",
          titleText: "Title",
        });

      // Before the fix this silently walks Node.getParent up to System.SCHEMA
      // and jumps the selection to a phantom frame khora.
      yield* Collapse.handle(new Collapse());

      const frameAfter = yield* Store.getDocument("frame", frameId);
      const frameDoc = Option.getOrThrow(frameAfter);
      expect(frameDoc.selectedKhoras).toEqual([propertyTitleKhoraId]);
      expect(frameDoc.khoraSelectionAnchor).toBe(propertyTitleKhoraId);
      expect(frameDoc.khoraSelectionFocus).toBe(propertyTitleKhoraId);

      const bogusKhoraId = Id.makeFrameKhoraId(frameId, System.SCHEMA);
      const bogusDoc = yield* Store.getDocument("khora", bogusKhoraId);
      expect(Option.isNone(bogusDoc)).toBe(true);
    }).pipe(runtime.runPromise);
  });
});
