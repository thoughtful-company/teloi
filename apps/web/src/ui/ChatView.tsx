import { useBrowserRuntime } from "@/context/useBrowserRuntime";
import { Id } from "@/schema";
import { ChatT, type ChatMessageEntry } from "@/services/ui/Chat";
import { bindStreamToStore } from "@/utils/bindStreamToStore";
import { Effect, Stream } from "effect";
import { createMemo, For, onCleanup, onMount, Show } from "solid-js";
import Block from "./Block";

interface ChatViewProps {
  bufferId: Id.Buffer;
  nodeId: Id.Node;
}

type MessageRole = ChatMessageEntry["role"];

/** A visual group of consecutive messages with the same role */
interface MessageGroup {
  role: MessageRole;
  messages: Array<ChatMessageEntry & { wrongPlace: WrongPlace | null }>;
}

type WrongPlace =
  | "system-not-first"
  | "aengel-before-user"
  | "consecutive-same-role";

export default function ChatView(props: ChatViewProps) {
  const runtime = useBrowserRuntime();

  const messagesStream = Stream.unwrap(
    Effect.gen(function* () {
      const Chat = yield* ChatT;
      return yield* Chat.subscribeMessages(props.nodeId);
    }),
  );

  // Store a flat array of message entries (nodeId + role)
  const { store, start } = bindStreamToStore({
    stream: messagesStream,
    project: (messages) => ({
      messages: [...messages],
    }),
    initial: { messages: [] as ChatMessageEntry[] },
  });

  onMount(() => {
    const dispose = start(runtime);
    onCleanup(() => dispose());
  });

  // Derive validation and grouping reactively at render time
  const groups = createMemo(() =>
    groupMessages(validateMessages(store.messages)),
  );

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

      <div class="flex flex-col gap-4 pt-4">
        <For each={groups()}>
          {(group) => (
            <div class="flex flex-col">
              <div class="text-xs font-medium text-foreground-lighter px-1 pb-1">
                {group.role === "assistant" ? "aengel" : group.role}
              </div>
              <div
                class="flex flex-col border-l-2 border-foreground-lighter/30 pl-3"
                classList={{
                  "border-l-blue-400": group.role === "user",
                  "border-l-purple-400": group.role === "assistant",
                  "border-l-amber-400": group.role === "system",
                }}
              >
                <For each={group.messages}>
                  {(msg) => (
                    <div
                      classList={{
                        "bg-pink-500/10 rounded": msg.wrongPlace !== null,
                      }}
                    >
                      <Show when={msg.wrongPlace}>
                        {(wp) => (
                          <div class="text-xs text-pink-400 px-1 py-0.5">
                            wrong place: {wrongPlaceLabel(wp())}
                          </div>
                        )}
                      </Show>
                      <Block
                        blockId={Id.makeBufferBlockId(
                          props.bufferId,
                          msg.nodeId,
                        )}
                      />
                    </div>
                  )}
                </For>
              </div>
            </div>
          )}
        </For>
      </div>
    </div>
  );
}

// ================================ Internal ==================================

/**
 * Validate message ordering rules:
 * 1. System messages must come before any non-system message
 * 2. Aengel cannot appear before the first user message
 * 3. No consecutive same-role messages
 */
function validateMessages(
  messages: readonly ChatMessageEntry[],
): Array<ChatMessageEntry & { wrongPlace: WrongPlace | null }> {
  let seenNonSystem = false;
  let seenUser = false;
  let prevRole: MessageRole | null = null;

  return messages.map((msg) => {
    let wrongPlace: WrongPlace | null = null;

    if (msg.role === "system" && seenNonSystem) {
      wrongPlace = "system-not-first";
    } else if (msg.role === "assistant" && !seenUser) {
      wrongPlace = "aengel-before-user";
    } else if (prevRole !== null && msg.role === prevRole) {
      wrongPlace = "consecutive-same-role";
    }

    if (msg.role !== "system") seenNonSystem = true;
    if (msg.role === "user") seenUser = true;
    prevRole = msg.role;

    return { ...msg, wrongPlace };
  });
}

/** Group consecutive messages with the same role */
function groupMessages(
  messages: Array<ChatMessageEntry & { wrongPlace: WrongPlace | null }>,
): MessageGroup[] {
  const groups: MessageGroup[] = [];

  for (const msg of messages) {
    const last = groups[groups.length - 1];
    if (last && last.role === msg.role) {
      last.messages.push(msg);
    } else {
      groups.push({ role: msg.role, messages: [msg] });
    }
  }

  return groups;
}

function wrongPlaceLabel(wp: WrongPlace): string {
  switch (wp) {
    case "system-not-first":
      return "system messages must be first";
    case "aengel-before-user":
      return "assistant before any user message";
    case "consecutive-same-role":
      return "consecutive same role";
  }
}
