import { Id } from "@/schema";
import { NodeT } from "@/services/domain/Node";
import { Effect } from "effect";
import { screen, waitFor } from "solid-testing-library";
import { expect } from "vitest";

/**
 * Asserts that the given text is visible on the screen.
 */
export const TEXT_IS_VISIBLE = (text: string) =>
  Effect.promise(() =>
    waitFor(
      () => {
        expect(screen.getByText(text)).toBeTruthy();
      },
      { timeout: 100 },
    ),
  ).pipe(Effect.withSpan("Then.TEXT_IS_VISIBLE"));

/**
 * Asserts that a node has the expected number of children.
 */
export const NODE_HAS_CHILDREN = Effect.fn("Then.NODE_HAS_CHILDREN")(
  function* (nodeId: Id.Node, count: number) {
    const Node = yield* NodeT;
    const children = yield* Node.getNodeChildren(nodeId);
    expect(children.length).toBe(count);
  },
);
