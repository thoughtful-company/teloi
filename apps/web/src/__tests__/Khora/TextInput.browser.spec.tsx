/**
 * Browser tests for text input in blocks.
 *
 * Specifically tests for regressions where typing + Enter causes text loss.
 * This was introduced when the bold formatting feature added a Y.Text observer
 * that dispatches decoration updates on every text change.
 */

import "@/index.css";
import { Id } from "@/schema";
import { NodeT } from "@/services/domain/Node";
import FrameView from "@/ui/FrameView";
import { Effect } from "effect";
import { afterEach, beforeEach, describe, it } from "vitest";
import {
  Given,
  Then,
  When,
  setupClientTest,
  type BrowserRuntime,
} from "@/test-utils/bdd";

describe("Text Input - Typing then Enter", () => {
  let runtime: BrowserRuntime;
  let render: Awaited<ReturnType<typeof setupClientTest>>["render"];
  let cleanup: () => Promise<void>;

  beforeEach(async () => {
    const setup = await setupClientTest();
    runtime = setup.runtime;
    render = setup.render;
    cleanup = setup.cleanup;
  });

  afterEach(async () => {
    await cleanup();
  });

  /**
   * Regression test: typing in a new block then pressing Enter should NOT truncate text.
   *
   * Steps to reproduce the bug:
   * 1. Create a frame with a block
   * 2. Press Enter to create a new block
   * 3. Type some text (e.g., "hello world")
   * 4. Press Enter again
   * 5. Expected: text in the block is "hello world"
   *    Actual (bug): some characters are removed from the text
   *
   * Root cause: The Y.Text observer added for bold formatting decorations
   * dispatches updates on every text change, which interferes with typing.
   */
  it("preserves all typed text when Enter is pressed after typing", async () => {
    await Effect.gen(function* () {
      const { frameId, rootNodeId, childNodeIds } =
        yield* Given.A_FRAME_WITH_CHILDREN("Root node", [{ text: "" }]);

      const firstKhoraId = Id.makeFrameKhoraId(frameId, childNodeIds[0]);

      render(() => <FrameView frameId={frameId} />);

      // Click the empty block
      yield* Given.KHORA_IS_FOCUSED_AT(firstKhoraId, 0);

      // Type text
      yield* When.USER_PRESSES("hello world");

      // Press Enter to create a new block
      yield* When.USER_PRESSES("{Enter}");

      // Verify: should have 2 blocks now
      yield* Then.BLOCK_COUNT_IS(2);
      yield* Then.NODE_HAS_CHILDREN(rootNodeId, 2);

      // Verify: first block should have complete text "hello world"
      yield* Then.NODE_HAS_TEXT(childNodeIds[0], "hello world");

      // Verify: second block should be empty
      const Node = yield* NodeT;
      const children = yield* Node.getNodeChildren(rootNodeId);
      yield* Then.NODE_HAS_TEXT(children[1]!, "");
    }).pipe(runtime.runPromise);
  });

  /**
   * Similar regression test but with typing in a newly created block.
   *
   * This tests the scenario where:
   * 1. Start with an existing block
   * 2. Press Enter to create a new block
   * 3. Type text in the new block
   * 4. Press Enter again
   * 5. Verify text is preserved
   */
  it("preserves text typed in a newly created block", async () => {
    await Effect.gen(function* () {
      const { frameId, rootNodeId, childNodeIds } =
        yield* Given.A_FRAME_WITH_CHILDREN("Root node", [
          { text: "First block" },
        ]);

      const firstKhoraId = Id.makeFrameKhoraId(frameId, childNodeIds[0]);

      render(() => <FrameView frameId={frameId} />);

      // Focus the first block with cursor at end
      yield* Given.KHORA_IS_FOCUSED_AT(firstKhoraId, 11);

      // Press Enter to create a new block below
      yield* When.USER_PRESSES("{Enter}");

      // Now we're in the new empty block - type text
      yield* When.USER_PRESSES("second block content");

      // Press Enter again to create another block
      yield* When.USER_PRESSES("{Enter}");

      // Verify: should have 3 blocks now
      yield* Then.BLOCK_COUNT_IS(3);
      yield* Then.NODE_HAS_CHILDREN(rootNodeId, 3);

      // Verify: original first block unchanged
      yield* Then.NODE_HAS_TEXT(childNodeIds[0], "First block");

      // Verify: second block (newly created) has complete typed text
      const Node = yield* NodeT;
      const children = yield* Node.getNodeChildren(rootNodeId);
      yield* Then.NODE_HAS_TEXT(children[1]!, "second block content");

      // Verify: third block is empty
      yield* Then.NODE_HAS_TEXT(children[2]!, "");
    }).pipe(runtime.runPromise);
  });

  /**
   * Test rapid typing without Enter - baseline to isolate the issue.
   */
  it("preserves all characters during rapid typing", async () => {
    await Effect.gen(function* () {
      const { frameId, childNodeIds } = yield* Given.A_FRAME_WITH_CHILDREN(
        "Root node",
        [{ text: "" }],
      );

      const khoraId = Id.makeFrameKhoraId(frameId, childNodeIds[0]);

      render(() => <FrameView frameId={frameId} />);

      // Click the empty block
      yield* Given.KHORA_IS_FOCUSED_AT(khoraId, 0);

      // Type text rapidly
      yield* When.USER_PRESSES("abcdefghijklmnopqrstuvwxyz");

      // Verify: all characters should be present
      yield* Then.NODE_HAS_TEXT(childNodeIds[0], "abcdefghijklmnopqrstuvwxyz");
    }).pipe(runtime.runPromise);
  });
});
