import { Id, System } from "@/schema";
import { TupleT } from "@/services/domain/Tuple";
import { TypeT } from "@/services/domain/Type";
import { Effect, Stream } from "effect";
import { resolveRole, type MessageRole } from "./types";

export interface ChatMessageEntry {
  readonly nodeId: Id.Node;
  readonly role: MessageRole;
}

/**
 * Only includes messages with a recognized role type (system/user/assistant).
 * Does NOT include text content — Block components handle their own text.
 */
export const subscribeMessages = (chatNodeId: Id.Node) =>
  Effect.gen(function* () {
    const Tuple = yield* TupleT;
    const Type = yield* TypeT;

    const tuplesStream = yield* Tuple.subscribeByPosition(
      System.CHAT_HAS_MESSAGE,
      0,
      chatNodeId,
      1,
    );

    return tuplesStream.pipe(
      Stream.mapEffect((tuples) =>
        Effect.gen(function* () {
          const entries: ChatMessageEntry[] = [];

          for (const tuple of tuples) {
            const messageNodeId = tuple.members[1]!;
            const types = yield* Type.getTypes(messageNodeId);
            const role = resolveRole(types);
            if (role) {
              entries.push({ nodeId: messageNodeId, role });
            }
          }

          return entries as readonly ChatMessageEntry[];
        }),
      ),
    );
  });
