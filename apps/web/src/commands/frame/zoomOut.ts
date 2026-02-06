import { Id } from "@/schema";
import { NodeT } from "@/services/domain/Node";
import { StoreT } from "@/services/external/Store";
import { BlockT } from "@/services/ui/Block";
import { NavigationT } from "@/services/ui/Navigation";
import { WindowT } from "@/services/ui/Window";
import { Data, Effect, Option } from "effect";
import { resolveActiveBlockContext } from "../editor/utils/resolveActiveBlockContext";

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
    const Window = yield* WindowT;
    const Block = yield* BlockT;

    const ctx = yield* resolveActiveBlockContext();
    if (Option.isNone(ctx)) return;

    const { frameId, nodeId } = ctx.value;

    const frameDoc = yield* Store.getDocument("frame", frameId);
    if (Option.isNone(frameDoc) || !frameDoc.value.assignedNodeId) return;

    const rootNodeId = Id.Node.make(frameDoc.value.assignedNodeId);
    const parentId = yield* Node.getParent(rootNodeId).pipe(
      Effect.catchTag("NodeHasNoParentError", () =>
        Effect.succeed<Id.Node | null>(null),
      ),
    );

    if (!parentId) return;

    yield* Navigation.navigateTo(parentId);

    // Check if the previous root (now a block) is expanded
    const rootBlockId = Id.makeFrameBlockId(frameId, rootNodeId);
    const isRootExpanded = yield* Block.isExpanded(rootBlockId);

    // If expanded, select the original node; if collapsed, select the root block
    const targetBlockId = isRootExpanded
      ? Id.makeFrameBlockId(frameId, nodeId)
      : rootBlockId;

    yield* Window.setActiveElement(
      Option.some({ type: "block" as const, id: targetBlockId }),
    );
  });
}
