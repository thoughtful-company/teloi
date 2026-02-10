import { Id } from "@/schema";
import { BlockT } from "@/services/ui/Block";
import { FrameT } from "@/services/ui/Frame";
import { Data, Effect, Option } from "effect";

const scope = "frame";
const commandName = "expand";
const tag = `${scope}:${commandName}` as const;

export class Expand extends Data.TaggedClass(tag)<{}> {
  static readonly scope = scope;
  static readonly commandName = commandName;
  static readonly tag = tag;
  static handle = Effect.fn(tag)(function* (_cmd: Expand) {
    const Block = yield* BlockT;
    const Frame = yield* FrameT;

    const target = yield* resolveExpandTargets(Frame);
    if (Option.isNone(target)) return;

    const { frameId, nodeIds } = target.value;
    for (const nodeId of nodeIds) {
      const { ghostNodeId } = yield* Block.expandOneLevel(frameId, nodeId);
      if (ghostNodeId) {
        const ghostBlockId = Id.makeFrameBlockId(frameId, ghostNodeId);
        yield* Frame.enterBlockEditing(ghostBlockId);
      }
    }
  });
}

// ================================ Internal ==================================

const resolveExpandTargets = (
  Frame: FrameT["Type"],
): Effect.Effect<
  Option.Option<{ frameId: Id.Frame; nodeIds: readonly Id.Node[] }>
> =>
  Effect.gen(function* () {
    const mode = yield* Frame.getMode();
    if (mode.type === "none") return Option.none();

    if (mode.type === "block") {
      const ctx = Id.parseBlockContextSync(mode.blockId);
      if (ctx.type !== "frame") return Option.none();
      return Option.some({ frameId: ctx.frameId, nodeIds: [ctx.nodeId] });
    }

    if (mode.type === "blockSelection") {
      const { selectedBlocks } = yield* Frame.getBlockSelectionState(
        mode.frameId,
      ).pipe(
        Effect.catchAll(() =>
          Effect.succeed({
            selectedBlocks: [] as readonly Id.Node[],
            anchor: null,
            focus: null,
          }),
        ),
      );
      if (selectedBlocks.length === 0) return Option.none();
      return Option.some({ frameId: mode.frameId, nodeIds: selectedBlocks });
    }

    return Option.none();
  });
