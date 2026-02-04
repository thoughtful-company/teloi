import Anthropic from "@anthropic-ai/sdk";
import { Context, Data, Effect, Layer } from "effect";

export interface ProviderMessage {
  readonly role: "system" | "user" | "assistant";
  readonly content: string;
}

export class ChatProviderError extends Data.TaggedError("ChatProviderError")<{
  readonly message: string;
  readonly cause?: unknown;
}> {}

export class ChatProviderT extends Context.Tag("ChatProviderT")<
  ChatProviderT,
  {
    send: (
      messages: readonly ProviderMessage[],
    ) => Effect.Effect<string, ChatProviderError>;
  }
>() {}

export const ChatProviderLive = Layer.succeed(ChatProviderT, {
  send: (messages) =>
    Effect.gen(function* () {
      let apiKey = localStorage.getItem("anthropic-api-key");
      if (!apiKey) {
        const input = window.prompt("Enter your Anthropic API key:");
        if (!input) {
          return yield* new ChatProviderError({
            message: "No API key provided",
          });
        }
        apiKey = input;
        localStorage.setItem("anthropic-api-key", apiKey);
      }

      const client = new Anthropic({
        apiKey,
        baseURL: `${window.location.origin}/api/anthropic`,
        dangerouslyAllowBrowser: true,
      });

      const systemMessages = messages.filter((m) => m.role === "system");
      const conversationMessages = messages.filter((m) => m.role !== "system");

      const params: Anthropic.MessageCreateParamsNonStreaming = {
        model: "claude-sonnet-4-20250514",
        max_tokens: 4096,
        stream: false,
        messages: conversationMessages.map((m) => ({
          role: m.role as "user" | "assistant",
          content: m.content,
        })),
      };

      if (systemMessages.length > 0) {
        params.system = systemMessages.map((m) => m.content).join("\n\n");
      }

      const response = yield* Effect.tryPromise({
        try: () => client.messages.create(params),
        catch: (error) =>
          new ChatProviderError({
            message:
              error instanceof Error ? error.message : "Provider call failed",
            cause: error,
          }),
      });

      const textBlocks = response.content.filter(
        (block): block is Anthropic.TextBlock => block.type === "text",
      );

      if (textBlocks.length === 0) {
        return yield* new ChatProviderError({
          message: "No text content in provider response",
        });
      }

      return textBlocks.map((block) => block.text).join("\n\n");
    }),
});
