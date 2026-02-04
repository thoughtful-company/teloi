import { Id, System } from "@/schema";
import { Data } from "effect";

export type MessageRole = "system" | "user" | "assistant";

export const resolveRole = (types: readonly Id.Node[]): MessageRole | null => {
  if (types.includes(System.MSG_SYSTEM)) return "system";
  if (types.includes(System.MSG_USER)) return "user";
  if (types.includes(System.MSG_AENGEL)) return "assistant";
  return null;
};

export interface ChatMessageEntry {
  readonly nodeId: Id.Node;
  readonly role: MessageRole;
}

export interface ChatMessage {
  readonly nodeId: Id.Node;
  readonly role: MessageRole;
  readonly content: string;
}

export class ChatError extends Data.TaggedError("ChatError")<{
  readonly message: string;
}> {}

// ================================ Internal ==================================

export const resolveEntries = (
  messageNodeIds: readonly Id.Node[],
  typesPerMessage: readonly (readonly Id.Node[])[],
): readonly ChatMessageEntry[] => {
  let prevRole: MessageRole = "user";
  return messageNodeIds.map((nodeId, i) => {
    const role = resolveRole(typesPerMessage[i]!) ?? prevRole;
    prevRole = role;
    return { nodeId, role };
  });
};
