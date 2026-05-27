import { Id, System } from "@/schema";
import { TypeT } from "@/services/domain/Type";
import { StoreT } from "@/services/external/Store";
import type { ViewType } from "@/services/ui/Khora/views/types";
import { Effect, Option } from "effect";

export type { ViewType };

/**
 * Resolve the view type for a block based on that khora's activeViewId.
 * Returns "chat" if the active view has CHAT_VIEW type, otherwise "page".
 */
export const resolveViewType = Effect.fn("View.resolveViewType")(function* (
  khoraId: Id.Khora,
) {
  const Store = yield* StoreT;
  const Type = yield* TypeT;

  // Non-frame khoras (section, propertyTitle) don't participate in khora-
  // local view selection here. Callers in View/index.ts already gate on
  // ctx.type === "frame" before reaching here, so this return is defensive
  // rather than load-bearing — "page" is just the inert default.
  const ctx = Id.parseKhoraContextSync(khoraId);
  if (ctx.type !== "frame") return "page";

  const khoraDoc = yield* Store.getDocument("khora", khoraId);
  if (Option.isNone(khoraDoc)) return "page";

  const activeViewId = khoraDoc.value.activeViewId;
  if (!activeViewId) return "page";

  const isChatView = yield* Type.hasType(activeViewId, System.CHAT_VIEW);
  return isChatView ? "chat" : "page";
});
