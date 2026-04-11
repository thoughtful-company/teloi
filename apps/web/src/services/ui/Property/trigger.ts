import { NodeT } from "@/services/domain/Node";
import { FrameT } from "@/services/ui/Frame";
import { PropertyT } from "@/services/ui/Property";
import type { TextTrigger } from "@/services/ui/TextTrigger";
import { ViewT } from "@/services/ui/View";
import { Effect } from "effect";

/**
 * Typing "> " at the start of an outline block creates an empty property
 * on the page's default view and deletes the triggering block.
 */
export const propertyTrigger: TextTrigger = {
  pattern: /^> $/,
  action: (ctx) =>
    Effect.gen(function* () {
      const Frame = yield* FrameT;
      const View = yield* ViewT;
      const Property = yield* PropertyT;
      const Node = yield* NodeT;

      const pageId = yield* Frame.getAssignedKhoraId(ctx.frameId);
      if (pageId == null) {
        return yield* Effect.die(
          new Error(
            `Property trigger fired on frame ${ctx.frameId} with no assigned root khora`,
          ),
        );
      }

      const viewId = yield* View.getOrCreateView(pageId);
      const propertyId = yield* Property.createProperty(viewId);
      yield* Node.deleteNode(ctx.nodeId);

      yield* Effect.logDebug("[propertyTrigger] Property created").pipe(
        Effect.annotateLogs({
          pageId,
          viewId,
          propertyId,
          deletedNodeId: ctx.nodeId,
        }),
      );
    }).pipe(
      Effect.annotateLogs({
        trigger: "property",
        khoraId: ctx.khoraId,
        nodeId: ctx.nodeId,
        frameId: ctx.frameId,
      }),
      Effect.orDie,
    ),
};
