import { Id } from "@/schema";
import { NodeT } from "@/services/domain/Node";
import { Effect, Option } from "effect";

export const findNextNode = (
  currentId: Id.Node,
): Effect.Effect<Option.Option<Id.Node>, never, NodeT> =>
  Effect.gen(function* () {
    const Node = yield* NodeT;
    const parentId = yield* Node.getParent(currentId).pipe(
      Effect.catchTag("NodeHasNoParentError", () =>
        Effect.succeed<Id.Node | null>(null),
      ),
    );

    yield* Effect.logDebug("[ViewNavigation.findNextNode] Looking for next").pipe(
      Effect.annotateLogs({
        currentId,
        parentId,
      }),
    );

    if (!parentId) {
      yield* Effect.logDebug("[ViewNavigation.findNextNode] No parent, returning none");
      return Option.none();
    }

    const siblings = yield* Node.getNodeChildren(parentId);
    const idx = siblings.indexOf(currentId);

    yield* Effect.logDebug("[ViewNavigation.findNextNode] Sibling analysis").pipe(
      Effect.annotateLogs({
        siblingCount: siblings.length,
        currentIndex: idx,
        siblings: siblings.join(", "),
      }),
    );

    if (idx === -1) {
      yield* Effect.logDebug("[ViewNavigation.findNextNode] Not found in siblings");
      return Option.none();
    }

    if (idx < siblings.length - 1) {
      const nextSibling = siblings[idx + 1]!;
      yield* Effect.logDebug("[ViewNavigation.findNextNode] Found next sibling").pipe(
        Effect.annotateLogs({ nextSibling }),
      );
      return Option.some(nextSibling);
    }

    yield* Effect.logDebug(
      "[ViewNavigation.findNextNode] Last sibling, recursing to parent",
    );
    return yield* findNextNode(parentId);
  });
