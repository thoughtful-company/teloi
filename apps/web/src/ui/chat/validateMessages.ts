import type { ChatMessageEntry } from "@/services/ui/Chat";

export type WrongPlace = "system-not-first" | "aengel-before-user";

/**
 * Validate message ordering rules:
 * 1. System messages must come before any non-system message
 * 2. Aengel cannot appear before the first user message
 */
export function validateMessages(
  messages: readonly ChatMessageEntry[],
): Array<ChatMessageEntry & { wrongPlace: WrongPlace | null }> {
  let seenNonSystem = false;
  let seenUser = false;

  return messages.map((msg) => {
    let wrongPlace: WrongPlace | null = null;

    if (msg.role === "system" && seenNonSystem) {
      wrongPlace = "system-not-first";
    } else if (msg.role === "assistant" && !seenUser) {
      wrongPlace = "aengel-before-user";
    }

    if (msg.role !== "system") seenNonSystem = true;
    if (msg.role === "user") seenUser = true;

    return { ...msg, wrongPlace };
  });
}
