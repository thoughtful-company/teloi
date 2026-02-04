import { Id } from "@/schema";
import { TupleT } from "@/services/domain/Tuple";
import { TypeT } from "@/services/domain/Type";
import { AutomergeT } from "@/services/external/Automerge";
import { ChatProviderT } from "@/services/external/ChatProvider";
import { StoreT } from "@/services/external/Store";
import { withContext } from "@/utils";
import { Context, Effect, Layer, Stream } from "effect";
import { getMessages } from "./getMessages";
import { send } from "./send";
import { subscribeMessages } from "./subscribeMessages";
import type { ChatError, ChatMessage, ChatMessageEntry } from "./types";

export type { ChatMessage, ChatMessageEntry } from "./types";
export { ChatError } from "./types";

export class ChatT extends Context.Tag("ChatT")<
  ChatT,
  {
    getMessages: (chatNodeId: Id.Node) => Effect.Effect<readonly ChatMessage[]>;
    subscribeMessages: (
      chatNodeId: Id.Node,
    ) => Effect.Effect<Stream.Stream<readonly ChatMessageEntry[]>>;
    send: (chatNodeId: Id.Node) => Effect.Effect<Id.Node, ChatError>;
  }
>() {}

export const ChatLive = Layer.effect(
  ChatT,
  Effect.gen(function* () {
    const Store = yield* StoreT;
    const Tuple = yield* TupleT;
    const Type = yield* TypeT;
    const Automerge = yield* AutomergeT;
    const ChatProvider = yield* ChatProviderT;

    const context = Context.make(StoreT, Store).pipe(
      Context.add(TupleT, Tuple),
      Context.add(TypeT, Type),
      Context.add(AutomergeT, Automerge),
      Context.add(ChatProviderT, ChatProvider),
    );

    return {
      getMessages: withContext(getMessages)(context),
      subscribeMessages: withContext(subscribeMessages)(context),
      send: withContext(send)(context),
    };
  }),
);
