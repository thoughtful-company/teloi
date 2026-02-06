import { useBrowserRuntime } from "@/context/useBrowserRuntime";
import { Id } from "@/schema";
import { ChatT, type ChatMessageEntry } from "@/services/ui/Chat";
import { bindStreamToStore } from "@/utils/bindStreamToStore";
import { Effect, Stream } from "effect";
import { createMemo, For, onCleanup, onMount, Show } from "solid-js";
import Block from "./Block";
import { validateMessages, type WrongPlace } from "./chat/validateMessages";

interface ChatViewProps {
  frameId: Id.Frame;
  nodeId: Id.Node;
}

export default function ChatView(props: ChatViewProps) {
  const runtime = useBrowserRuntime();

  const messagesStream = Stream.unwrap(
    Effect.gen(function* () {
      const Chat = yield* ChatT;
      return yield* Chat.subscribeMessages(props.nodeId);
    }),
  );

  const { store, start } = bindStreamToStore({
    stream: messagesStream,
    project: (messages) => ({
      messages: [...messages],
    }),
    initial: { messages: [] as ChatMessageEntry[] },
    reconcileKey: "nodeId",
  });

  onMount(() => {
    const dispose = start(runtime);
    onCleanup(() => dispose());
  });

  const wrongPlaces = createMemo(() => {
    const validated = validateMessages(store.messages);
    return new Map(validated.map((m) => [m.nodeId, m.wrongPlace]));
  });

  return (
    <div class="mx-auto max-w-[var(--max-line-width)] w-full">
      <div class="py-2">
        <button
          class="px-3 py-1 text-sm rounded border border-foreground-lighter hover:bg-foreground-lighter/10"
          onClick={() => {
            // chat:send command will be wired here in task #6
          }}
        >
          Send ⌘↵
        </button>
      </div>

      <div class="flex flex-col pt-4">
        <For each={store.messages}>
          {(msg, i) => {
            const isGroupStart = () =>
              i() === 0 || store.messages[i() - 1]?.role !== msg.role;
            const wrongPlace = () => wrongPlaces().get(msg.nodeId) ?? null;
            const borderColor = () => {
              switch (msg.role) {
                case "user":
                  return "border-l-blue-400";
                case "assistant":
                  return "border-l-purple-400";
                case "system":
                  return "border-l-amber-400";
              }
            };

            return (
              <div>
                <Show when={isGroupStart()}>
                  <div
                    class="text-xs font-medium text-foreground-lighter px-1 pb-1"
                    classList={{ "pt-4": i() !== 0 }}
                  >
                    {msg.role === "assistant" ? "aengel" : msg.role}
                  </div>
                </Show>
                <div
                  class="border-l-2 pl-3"
                  classList={{
                    [borderColor()]: true,
                    "bg-pink-500/10 rounded": wrongPlace() !== null,
                  }}
                >
                  <Show when={wrongPlace()}>
                    {(wp) => (
                      <div class="text-xs text-pink-400 px-1 py-0.5">
                        wrong place: {wrongPlaceLabel(wp())}
                      </div>
                    )}
                  </Show>
                  <Block
                    blockId={Id.makeFrameBlockId(props.frameId, msg.nodeId)}
                  />
                </div>
              </div>
            );
          }}
        </For>
      </div>
    </div>
  );
}

// ================================ Internal ==================================

function wrongPlaceLabel(wp: WrongPlace): string {
  switch (wp) {
    case "system-not-first":
      return "system messages must be first";
    case "aengel-before-user":
      return "assistant before any user message";
  }
}
