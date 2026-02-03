import { Id } from "@/schema";
import { NodeT } from "@/services/domain/Node";
import { StoreT } from "@/services/external/Store";
import { isBlockExpanded } from "@/services/ui/Block/isBlockExpanded";
import { Effect } from "effect";

export const findDeepestLastChild = (
  startNodeId: Id.Node,
  bufferId: Id.Buffer,
): Effect.Effect<Id.Node, never, NodeT | StoreT> =>
  Effect.gen(function* () {
    const Node = yield* NodeT;

    const expanded = yield* isBlockExpanded(bufferId, startNodeId);
    if (!expanded) {
      return startNodeId;
    }

    const children = yield* Node.getNodeChildren(startNodeId);
    if (children.length === 0) {
      return startNodeId;
    }
    const lastChild = children[children.length - 1]!;
    return yield* findDeepestLastChild(lastChild, bufferId);
  });
