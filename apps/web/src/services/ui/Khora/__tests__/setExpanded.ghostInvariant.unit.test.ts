/**
 * Pins the invariant: `ghostChildId` can only be set on frame khoras.
 * Ghosts are an outline-tree feature (see CLAUDE.md). If a non-frame khora
 * doc somehow ends up carrying `ghostChildId`, Khora.setExpanded's ghost-
 * cleanup branch should die loudly instead of silently falling through and
 * leaking the ghost.
 *
 * This test contrives the invariant violation by writing the bad state
 * directly via Store, then calling setExpanded. Before the tighten, the
 * code silently skipped the cleanup and succeeded. After, it dies.
 */

import { Id } from "@/schema";
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
import { Effect } from "effect";
import { beforeEach, describe, expect, it } from "vitest";

describe("Khora.setExpanded — ghost invariant", () => {
  let runtime: Awaited<
    ReturnType<
      typeof setupUnitTestWith<
        StoreT | KhoraT | FrameT | ViewT | PickerT | NodeT | AutomergeT
      >
    >
  >["runtime"];
  let cleanup: (() => Promise<void>) | undefined;

  beforeEach(async () => {
    await cleanup?.();
    const setup = await setupUnitTestWith(
      buildUiTestLayer,
      "test-khora-ghost",
    );
    runtime = setup.runtime;
    cleanup = setup.cleanup;
  });

  it("dies when collapsing a non-frame khora whose doc carries a ghostChildId", async () => {
    const program = Effect.gen(function* () {
      const Store = yield* StoreT;
      const Khora = yield* KhoraT;

      const { frameId, nodeId: hostNodeId } =
        yield* Given.A_FRAME_WITH_TEXT("Host");
      const propertyId = yield* Given.A_PROPERTY_WITH_TEXT("Title");
      const propertyTitleKhoraId = Id.makePropertyTitleKhoraId(
        frameId,
        hostNodeId,
        propertyId,
      );

      // Contrive the invariant violation: a propertyTitle khora doc carrying
      // a ghostChildId. This state should never occur in real code.
      yield* Store.setDocument(
        "khora",
        {
          isExpanded: true,
          activeViewId: null,
          ghostChildId: Id.Node.make("contrived-ghost-child"),
          ghostParentId: null,
        },
        propertyTitleKhoraId,
      );

      yield* Khora.setExpanded(propertyTitleKhoraId, false);
    });

    await expect(program.pipe(runtime.runPromise)).rejects.toThrow(
      /invariant/i,
    );
  });

  it("leaves normal non-frame setExpanded (no ghost) working silently", async () => {
    await Effect.gen(function* () {
      const Store = yield* StoreT;
      const Khora = yield* KhoraT;

      const { frameId, nodeId: hostNodeId } =
        yield* Given.A_FRAME_WITH_TEXT("Host");
      const propertyId = yield* Given.A_PROPERTY_WITH_TEXT("Title");
      const propertyTitleKhoraId = Id.makePropertyTitleKhoraId(
        frameId,
        hostNodeId,
        propertyId,
      );

      yield* Khora.setExpanded(propertyTitleKhoraId, false);

      const doc = yield* Store.getDocument("khora", propertyTitleKhoraId);
      expect(doc._tag).toBe("Some");
    }).pipe(runtime.runPromise);
  });
});
