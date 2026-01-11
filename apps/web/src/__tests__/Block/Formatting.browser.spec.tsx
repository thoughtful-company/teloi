/**
 * Browser tests for text formatting (bold, italic, code).
 *
 * Tests shortcuts, split/merge preservation, and unfocused rendering.
 * Uses bold as representative for shared code paths.
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

describe("Text Formatting", () => {
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

  describe("Keyboard Shortcuts", () => {
    // All three use createFormatHandler - test each shortcut works
    it.each([
      { key: "{Meta>}b{/Meta}", mark: "bold" as const },
      { key: "{Meta>}i{/Meta}", mark: "italic" as const },
      { key: "{Meta>}e{/Meta}", mark: "code" as const },
    ])(
      "$mark: applies to selected text with Cmd shortcut",
      async ({ key, mark }) => {
        await Effect.gen(function* () {
          const { bufferId, childNodeIds } =
            yield* Given.A_BUFFER_WITH_CHILDREN("Root", [
              { text: "hello world" },
            ]);

          const blockId = Id.makeBlockId(bufferId, childNodeIds[0]);
          render(() => <EditorBuffer bufferId={bufferId} />);

          yield* When.USER_CLICKS_BLOCK(blockId);
          yield* When.USER_MOVES_CURSOR_TO(6);
          yield* When.USER_PRESSES("{Shift>}{End}{/Shift}");
          yield* When.USER_PRESSES(key);

          yield* Then.NODE_HAS_MARK_AT(childNodeIds[0], 6, 5, mark);
        }).pipe(runtime.runPromise);
      },
    );

    // Toggle off - uses same code path, test once with bold
    it("removes formatting when applied to already-formatted text", async () => {
      await Effect.gen(function* () {
        const { bufferId, childNodeIds } = yield* Given.A_BUFFER_WITH_CHILDREN(
          "Root",
          [{ text: "hello world" }],
        );

        yield* Given.NODE_HAS_BOLD(childNodeIds[0], 6, 5);

        const blockId = Id.makeBlockId(bufferId, childNodeIds[0]);
        render(() => <EditorBuffer bufferId={bufferId} />);

        yield* When.USER_CLICKS_BLOCK(blockId);
        yield* When.USER_MOVES_CURSOR_TO(6);
        yield* When.USER_PRESSES("{Shift>}{End}{/Shift}");
        yield* When.USER_PRESSES("{Meta>}b{/Meta}");

        yield* Then.NODE_HAS_NO_BOLD_AT(childNodeIds[0], 6, 5);
      }).pipe(runtime.runPromise);
    });

    // Pending mark at cursor - uses same code path, test once
    it("toggles pending format mode at cursor position", async () => {
      await Effect.gen(function* () {
        const { bufferId, childNodeIds } = yield* Given.A_BUFFER_WITH_CHILDREN(
          "Root",
          [{ text: "hello" }],
        );

        const blockId = Id.makeBlockId(bufferId, childNodeIds[0]);
        render(() => <EditorBuffer bufferId={bufferId} />);

        yield* When.USER_CLICKS_BLOCK(blockId);
        yield* When.USER_PRESSES("{End}");
        yield* When.USER_PRESSES("{Meta>}b{/Meta}");
        yield* When.USER_PRESSES(" world");

        yield* Then.NODE_HAS_BOLD_AT(childNodeIds[0], 5, 6);
        yield* Then.NODE_HAS_NO_BOLD_AT(childNodeIds[0], 0, 5);
      }).pipe(runtime.runPromise);
    });
  });

  describe("Split Preserves Formatting", () => {
    // Split uses getDeltasWithFormats - mark-agnostic, test once
    it("preserves formatting on both sides when splitting", async () => {
      await Effect.gen(function* () {
        const { bufferId, rootNodeId, childNodeIds } =
          yield* Given.A_BUFFER_WITH_CHILDREN("Root", [
            { text: "hello BOLD world" },
          ]);

        yield* Given.NODE_HAS_BOLD(childNodeIds[0], 6, 4);

        const blockId = Id.makeBlockId(bufferId, childNodeIds[0]);
        render(() => <EditorBuffer bufferId={bufferId} />);

        yield* When.USER_CLICKS_BLOCK(blockId);
        yield* When.USER_MOVES_CURSOR_TO(12);
        yield* When.USER_PRESSES("{Enter}");

        const Node = yield* NodeT;
        const children = yield* Node.getNodeChildren(rootNodeId);
        expect(children.length).toBe(2);

        yield* Then.NODE_HAS_TEXT(children[0]!, "hello BOLD w");
        yield* Then.NODE_HAS_BOLD_AT(children[0]!, 6, 4);
        yield* Then.NODE_HAS_TEXT(children[1]!, "orld");
        yield* Then.NODE_HAS_NO_FORMATTING(children[1]!);
      }).pipe(runtime.runPromise);
    });

    it("splits formatting when cursor is inside formatted text", async () => {
      await Effect.gen(function* () {
        const { bufferId, rootNodeId, childNodeIds } =
          yield* Given.A_BUFFER_WITH_CHILDREN("Root", [{ text: "hello BOLD" }]);

        yield* Given.NODE_HAS_BOLD(childNodeIds[0], 6, 4);

        const blockId = Id.makeBlockId(bufferId, childNodeIds[0]);
        render(() => <EditorBuffer bufferId={bufferId} />);

        yield* When.USER_CLICKS_BLOCK(blockId);
        yield* When.USER_MOVES_CURSOR_TO(8); // "hello BO|LD"
        yield* When.USER_PRESSES("{Enter}");

        const Node = yield* NodeT;
        const children = yield* Node.getNodeChildren(rootNodeId);

        yield* Then.NODE_HAS_TEXT(children[0]!, "hello BO");
        yield* Then.NODE_HAS_BOLD_AT(children[0]!, 6, 2);
        yield* Then.NODE_HAS_TEXT(children[1]!, "LD");
        yield* Then.NODE_HAS_BOLD_AT(children[1]!, 0, 2);
      }).pipe(runtime.runPromise);
    });
  });

  describe("Merge Preserves Formatting", () => {
    // Merge uses insertWithFormats - mark-agnostic, test once
    it("preserves formatting from both blocks on merge", async () => {
      await Effect.gen(function* () {
        const { bufferId, rootNodeId, childNodeIds } =
          yield* Given.A_BUFFER_WITH_CHILDREN("Root", [
            { text: "hello BOLD" },
            { text: "SECOND end" },
          ]);

        yield* Given.NODE_HAS_BOLD(childNodeIds[0], 6, 4);
        yield* Given.NODE_HAS_BOLD(childNodeIds[1], 0, 6);

        const secondBlockId = Id.makeBlockId(bufferId, childNodeIds[1]);
        render(() => <EditorBuffer bufferId={bufferId} />);

        yield* When.USER_CLICKS_BLOCK(secondBlockId);
        yield* When.USER_MOVES_CURSOR_TO(0);
        yield* When.USER_PRESSES("{Backspace}");

        yield* Then.NODE_HAS_CHILDREN(rootNodeId, 1);

        const Node = yield* NodeT;
        const children = yield* Node.getNodeChildren(rootNodeId);

        yield* Then.NODE_HAS_TEXT(children[0]!, "hello BOLDSECOND end");
        yield* Then.NODE_HAS_BOLD_AT(children[0]!, 6, 4);
        yield* Then.NODE_HAS_BOLD_AT(children[0]!, 10, 6);
      }).pipe(runtime.runPromise);
    });
  });

  describe("Unfocused Block Rendering", () => {
    // Each mark renders differently - test each
    it("renders bold with font-bold class", async () => {
      await Effect.gen(function* () {
        const { bufferId, childNodeIds } = yield* Given.A_BUFFER_WITH_CHILDREN(
          "Root",
          [{ text: "hello world" }],
        );

        yield* Given.NODE_HAS_BOLD(childNodeIds[0], 6, 5);
        const blockId = Id.makeBlockId(bufferId, childNodeIds[0]);

        render(() => <EditorBuffer bufferId={bufferId} />);

        yield* Then.UNFOCUSED_BLOCK_HAS_BOLD_TEXT(blockId, "world");
      }).pipe(runtime.runPromise);
    });

    it("renders italic with italic class", async () => {
      await Effect.gen(function* () {
        const { bufferId, childNodeIds } = yield* Given.A_BUFFER_WITH_CHILDREN(
          "Root",
          [{ text: "hello world" }],
        );

        yield* Given.NODE_HAS_ITALIC(childNodeIds[0], 6, 5);
        const blockId = Id.makeBlockId(bufferId, childNodeIds[0]);

        render(() => <EditorBuffer bufferId={bufferId} />);

        yield* Then.UNFOCUSED_BLOCK_HAS_ITALIC_TEXT(blockId, "world");
      }).pipe(runtime.runPromise);
    });

    it("renders code with monospace styling", async () => {
      await Effect.gen(function* () {
        const { bufferId, childNodeIds } = yield* Given.A_BUFFER_WITH_CHILDREN(
          "Root",
          [{ text: "hello world" }],
        );

        yield* Given.NODE_HAS_CODE(childNodeIds[0], 6, 5);
        const blockId = Id.makeBlockId(bufferId, childNodeIds[0]);

        render(() => <EditorBuffer bufferId={bufferId} />);

        yield* Then.UNFOCUSED_BLOCK_HAS_CODE_TEXT(blockId, "world");
      }).pipe(runtime.runPromise);
    });
  });
});
