import { Id } from "@/schema";
import { NodeT } from "@/services/domain/Node";
import { StoreT } from "@/services/external/Store";
import { Effect, Option } from "effect";
import { findDeepestLastChild } from "./findDeepestLastChild";

export const findPreviousNode = (
  currentId: Id.Node,
  bufferId: Id.Buffer,
): Effect.Effect<Option.Option<Id.Node>, never, NodeT | StoreT> =>
  Effect.gen(function* () {
    const Node = yield* NodeT;
    const parentId = yield* Node.getParent(currentId).pipe(
      Effect.catchTag("NodeHasNoParentError", () =>
        Effect.succeed<Id.Node | null>(null),
      ),
    );
    if (!parentId) return Option.none();

    const siblings = yield* Node.getNodeChildren(parentId);
    const idx = siblings.indexOf(currentId);
    if (idx === -1) return Option.none();

    if (idx > 0) {
      const prevSiblingId = siblings[idx - 1]!;
      const deepest = yield* findDeepestLastChild(prevSiblingId, bufferId);
      return Option.some(deepest);
    }

    return Option.some(parentId);
  });
