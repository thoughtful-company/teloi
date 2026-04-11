/**
 * Real-service unit test pinning the contract:
 * when PickerT.selectType fires inside a propertyTitle khora, the type is
 * applied to the propertyId — NOT the hostNodeId. Currently guarded by the
 * trigger gate (`TextTrigger/index.ts` only fires inside frame khoras), so
 * this test locks the invariant for when that gate eventually widens.
 */

import { events } from "@/livestore/schema";
import { Id, System } from "@/schema";
import { TypeT } from "@/services/domain/Type";
import { AutomergeT } from "@/services/external/Automerge";
import { StoreT } from "@/services/external/Store";
import { PickerT } from "@/services/ui/Picker";
import * as Given from "@/test-utils/bdd/given";
import {
  buildUiTestLayer,
  setupUnitTestWith,
} from "@/test-utils/unit/setup";
import { Effect } from "effect";
import { nanoid } from "nanoid";
import { beforeEach, describe, expect, it } from "vitest";

describe("PickerT.selectType — propertyTitle variant", () => {
  let runtime: Awaited<
    ReturnType<typeof setupUnitTestWith<PickerT | StoreT | AutomergeT | TypeT>>
  >["runtime"];
  let cleanup: (() => Promise<void>) | undefined;

  beforeEach(async () => {
    await cleanup?.();
    const setup = await setupUnitTestWith(
      buildUiTestLayer,
      "test-picker-proptitle",
    );
    runtime = setup.runtime;
    cleanup = setup.cleanup;
  });

  it("applies type to propertyId, not hostNodeId", async () => {
    await Effect.gen(function* () {
      const Store = yield* StoreT;
      const Automerge = yield* AutomergeT;
      const Type = yield* TypeT;
      const Picker = yield* PickerT;

      const { frameId, nodeId: hostNodeId } =
        yield* Given.A_FRAME_WITH_TEXT("Host block text");
      const propertyId = yield* Given.A_PROPERTY_WITH_TEXT("Title @ref");

      const khoraId = Id.makePropertyTitleKhoraId(
        frameId,
        hostNodeId,
        propertyId,
      );

      // Raw type node under System.SCHEMA — skip TypePicker.createType so we
      // get a deterministic ID with no auto-assigned color tuple.
      const typeId = Id.Node.make(nanoid());
      yield* Store.commit(
        events.nodeCreated({
          timestamp: Date.now(),
          data: {
            nodeId: typeId,
            parentId: System.SCHEMA,
            position: "a1",
          },
        }),
      );
      yield* Automerge.setText(typeId, "RefType");

      // `from = 6` is the position of the '@' in "Title @ref".
      yield* Picker.open(khoraId, { x: 0, y: 0 }, 6);
      yield* Picker.updateQuery("ref");
      yield* Picker.selectType(typeId);

      const appliedToProperty = yield* Type.hasType(propertyId, typeId);
      const appliedToHost = yield* Type.hasType(hostNodeId, typeId);

      expect(appliedToProperty).toBe(true);
      expect(appliedToHost).toBe(false);
    }).pipe(runtime.runPromise);
  });
});
