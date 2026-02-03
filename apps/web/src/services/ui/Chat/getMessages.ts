import { Id, System } from "@/schema";
import { TupleT } from "@/services/domain/Tuple";
import { TypeT } from "@/services/domain/Type";
import { AutomergeT } from "@/services/external/Automerge";
import { Effect } from "effect";
import { ChatMessage, resolveRole } from "./types";

export const getMessages = (chatNodeId: Id.Node) =>
  Effect.gen(function* () {
    const Tuple = yield* TupleT;
    const Type = yield* TypeT;
    const Automerge = yield* AutomergeT;

    const tuples = yield* Tuple.findByPosition(
      System.CHAT_HAS_MESSAGE,
      0,
      chatNodeId,
      1,
    );

    const messages: ChatMessage[] = [];
    for (const tuple of tuples) {
      const messageNodeId = tuple.members[1]!;
      const types = yield* Type.getTypes(messageNodeId);
      const content = yield* Automerge.getText(messageNodeId);

      const role = resolveRole(types);
      if (role) {
        messages.push({ nodeId: messageNodeId, role, content });
      }
    }

    return messages as readonly ChatMessage[];
  });
