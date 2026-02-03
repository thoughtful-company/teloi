import { NodeT } from "@/services/domain/Node";
import { StoreT } from "@/services/external/Store";
import { withContext } from "@/utils";
import { Context, Effect } from "effect";
import type { ViewNavigationT } from "../index";
import { findNextNodeInDocumentOrder } from "./findNextNodeInDocumentOrder";
import { findPreviousNode } from "./findPreviousNode";

export const makePageViewNavigation = Effect.gen(function* () {
  const Node = yield* NodeT;
  const Store = yield* StoreT;

  const context = Context.make(NodeT, Node).pipe(Context.add(StoreT, Store));

  const resolveAbove = withContext(findPreviousNode)(context);
  const resolveBelow = withContext(findNextNodeInDocumentOrder)(context);

  return {
    resolveBlockAbove: resolveAbove,
    resolveBlockBelow: resolveBelow,
    // In page view, left/right resolve to same targets as above/below
    resolveBlockLeft: resolveAbove,
    resolveBlockRight: resolveBelow,
  } satisfies ViewNavigationT["Type"];
});
