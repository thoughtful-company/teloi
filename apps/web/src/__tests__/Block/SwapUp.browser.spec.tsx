import "@/index.css";
import { Id } from "@/schema";
import EditorBuffer from "@/ui/EditorBuffer";
import { Effect } from "effect";
import { describe, it } from "vitest";
import { Given, render, runtime, Then, When } from "../bdd";

describe("Block Movement - Swap Up (Opt+Cmd+Up)", () => {
  it("swaps block with previous sibling and preserves selection", async () => {
    await Effect.gen(function* () {
      const { bufferId, rootNodeId, childNodeIds } =
        yield* Given.A_BUFFER_WITH_CHILDREN("Root", [
          { text: "First" },
          { text: "Second" },
          { text: "Third" },
        ]);

      const [first, second, third] = childNodeIds;
      const secondBlockId = Id.makeBlockId(bufferId, second);

      render(() => <EditorBuffer bufferId={bufferId} />);

      yield* When.USER_CLICKS_BLOCK(secondBlockId);
      yield* When.USER_PRESSES("{Alt>}{Meta>}{ArrowUp}{/Meta}{/Alt}");

      yield* Then.CHILDREN_ORDER_IS(rootNodeId, [second, first, third]);
      yield* Then.SELECTION_IS_ON_BLOCK(secondBlockId);
    }).pipe(runtime.runPromise);
  });

  it("does nothing when block is first child", async () => {
    await Effect.gen(function* () {
      const { bufferId, rootNodeId, childNodeIds } =
        yield* Given.A_BUFFER_WITH_CHILDREN("Root", [
          { text: "First" },
          { text: "Second" },
        ]);

      const [first, second] = childNodeIds;
      const firstBlockId = Id.makeBlockId(bufferId, first);

      render(() => <EditorBuffer bufferId={bufferId} />);

      yield* When.USER_CLICKS_BLOCK(firstBlockId);
      yield* When.USER_PRESSES("{Alt>}{Meta>}{ArrowUp}{/Meta}{/Alt}");

      yield* Then.CHILDREN_ORDER_IS(rootNodeId, [first, second]);
    }).pipe(runtime.runPromise);
  });

});
