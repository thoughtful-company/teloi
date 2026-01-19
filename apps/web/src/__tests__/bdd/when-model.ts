import { Id } from "@/schema";
import { NodeT } from "@/services/domain/Node";
import { Effect } from "effect";

/**
 * Headless When actions that operate directly on the model layer.
 * Use these for unit tests that don't need browser/DOM interaction.
 * For browser-based actions (userEvent, DOM queries), use when.ts instead.
 */

/**
 * Deletes a node via the NodeT service.
 */
export const NODE_IS_DELETED = (nodeId: Id.Node) =>
  Effect.gen(function* () {
    const Node = yield* NodeT;
    yield* Node.deleteNode(nodeId);
  }).pipe(Effect.withSpan("When.NODE_IS_DELETED"));
