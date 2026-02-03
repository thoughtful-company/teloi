import { Id } from "@/schema";
import { NodeT } from "@/services/domain/Node";
import { StoreT } from "@/services/external/Store";
import { isBlockExpanded } from "@/services/ui/Block/isBlockExpanded";
import { Effect, Option } from "effect";
import { findNextNode } from "./findNextNode";

export const findNextNodeInDocumentOrder = (
  currentId: Id.Node,
  bufferId: Id.Buffer,
): Effect.Effect<Option.Option<Id.Node>, never, NodeT | StoreT> =>
  Effect.gen(function* () {
    const Node = yield* NodeT;

    const expanded = yield* isBlockExpanded(bufferId, currentId);
    if (expanded) {
      const children = yield* Node.getNodeChildren(currentId);
      if (children.length > 0) {
        return Option.some(children[0]!);
      }
    }

    return yield* findNextNode(currentId);
  });
