import { Id, System } from "@/schema";
import { TypeT } from "@/services/domain/Type";
import { StoreT } from "@/services/external/Store";
import { FrameT } from "@/services/ui/Frame";
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
    const Frame = yield* FrameT;
    const Store = yield* StoreT;
    const Type = yield* TypeT;
    const Chat = yield* ChatT;

    // Get current frame — works from either block editing or block selection mode
    const mode = yield* Frame.getMode();

    let frameId: Id.Frame;
    if (mode.type === "blockSelection") {
      frameId = mode.frameId;
    } else if (mode.type === "block") {
      const [parsedFrameId] = yield* Id.parseBlockId(mode.blockId);
      frameId = parsedFrameId;
    } else {
      return;
    }

    const frameDoc = yield* Store.getDocument("frame", frameId);
    if (Option.isNone(frameDoc)) return;

    const nodeId = frameDoc.value.assignedNodeId as Id.Node | null;
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
