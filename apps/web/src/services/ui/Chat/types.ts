import { Id, System } from "@/schema";
import { Data } from "effect";

export type MessageRole = "system" | "user" | "assistant";

export const resolveRole = (types: readonly Id.Node[]): MessageRole | null => {
  if (types.includes(System.MSG_SYSTEM)) return "system";
  if (types.includes(System.MSG_USER)) return "user";
  if (types.includes(System.MSG_AENGEL)) return "assistant";
  return null;
};

export interface ChatMessage {
  readonly nodeId: Id.Node;
  readonly role: MessageRole;
  readonly content: string;
}

export class ChatError extends Data.TaggedError("ChatError")<{
  readonly message: string;
}> {}
