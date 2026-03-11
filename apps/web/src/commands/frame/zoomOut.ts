import { Id } from "@/schema";
import { NodeT } from "@/services/domain/Node";
import { StoreT } from "@/services/external/Store";
import { KhoraT } from "@/services/ui/Khora";
import { FrameT } from "@/services/ui/Frame";
import { NavigationT } from "@/services/ui/Navigation";
import { Data, Effect, Option } from "effect";
import { resolveActiveKhoraContext } from "../editor/utils/resolveActiveKhoraContext";

const scope = "frame";
const commandName = "zoomOut";
const tag = `${scope}:${commandName}` as const;

export class ZoomOut extends Data.TaggedClass(tag)<{}> {
  static readonly scope = scope;
  static readonly commandName = commandName;
  static readonly tag = tag;
  static handle = Effect.fn(tag)(function* (_cmd: ZoomOut) {
    const Store = yield* StoreT;
    const Node = yield* NodeT;
    const Navigation = yield* NavigationT;
    const Frame = yield* FrameT;
    const Khora = yield* KhoraT;

    const ctx = yield* resolveActiveKhoraContext();
    if (Option.isNone(ctx)) return;

    const { frameId, nodeId } = ctx.value;

    const frameDoc = yield* Store.getDocument("frame", frameId);
    if (Option.isNone(frameDoc) || !frameDoc.value.assignedKhoraId) return;

    const rootNodeId = Id.Node.make(frameDoc.value.assignedKhoraId);
    const parentId = yield* Node.getParent(rootNodeId).pipe(
      Effect.catchTag("NodeHasNoParentError", () =>
        Effect.succeed<Id.Node | null>(null),
      ),
    );

    if (!parentId) return;

    yield* Navigation.navigateTo(parentId);

    // Check if the previous root (now a block) is expanded
    const rootKhoraId = Id.makeFrameKhoraId(frameId, rootNodeId);
    const isRootExpanded = yield* Khora.isExpanded(rootKhoraId);

    // If expanded, select the original node; if collapsed, select the root block
    const targetKhoraId = isRootExpanded
      ? Id.makeFrameKhoraId(frameId, nodeId)
      : rootKhoraId;

    yield* Frame.enterBlockEditing(targetKhoraId);
  });
}
