/**
 * Real-service unit test pinning the contract:
 * when Space fires in khora-selection mode and the source khora is a
 * propertyTitle, the command no-ops instead of crashing. Without the guard,
 * View.createKhora hits Effect.die on any non-frame khora.
 */

import { Space } from "@/commands/frame/space";
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

describe("Space command — propertyTitle in selection", () => {
  let runtime: Awaited<
    ReturnType<
      typeof setupUnitTestWith<
        StoreT | FrameT | ViewT | KhoraT | PickerT | NodeT | AutomergeT
      >
    >
  >["runtime"];
  let cleanup: (() => Promise<void>) | undefined;

  beforeEach(async () => {
    await cleanup?.();
    const setup = await setupUnitTestWith(
      buildUiTestLayer,
      "test-space-proptitle",
    );
    runtime = setup.runtime;
    cleanup = setup.cleanup;
  });

  it("no-ops (does not die) when the focused selection is a propertyTitle", async () => {
    await Effect.gen(function* () {
      const Store = yield* StoreT;
      const Node = yield* NodeT;

      const { frameId, hostNodeId, propertyTitleKhoraId } =
        yield* Given.A_FRAME_WITH_PROPERTY_TITLE_SELECTED({
          hostText: "Host block",
          titleText: "Title",
        });

      // Before the fix this crashes inside View.createKhora.
      yield* Space.handle(new Space());

      const hostChildren = yield* Node.getNodeChildren(hostNodeId);
      expect(hostChildren).toEqual([]);

      const frameAfter = yield* Store.getDocument("frame", frameId);
      const frameDoc = Option.getOrThrow(frameAfter);
      expect(frameDoc.activeKhoraId).toBeNull();
      expect(frameDoc.selectedKhoras).toEqual([propertyTitleKhoraId]);
    }).pipe(runtime.runPromise);
  });
});
