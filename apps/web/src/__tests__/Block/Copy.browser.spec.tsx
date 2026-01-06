import "@/index.css";
import { Id } from "@/schema";
import EditorBuffer from "@/ui/EditorBuffer";
import { Effect } from "effect";
import { afterEach, beforeEach, describe, it, vi } from "vitest";
import { Given, render, runtime, Then, When } from "../bdd";

describe("Copy selected blocks (Mod+C)", () => {
  let clipboardContent: string = "";

  beforeEach(() => {
    clipboardContent = "";
    vi.spyOn(navigator.clipboard, "writeText").mockImplementation(
      async (text) => {
        clipboardContent = text;
      },
    );
    vi.spyOn(navigator.clipboard, "readText").mockImplementation(async () => {
      return clipboardContent;
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("Mod+C copies single selected block text to clipboard", async () => {
    await Effect.gen(function* () {
      // Given: A buffer with a block selected
      const { bufferId, childNodeIds } = yield* Given.A_BUFFER_WITH_CHILDREN(
        "Root",
        [{ text: "Hello world" }],
      );

      const blockId = Id.makeBlockId(bufferId, childNodeIds[0]);
      render(() => <EditorBuffer bufferId={bufferId} />);

      yield* When.USER_ENTERS_BLOCK_SELECTION(blockId);
      yield* Then.BLOCKS_ARE_SELECTED(bufferId, [childNodeIds[0]]);

      // When: User presses Mod+C
      yield* When.USER_PRESSES("{Meta>}c{/Meta}");

      // Then: Clipboard contains the block text
      yield* Then.CLIPBOARD_CONTAINS("Hello world");
    }).pipe(runtime.runPromise);
  });

  it("Mod+C copies multiple selected blocks with double newlines", async () => {
    await Effect.gen(function* () {
      // Given: A buffer with 3 blocks, first two selected
      const { bufferId, childNodeIds } = yield* Given.A_BUFFER_WITH_CHILDREN(
        "Root",
        [
          { text: "First block" },
          { text: "Second block" },
          { text: "Third block" },
        ],
      );

      const firstBlockId = Id.makeBlockId(bufferId, childNodeIds[0]);
      render(() => <EditorBuffer bufferId={bufferId} />);

      yield* When.USER_ENTERS_BLOCK_SELECTION(firstBlockId);
      yield* Then.BLOCKS_ARE_SELECTED(bufferId, [childNodeIds[0]]);

      // Extend selection to include second block
      yield* When.USER_PRESSES("{Shift>}{ArrowDown}{/Shift}");
      yield* Then.BLOCKS_ARE_SELECTED(bufferId, [
        childNodeIds[0],
        childNodeIds[1],
      ]);

      // When: User presses Mod+C
      yield* When.USER_PRESSES("{Meta>}c{/Meta}");

      // Then: Clipboard contains both blocks separated by double newline
      yield* Then.CLIPBOARD_CONTAINS("First block\n\nSecond block");
    }).pipe(runtime.runPromise);
  });

  it("Mod+C respects document order (not selection order)", async () => {
    await Effect.gen(function* () {
      // Given: A buffer with 3 blocks, select from third going up
      const { bufferId, childNodeIds } = yield* Given.A_BUFFER_WITH_CHILDREN(
        "Root",
        [{ text: "Alpha" }, { text: "Beta" }, { text: "Gamma" }],
      );

      const thirdBlockId = Id.makeBlockId(bufferId, childNodeIds[2]);
      render(() => <EditorBuffer bufferId={bufferId} />);

      yield* When.USER_ENTERS_BLOCK_SELECTION(thirdBlockId);
      yield* Then.BLOCKS_ARE_SELECTED(bufferId, [childNodeIds[2]]);

      // Extend selection upward to include all blocks (anchor = third, focus = first)
      yield* When.USER_PRESSES("{Shift>}{ArrowUp}{/Shift}");
      yield* When.USER_PRESSES("{Shift>}{ArrowUp}{/Shift}");

      yield* Then.BLOCKS_ARE_SELECTED(
        bufferId,
        [childNodeIds[0], childNodeIds[1], childNodeIds[2]],
        { anchor: childNodeIds[2], focus: childNodeIds[0] },
      );

      // When: User presses Mod+C
      yield* When.USER_PRESSES("{Meta>}c{/Meta}");

      // Then: Clipboard contains blocks in document order (Alpha, Beta, Gamma)
      // NOT in selection order (Gamma first because it was anchor)
      yield* Then.CLIPBOARD_CONTAINS("Alpha\n\nBeta\n\nGamma");
    }).pipe(runtime.runPromise);
  });
});
