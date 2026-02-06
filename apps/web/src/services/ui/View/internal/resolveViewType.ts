import { Id, System } from "@/schema";
import { TypeT } from "@/services/domain/Type";
import { StoreT } from "@/services/external/Store";
import type { ViewType } from "@/services/ui/Block/views/types";
import { Effect, Option } from "effect";

export type { ViewType };

/**
 * Resolve the view type for a block based on its frame's activeViewId.
 * Returns "chat" if the active view has CHAT_VIEW type, otherwise "page".
 */
export const resolveViewType = Effect.fn("View.resolveViewType")(function* (
  blockId: Id.Block,
) {
  const Store = yield* StoreT;
  const Type = yield* TypeT;

  const ctx = Id.parseBlockContextSync(blockId);
  if (ctx.type !== "frame") return "page";

  const frameDoc = yield* Store.getDocument("frame", ctx.frameId);
  if (Option.isNone(frameDoc)) return "page";

  const activeViewId = frameDoc.value.activeViewId as Id.Node | null;
  if (!activeViewId) return "page";

  const isChatView = yield* Type.hasType(activeViewId, System.CHAT_VIEW);
  return isChatView ? "chat" : "page";
});
