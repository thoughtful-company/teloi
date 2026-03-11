import { Id } from "@/schema";
import { KhoraT } from "@/services/ui/Khora";
import { FrameT } from "@/services/ui/Frame";
import { NodeT } from "@/services/domain/Node";
import { Data, Effect, Option } from "effect";

const scope = "frame";
const commandName = "expand";
const tag = `${scope}:${commandName}` as const;

export class Expand extends Data.TaggedClass(tag)<{}> {
  static readonly scope = scope;
  static readonly commandName = commandName;
  static readonly tag = tag;
  static handle = Effect.fn(tag)(function* (_cmd: Expand) {
    const Khora = yield* KhoraT;
    const Frame = yield* FrameT;
    const Node = yield* NodeT;

    const target = yield* resolveExpandTargets(Frame);
    if (Option.isNone(target)) return;

    const { frameId, nodeIds, behavior } = target.value;

    if (behavior === "title") {
      const rootNodeId = nodeIds[0];
      if (!rootNodeId) return;

      const firstLevelChildren = yield* Node.getNodeChildren(rootNodeId);
      if (firstLevelChildren.length === 0) {
        const { ghostNodeId } = yield* Khora.expandOneLevel(frameId, rootNodeId);
        yield* focusGhostIfCreated(Frame, frameId, ghostNodeId);
        return;
      }

      for (const childNodeId of firstLevelChildren) {
        const childBlock = yield* Khora.get(frameId, childNodeId);
        if (!childBlock.isExpanded) {
          const { ghostNodeId } = yield* Khora.expandOneLevel(
            frameId,
            childNodeId,
          );
          yield* focusGhostIfCreated(Frame, frameId, ghostNodeId);
          return;
        }
      }

      for (const childNodeId of firstLevelChildren) {
        const { expanded, ghostNodeId } = yield* Khora.expandOneLevel(
          frameId,
          childNodeId,
        );
        if (!expanded) continue;
        yield* focusGhostIfCreated(Frame, frameId, ghostNodeId);
        return;
      }

      return;
    }

    for (const nodeId of nodeIds) {
      const { ghostNodeId } = yield* Khora.expandOneLevel(frameId, nodeId);
      if (ghostNodeId) {
        yield* focusGhostIfCreated(Frame, frameId, ghostNodeId);
      }

      if (behavior === "single") {
        return;
      }
    }
  });
}

// ================================ Internal ==================================

const resolveExpandTargets = (
  Frame: FrameT["Type"],
): Effect.Effect<
  Option.Option<{
    frameId: Id.Frame;
    nodeIds: readonly Id.Node[];
    behavior: "single" | "multi" | "title";
  }>
> =>
  Effect.gen(function* () {
    const mode = yield* Frame.getMode();
    if (mode.type === "none") return Option.none();

    if (mode.type === "khora") {
      const ctx = Id.parseKhoraContextSync(mode.khoraId);
      if (ctx.type !== "frame") return Option.none();
      const assignedKhoraId = yield* Frame.getAssignedKhoraId(ctx.frameId).pipe(
        Effect.catchAll(() => Effect.succeed<Id.Node | null>(null)),
      );
      if (assignedKhoraId != null && ctx.nodeId === assignedKhoraId) {
        return Option.some({
          frameId: ctx.frameId,
          nodeIds: [ctx.nodeId],
          behavior: "title" as const,
        });
      }
      return Option.some({
        frameId: ctx.frameId,
        nodeIds: [ctx.nodeId],
        behavior: "single" as const,
      });
    }

    if (mode.type === "khoraSelection") {
      const { selectedKhoras } = yield* Frame.getKhoraSelectionState(
        mode.frameId,
      ).pipe(
        Effect.catchAll(() =>
          Effect.succeed({
            selectedKhoras: [] as readonly Id.Node[],
            anchor: null,
            focus: null,
          }),
        ),
      );
      if (selectedKhoras.length === 0) return Option.none();
      return Option.some({
        frameId: mode.frameId,
        nodeIds: selectedKhoras,
        behavior: "multi" as const,
      });
    }

    return Option.none();
  });

const focusGhostIfCreated = (
  Frame: FrameT["Type"],
  frameId: Id.Frame,
  ghostNodeId: Id.Node | null,
) =>
  ghostNodeId
    ? Frame.enterBlockEditing(Id.makeFrameKhoraId(frameId, ghostNodeId), {
        anchor: 0,
        head: 0,
        assoc: 0,
      })
    : Effect.void;
