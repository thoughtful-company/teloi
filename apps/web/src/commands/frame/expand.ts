import { Id } from "@/schema";
import { BlockT } from "@/services/ui/Block";
import { FrameT } from "@/services/ui/Frame";
import { WindowT } from "@/services/ui/Window";
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
    const Window = yield* WindowT;
    const Frame = yield* FrameT;

    const target = yield* resolveExpandTargets(Window, Frame);
    if (Option.isNone(target)) return;

    const { frameId, nodeIds } = target.value;
    for (const nodeId of nodeIds) {
      const { ghostNodeId } = yield* Block.expandOneLevel(frameId, nodeId);
      if (ghostNodeId) {
        const ghostBlockId = Id.makeFrameBlockId(frameId, ghostNodeId);
        yield* Window.setActiveElement(
          Option.some({ id: ghostBlockId, type: "block" as const }),
        );
      }
    }
  });
}

// ================================ Internal ==================================

const resolveExpandTargets = (
  Window: WindowT["Type"],
  Frame: FrameT["Type"],
): Effect.Effect<
  Option.Option<{ frameId: Id.Frame; nodeIds: readonly Id.Node[] }>
> =>
  Effect.gen(function* () {
    const activeElement = yield* Window.getActiveElement();
    if (Option.isNone(activeElement)) return Option.none();

    const el = activeElement.value;

    if (el.type === "block") {
      const ctx = Id.parseBlockContextSync(el.id);
      if (ctx.type !== "frame") return Option.none();
      return Option.some({ frameId: ctx.frameId, nodeIds: [ctx.nodeId] });
    }

    if (el.type === "frame") {
      const { selectedBlocks } = yield* Frame.getBlockSelectionState(
        el.id,
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
      return Option.some({ frameId: el.id, nodeIds: selectedBlocks });
    }

    return Option.none();
  });
