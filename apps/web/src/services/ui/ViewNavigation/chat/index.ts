import { TupleT } from "@/services/domain/Tuple";
import { TypeT } from "@/services/domain/Type";
import { StoreT } from "@/services/external/Store";
import { withContext } from "@/utils";
import { Context, Effect, Option } from "effect";
import type { ViewNavigationT } from "../index";
import { createBlock } from "./createBlock";
import { resolveAbove } from "./resolveAbove";
import { resolveBelow } from "./resolveBelow";

export const makeChatViewNavigation = Effect.gen(function* () {
  const Store = yield* StoreT;
  const Tuple = yield* TupleT;
  const Type = yield* TypeT;

  const context = Context.empty().pipe(
    Context.add(StoreT, Store),
    Context.add(TupleT, Tuple),
    Context.add(TypeT, Type),
  );

  return {
    resolveBlockAbove: withContext(resolveAbove)(context),
    resolveBlockBelow: withContext(resolveBelow)(context),
    resolveBlockLeft: (_nodeId, _bufferId) => Effect.succeed(Option.none()),
    resolveBlockRight: (_nodeId, _bufferId) => Effect.succeed(Option.none()),
    createBlock: withContext(createBlock)(context),
  } satisfies ViewNavigationT["Type"];
});
