import { events } from "@/livestore/schema";
import { Id, System } from "@/schema";
import { TupleT } from "@/services/domain/Tuple";
import { TypeT } from "@/services/domain/Type";
import { AutomergeT } from "@/services/external/Automerge";
import {
  ChatProviderT,
  type ProviderMessage,
} from "@/services/external/ChatProvider";
import { StoreT } from "@/services/external/Store";
import { Effect } from "effect";
import { generateKeyBetween } from "fractional-indexing";
import { nanoid } from "nanoid";
import { getMessages } from "./getMessages";
import { ChatError } from "./types";

/**
 * Send the current conversation to the LLM and create a response message.
 * Returns the new response node ID.
 */
export const send = Effect.fn("Chat.send")(function* (chatNodeId: Id.Node) {
  const Store = yield* StoreT;
  const Tuple = yield* TupleT;
  const Type = yield* TypeT;
  const Automerge = yield* AutomergeT;
  const ChatProvider = yield* ChatProviderT;

  const messages = yield* getMessages(chatNodeId);

  if (messages.length === 0) {
    return yield* new ChatError({ message: "No messages to send" });
  }

  const providerMessages: ProviderMessage[] = messages.map((m) => ({
    role: m.role,
    content: m.content,
  }));

  const responseText = yield* ChatProvider.send(providerMessages).pipe(
    Effect.catchTag(
      "ChatProviderError",
      (e) => new ChatError({ message: e.message }),
    ),
  );

  const responseNodeId = Id.Node.make(nanoid());
  yield* Store.commit(
    events.nodeCreated({
      timestamp: Date.now(),
      data: {
        nodeId: responseNodeId,
        parentId: chatNodeId,
        position: "",
      },
    }),
  );

  yield* Automerge.setText(responseNodeId, responseText);
  yield* Type.addType(responseNodeId, System.MSG_AENGEL);

  const existingTuples = yield* Tuple.findByPosition(
    System.CHAT_HAS_MESSAGE,
    0,
    chatNodeId,
    1,
  );
  const lastIdx =
    existingTuples.length > 0
      ? existingTuples[existingTuples.length - 1]!.memberFractionalIndices[1]!
      : null;
  const nextIdx = generateKeyBetween(lastIdx || null, null);

  yield* Tuple.create(
    System.CHAT_HAS_MESSAGE,
    [chatNodeId, responseNodeId],
    ["", nextIdx],
  );

  yield* Effect.logDebug("[Chat.send] Response created").pipe(
    Effect.annotateLogs({ chatNodeId, responseNodeId }),
  );

  return responseNodeId;
});
