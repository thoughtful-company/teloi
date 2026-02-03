import { TupleT } from "@/services/domain/Tuple";
import { TypeT } from "@/services/domain/Type";
import { StoreT } from "@/services/external/Store";
import { withContext } from "@/utils";
import { Context, Effect, Option } from "effect";
import type { ViewNavigationT } from "../index";
import { createBlock } from "./createBlock";

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
    // Chat view uses tuple ordering, not tree ordering — navigation stubs for now
    resolveBlockAbove: (_nodeId, _bufferId) => Effect.succeed(Option.none()),
    resolveBlockBelow: (_nodeId, _bufferId) => Effect.succeed(Option.none()),
    resolveBlockLeft: (_nodeId, _bufferId) => Effect.succeed(Option.none()),
    resolveBlockRight: (_nodeId, _bufferId) => Effect.succeed(Option.none()),
    createBlock: withContext(createBlock)(context),
  } satisfies ViewNavigationT["Type"];
});
