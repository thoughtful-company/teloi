import { Id } from "@/schema";
import { TupleT } from "@/services/domain/Tuple";
import { TypeT } from "@/services/domain/Type";
import { AutomergeT } from "@/services/external/Automerge";
import { StoreT } from "@/services/external/Store";
import { withContext } from "@/utils";
import { Context, Effect, Layer, Stream } from "effect";
import { getMessages } from "./getMessages";
import { send } from "./send";
import { subscribeMessages, type ChatMessageEntry } from "./subscribeMessages";
import type { ChatError, ChatMessage } from "./types";

export type { ChatMessage } from "./types";
export type { ChatMessageEntry } from "./subscribeMessages";
export { ChatError } from "./types";

export class ChatT extends Context.Tag("ChatT")<
  ChatT,
  {
    /**
     * Get ordered messages for a chat node.
     * Reads CHAT_HAS_MESSAGE tuples, resolves role types, and returns content.
     */
    getMessages: (chatNodeId: Id.Node) => Effect.Effect<readonly ChatMessage[]>;

    /**
     * Subscribe to messages for a chat node.
     * Emits whenever CHAT_HAS_MESSAGE tuples change.
     * Only nodeId + role — no text content.
     */
    subscribeMessages: (
      chatNodeId: Id.Node,
    ) => Effect.Effect<Stream.Stream<readonly ChatMessageEntry[]>>;

    /**
     * Send conversation to LLM and create response message.
     * Returns the new response node ID.
     */
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

    const context = Context.make(StoreT, Store).pipe(
      Context.add(TupleT, Tuple),
      Context.add(TypeT, Type),
      Context.add(AutomergeT, Automerge),
    );

    return {
      getMessages: withContext(getMessages)(context),
      subscribeMessages: withContext(subscribeMessages)(context),
      send: withContext(send)(context),
    };
  }),
);
