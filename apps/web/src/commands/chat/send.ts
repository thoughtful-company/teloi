import { Id, System } from "@/schema";
import { TypeT } from "@/services/domain/Type";
import { StoreT } from "@/services/external/Store";
import { BufferT } from "@/services/ui/Buffer";
import { ChatT } from "@/services/ui/Chat";
import { Data, Effect, Option } from "effect";

const scope = "chat";
const commandName = "send";
const tag = `${scope}:${commandName}` as const;

export class Send extends Data.TaggedClass(tag)<{}> {
  static readonly scope = scope;
  static readonly commandName = commandName;
  static readonly tag = tag;
  static handle = Effect.fn(tag)(function* (_cmd: Send) {
    const Buffer = yield* BufferT;
    const Store = yield* StoreT;
    const Type = yield* TypeT;
    const Chat = yield* ChatT;

    // Get current buffer — works from either block editing or block selection mode
    const mode = yield* Buffer.getMode();

    let bufferId: Id.Buffer;
    if (mode.type === "blockSelection") {
      bufferId = mode.bufferId;
    } else if (mode.type === "block") {
      const [parsedBufferId] = yield* Id.parseBlockId(mode.blockId);
      bufferId = parsedBufferId;
    } else {
      return;
    }

    const bufferDoc = yield* Store.getDocument("buffer", bufferId);
    if (Option.isNone(bufferDoc)) return;

    const nodeId = bufferDoc.value.assignedNodeId as Id.Node | null;
    if (!nodeId) return;

    // Only send if page has #chat type
    const hasChat = yield* Type.hasType(nodeId, System.CHAT);
    if (!hasChat) return;

    // Fork as daemon — Chat.send does async HTTP work but the command
    // pipeline runs inside runSync (for preventDefault on key events)
    yield* Chat.send(nodeId).pipe(
      Effect.catchAll((error) =>
        Effect.logError("Chat.send failed").pipe(
          Effect.annotateLogs({ error: String(error) }),
        ),
      ),
      Effect.forkDaemon,
    );
  });
}
