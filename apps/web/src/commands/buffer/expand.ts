import { Id } from "@/schema";
import { BlockT } from "@/services/ui/Block";
import { BufferT } from "@/services/ui/Buffer";
import { WindowT } from "@/services/ui/Window";
import { Data, Effect, Option } from "effect";

const scope = "buffer";
const commandName = "expand";
const tag = `${scope}:${commandName}` as const;

export class Expand extends Data.TaggedClass(tag)<{}> {
  static readonly scope = scope;
  static readonly commandName = commandName;
  static readonly tag = tag;
  static handle = Effect.fn(tag)(function* (_cmd: Expand) {
    const Block = yield* BlockT;
    const Window = yield* WindowT;
    const Buffer = yield* BufferT;

    const target = yield* resolveExpandTargets(Window, Buffer);
    if (Option.isNone(target)) return;

    const { bufferId, nodeIds } = target.value;
    for (const nodeId of nodeIds) {
      yield* Block.expandOneLevel(bufferId, nodeId);
    }
  });
}

// ================================ Internal ==================================

const resolveExpandTargets = (
  Window: WindowT["Type"],
  Buffer: BufferT["Type"],
): Effect.Effect<
  Option.Option<{ bufferId: Id.Buffer; nodeIds: readonly Id.Node[] }>
> =>
  Effect.gen(function* () {
    const activeElement = yield* Window.getActiveElement();
    if (Option.isNone(activeElement)) return Option.none();

    const el = activeElement.value;

    if (el.type === "block") {
      const ctx = Id.parseBlockContextSync(el.id);
      if (ctx.type !== "buffer") return Option.none();
      return Option.some({ bufferId: ctx.bufferId, nodeIds: [ctx.nodeId] });
    }

    if (el.type === "buffer") {
      const { selectedBlocks } = yield* Buffer.getBlockSelectionState(
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
      return Option.some({ bufferId: el.id, nodeIds: selectedBlocks });
    }

    return Option.none();
  });
