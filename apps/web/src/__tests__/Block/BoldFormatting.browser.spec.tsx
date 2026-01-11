/**
 * Browser tests for bold formatting behavior.
 *
 * Tests the Cmd+B shortcut and formatting preservation during split/merge.
 *
 * NOTE: These tests will FAIL until the bold formatting feature is implemented.
 */

import "@/index.css";
import { Id } from "@/schema";
import { NodeT } from "@/services/domain/Node";
import EditorBuffer from "@/ui/EditorBuffer";
import { Effect } from "effect";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  Given,
  Then,
  When,
  setupClientTest,
  type BrowserRuntime,
} from "../bdd";

describe("Bold Formatting - Cmd+B Shortcut", () => {
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

  it("applies bold to selected text with Cmd+B", async () => {
    await Effect.gen(function* () {
      const { bufferId, childNodeIds } = yield* Given.A_BUFFER_WITH_CHILDREN(
        "Root",
        [{ text: "hello world" }],
      );

      const blockId = Id.makeBlockId(bufferId, childNodeIds[0]);

      render(() => <EditorBuffer bufferId={bufferId} />);

      // Click block, select "world" (positions 6-11)
      yield* When.USER_CLICKS_BLOCK(blockId);
      yield* When.USER_MOVES_CURSOR_TO(6);
      yield* When.USER_PRESSES("{Shift>}{End}{/Shift}"); // Select to end

      // Press Cmd+B to bold
      yield* When.USER_PRESSES("{Meta>}b{/Meta}");

      // Verify: "world" should be bold in Yjs
      yield* Then.NODE_HAS_BOLD_AT(childNodeIds[0], 6, 5);
    }).pipe(runtime.runPromise);
  });

  it("removes bold from selected bold text with Cmd+B", async () => {
    await Effect.gen(function* () {
      const { bufferId, childNodeIds } = yield* Given.A_BUFFER_WITH_CHILDREN(
        "Root",
        [{ text: "hello world" }],
      );

      // Pre-apply bold to "world"
      yield* Given.NODE_HAS_BOLD(childNodeIds[0], 6, 5);

      const blockId = Id.makeBlockId(bufferId, childNodeIds[0]);

      render(() => <EditorBuffer bufferId={bufferId} />);

      // Select the bold "world"
      yield* When.USER_CLICKS_BLOCK(blockId);
      yield* When.USER_MOVES_CURSOR_TO(6);
      yield* When.USER_PRESSES("{Shift>}{End}{/Shift}");

      // Press Cmd+B to toggle off bold
      yield* When.USER_PRESSES("{Meta>}b{/Meta}");

      // Verify: "world" should no longer be bold
      yield* Then.NODE_HAS_NO_BOLD_AT(childNodeIds[0], 6, 5);
    }).pipe(runtime.runPromise);
  });

  it("toggles bold mode at cursor position when no selection", async () => {
    await Effect.gen(function* () {
      const { bufferId, childNodeIds } = yield* Given.A_BUFFER_WITH_CHILDREN(
        "Root",
        [{ text: "hello" }],
      );

      const blockId = Id.makeBlockId(bufferId, childNodeIds[0]);

      render(() => <EditorBuffer bufferId={bufferId} />);

      // Click at end of text (collapsed cursor)
      yield* When.USER_CLICKS_BLOCK(blockId);
      yield* When.USER_PRESSES("{End}");

      // Press Cmd+B to enable bold mode
      yield* When.USER_PRESSES("{Meta>}b{/Meta}");

      // Type new text - should be bold
      yield* When.USER_PRESSES(" world");

      // Verify: " world" (positions 5-11) should be bold
      yield* Then.NODE_HAS_BOLD_AT(childNodeIds[0], 5, 6);
      yield* Then.NODE_HAS_NO_BOLD_AT(childNodeIds[0], 0, 5); // "hello" still plain
    }).pipe(runtime.runPromise);
  });
});

describe("Split with Formatting", () => {
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

  it("preserves formatting on both sides when splitting in plain text", async () => {
    await Effect.gen(function* () {
      const { bufferId, rootNodeId, childNodeIds } =
        yield* Given.A_BUFFER_WITH_CHILDREN("Root", [
          { text: "hello BOLD world" },
        ]);

      // Apply bold to "BOLD" (positions 6-10)
      yield* Given.NODE_HAS_BOLD(childNodeIds[0], 6, 4);

      const blockId = Id.makeBlockId(bufferId, childNodeIds[0]);

      render(() => <EditorBuffer bufferId={bufferId} />);

      // Split in the middle of "world" (position 12, inside " world")
      yield* When.USER_CLICKS_BLOCK(blockId);
      yield* When.USER_MOVES_CURSOR_TO(12); // "hello BOLD w|orld"
      yield* When.USER_PRESSES("{Enter}");

      // Verify: First block should have "hello BOLD w" with "BOLD" bold
      const Node = yield* NodeT;
      const children = yield* Node.getNodeChildren(rootNodeId);
      expect(children.length).toBe(2);

      yield* Then.NODE_HAS_TEXT(children[0]!, "hello BOLD w");
      yield* Then.NODE_HAS_BOLD_AT(children[0]!, 6, 4); // "BOLD" still bold

      // Second block should have "orld" (plain, no formatting)
      yield* Then.NODE_HAS_TEXT(children[1]!, "orld");
      yield* Then.NODE_HAS_NO_FORMATTING(children[1]!);
    }).pipe(runtime.runPromise);
  });

  it("preserves formatting when splitting inside bold text", async () => {
    await Effect.gen(function* () {
      const { bufferId, rootNodeId, childNodeIds } =
        yield* Given.A_BUFFER_WITH_CHILDREN("Root", [{ text: "hello BOLD" }]);

      // Apply bold to "BOLD" (positions 6-10)
      yield* Given.NODE_HAS_BOLD(childNodeIds[0], 6, 4);

      const blockId = Id.makeBlockId(bufferId, childNodeIds[0]);

      render(() => <EditorBuffer bufferId={bufferId} />);

      // Split inside "BOLD" at position 8 ("hello BO|LD")
      yield* When.USER_CLICKS_BLOCK(blockId);
      yield* When.USER_MOVES_CURSOR_TO(8);
      yield* When.USER_PRESSES("{Enter}");

      // Verify: First block "hello BO" with "BO" bold (positions 6-8)
      const Node = yield* NodeT;
      const children = yield* Node.getNodeChildren(rootNodeId);

      yield* Then.NODE_HAS_TEXT(children[0]!, "hello BO");
      yield* Then.NODE_HAS_BOLD_AT(children[0]!, 6, 2); // "BO" bold

      // Second block "LD" should be bold (positions 0-2)
      yield* Then.NODE_HAS_TEXT(children[1]!, "LD");
      yield* Then.NODE_HAS_BOLD_AT(children[1]!, 0, 2); // "LD" bold
    }).pipe(runtime.runPromise);
  });

  it("preserves multiple format spans when splitting", async () => {
    await Effect.gen(function* () {
      const { bufferId, rootNodeId, childNodeIds } =
        yield* Given.A_BUFFER_WITH_CHILDREN("Root", [
          { text: "one TWO three FOUR" },
        ]);

      // Bold "TWO" (4-7) and "FOUR" (14-18)
      yield* Given.NODE_HAS_BOLD(childNodeIds[0], 4, 3);
      yield* Given.NODE_HAS_BOLD(childNodeIds[0], 14, 4);

      const blockId = Id.makeBlockId(bufferId, childNodeIds[0]);

      render(() => <EditorBuffer bufferId={bufferId} />);

      // Split at position 10 ("one TWO th|ree FOUR")
      yield* When.USER_CLICKS_BLOCK(blockId);
      yield* When.USER_MOVES_CURSOR_TO(10);
      yield* When.USER_PRESSES("{Enter}");

      const Node = yield* NodeT;
      const children = yield* Node.getNodeChildren(rootNodeId);

      // First block: "one TWO th" with "TWO" bold at 4-7
      yield* Then.NODE_HAS_TEXT(children[0]!, "one TWO th");
      yield* Then.NODE_HAS_BOLD_AT(children[0]!, 4, 3);

      // Second block: "ree FOUR" with "FOUR" bold at 4-8
      yield* Then.NODE_HAS_TEXT(children[1]!, "ree FOUR");
      yield* Then.NODE_HAS_BOLD_AT(children[1]!, 4, 4);
    }).pipe(runtime.runPromise);
  });
});

describe("Merge with Formatting", () => {
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

  it("preserves formatting from both blocks on backward merge", async () => {
    await Effect.gen(function* () {
      const { bufferId, rootNodeId, childNodeIds } =
        yield* Given.A_BUFFER_WITH_CHILDREN("Root", [
          { text: "hello BOLD" },
          { text: "SECOND end" },
        ]);

      // Bold "BOLD" in first block (positions 6-10)
      yield* Given.NODE_HAS_BOLD(childNodeIds[0], 6, 4);
      // Bold "SECOND" in second block (positions 0-6)
      yield* Given.NODE_HAS_BOLD(childNodeIds[1], 0, 6);

      const secondBlockId = Id.makeBlockId(bufferId, childNodeIds[1]);

      render(() => <EditorBuffer bufferId={bufferId} />);

      // Merge: cursor at start of second block, press Backspace
      yield* When.USER_CLICKS_BLOCK(secondBlockId);
      yield* When.USER_MOVES_CURSOR_TO(0);
      yield* When.USER_PRESSES("{Backspace}");

      // Verify: One block with "hello BOLDSECOND end"
      yield* Then.NODE_HAS_CHILDREN(rootNodeId, 1);

      const Node = yield* NodeT;
      const children = yield* Node.getNodeChildren(rootNodeId);

      yield* Then.NODE_HAS_TEXT(children[0]!, "hello BOLDSECOND end");
      // "BOLD" at 6-10 (bold)
      yield* Then.NODE_HAS_BOLD_AT(children[0]!, 6, 4);
      // "SECOND" at 10-16 (bold)
      yield* Then.NODE_HAS_BOLD_AT(children[0]!, 10, 6);
    }).pipe(runtime.runPromise);
  });

  it("preserves formatting from both blocks on forward merge (Delete)", async () => {
    await Effect.gen(function* () {
      const { bufferId, rootNodeId, childNodeIds } =
        yield* Given.A_BUFFER_WITH_CHILDREN("Root", [
          { text: "first BOLD" },
          { text: "second" },
        ]);

      // Bold "BOLD" in first block (positions 6-10)
      yield* Given.NODE_HAS_BOLD(childNodeIds[0], 6, 4);
      // Bold entire second block
      yield* Given.NODE_HAS_BOLD(childNodeIds[1], 0, 6);

      const firstBlockId = Id.makeBlockId(bufferId, childNodeIds[0]);

      render(() => <EditorBuffer bufferId={bufferId} />);

      // Merge: cursor at end of first block, press Delete
      yield* When.USER_CLICKS_BLOCK(firstBlockId);
      yield* When.USER_PRESSES("{End}");
      yield* When.USER_PRESSES("{Delete}");

      // Verify merged content
      yield* Then.NODE_HAS_CHILDREN(rootNodeId, 1);

      const Node = yield* NodeT;
      const children = yield* Node.getNodeChildren(rootNodeId);

      yield* Then.NODE_HAS_TEXT(children[0]!, "first BOLDsecond");
      yield* Then.NODE_HAS_BOLD_AT(children[0]!, 6, 4); // "BOLD"
      yield* Then.NODE_HAS_BOLD_AT(children[0]!, 10, 6); // "second"
    }).pipe(runtime.runPromise);
  });

  it("joins adjacent bold spans when merging", async () => {
    await Effect.gen(function* () {
      const { bufferId, rootNodeId, childNodeIds } =
        yield* Given.A_BUFFER_WITH_CHILDREN("Root", [
          { text: "BOLD1" },
          { text: "BOLD2" },
        ]);

      // Both blocks entirely bold
      yield* Given.NODE_HAS_BOLD(childNodeIds[0], 0, 5);
      yield* Given.NODE_HAS_BOLD(childNodeIds[1], 0, 5);

      const secondBlockId = Id.makeBlockId(bufferId, childNodeIds[1]);

      render(() => <EditorBuffer bufferId={bufferId} />);

      yield* When.USER_CLICKS_BLOCK(secondBlockId);
      yield* When.USER_MOVES_CURSOR_TO(0);
      yield* When.USER_PRESSES("{Backspace}");

      // Should merge into one continuous bold span
      const Node = yield* NodeT;
      const children = yield* Node.getNodeChildren(rootNodeId);

      yield* Then.NODE_HAS_TEXT(children[0]!, "BOLD1BOLD2");
      // Entire text should be one bold span
      yield* Then.NODE_IS_ENTIRELY_BOLD(children[0]!);
    }).pipe(runtime.runPromise);
  });

  it("preserves plain + formatted pattern after merge", async () => {
    await Effect.gen(function* () {
      const { bufferId, rootNodeId, childNodeIds } =
        yield* Given.A_BUFFER_WITH_CHILDREN("Root", [
          { text: "plain" },
          { text: "BOLD" },
        ]);

      // Only second block is bold
      yield* Given.NODE_HAS_BOLD(childNodeIds[1], 0, 4);

      const secondBlockId = Id.makeBlockId(bufferId, childNodeIds[1]);

      render(() => <EditorBuffer bufferId={bufferId} />);

      yield* When.USER_CLICKS_BLOCK(secondBlockId);
      yield* When.USER_MOVES_CURSOR_TO(0);
      yield* When.USER_PRESSES("{Backspace}");

      const Node = yield* NodeT;
      const children = yield* Node.getNodeChildren(rootNodeId);

      yield* Then.NODE_HAS_TEXT(children[0]!, "plainBOLD");
      yield* Then.NODE_HAS_NO_BOLD_AT(children[0]!, 0, 5); // "plain" not bold
      yield* Then.NODE_HAS_BOLD_AT(children[0]!, 5, 4); // "BOLD" bold
    }).pipe(runtime.runPromise);
  });
});

describe("Unfocused Block Rendering", () => {
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

  it("renders bold text with font-bold class when unfocused", async () => {
    await Effect.gen(function* () {
      const { bufferId, childNodeIds } = yield* Given.A_BUFFER_WITH_CHILDREN(
        "Root",
        [{ text: "hello world" }],
      );

      // Apply bold to "world" (positions 6-11)
      yield* Given.NODE_HAS_BOLD(childNodeIds[0], 6, 5);

      const blockId = Id.makeBlockId(bufferId, childNodeIds[0]);

      render(() => <EditorBuffer bufferId={bufferId} />);

      // Block starts unfocused - do NOT click on it
      // The bold portion "world" should be rendered with font-bold class
      yield* Then.UNFOCUSED_BLOCK_HAS_BOLD_TEXT(blockId, "world");
    }).pipe(runtime.runPromise);
  });

  it("renders mixed plain and bold text with correct styling when unfocused", async () => {
    await Effect.gen(function* () {
      const { bufferId, childNodeIds } = yield* Given.A_BUFFER_WITH_CHILDREN(
        "Root",
        [{ text: "plain BOLD plain" }],
      );

      // Apply bold to "BOLD" (positions 6-10)
      yield* Given.NODE_HAS_BOLD(childNodeIds[0], 6, 4);

      const blockId = Id.makeBlockId(bufferId, childNodeIds[0]);

      render(() => <EditorBuffer bufferId={bufferId} />);

      // Verify: "BOLD" should be bold, surrounding text should not
      yield* Then.UNFOCUSED_BLOCK_HAS_BOLD_TEXT(blockId, "BOLD");
      yield* Then.UNFOCUSED_BLOCK_HAS_PLAIN_TEXT(blockId, "plain");
    }).pipe(runtime.runPromise);
  });
});
