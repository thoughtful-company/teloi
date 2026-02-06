import "@/index.css";
import { Id, System } from "@/schema";
import { NodeT } from "@/services/domain/Node";
import { TypeT } from "@/services/domain/Type";
import { AutomergeT } from "@/services/external/Automerge";
import { StoreT } from "@/services/external/Store";
import { BlockT } from "@/services/ui/Block";
import { FrameT } from "@/services/ui/Frame";
import { TypePickerT } from "@/services/ui/TypePicker";
import FrameView from "@/ui/FrameView";
import { makeCollapsedSelection } from "@/utils/selectionStrategy";
import { Effect, Option } from "effect";
import { beforeEach, describe, expect, it } from "vitest";
import {
  Given,
  Then,
  When,
  setupClientTest,
  type BrowserRuntime,
} from "@/test-utils/bdd";
import { waitFor } from "solid-testing-library";

describe("Frame indent/outdent (Tab key)", () => {
  let runtime: BrowserRuntime;
  let render: Awaited<ReturnType<typeof setupClientTest>>["render"];
  let cleanup: () => Promise<void>;

  beforeEach(async () => {
    if (cleanup!) await cleanup();
    const setup = await setupClientTest();
    runtime = setup.runtime;
    render = setup.render;
    cleanup = setup.cleanup;
  });

  it("indents block to become child of previous sibling when Tab pressed", async () => {
    await Effect.gen(function* () {
      // Setup: root with two children
      const { frameId, rootNodeId, childNodeIds } =
        yield* Given.A_FRAME_WITH_CHILDREN("Root node", [
          { text: "First child" },
          { text: "Second child" },
        ]);

      const secondChildBlockId = Id.makeFrameBlockId(frameId, childNodeIds[1]);

      render(() => <FrameView frameId={frameId} />);

      // Focus second child and press Tab
      yield* Given.BLOCK_IS_FOCUSED_AT(secondChildBlockId, 0);
      yield* When.USER_PRESSES("{Tab}");

      // Root should now have only one child (the first one)
      yield* Then.NODE_HAS_CHILDREN(rootNodeId, 1);

      // First child should now have one child (the second one, which was indented)
      yield* Then.NODE_HAS_CHILDREN(childNodeIds[0], 1);

      // Verify the indented node is now child of first sibling
      const Node = yield* NodeT;
      const firstChildChildren = yield* Node.getNodeChildren(childNodeIds[0]);
      yield* Then.NODE_HAS_TEXT(firstChildChildren[0]!, "Second child");
    }).pipe(runtime.runPromise);
  });

  it("indents block when text is selected", async () => {
    await Effect.gen(function* () {
      const { frameId, rootNodeId, childNodeIds } =
        yield* Given.A_FRAME_WITH_CHILDREN("Root node", [
          { text: "First child" },
          { text: "Second child" },
        ]);

      const secondChildBlockId = Id.makeFrameBlockId(frameId, childNodeIds[1]);

      render(() => <FrameView frameId={frameId} />);

      // Focus second child, select some text, then press Tab
      yield* Given.BLOCK_IS_FOCUSED_AT(secondChildBlockId, 0);
      yield* When.USER_PRESSES("{Shift>}{End}{/Shift}"); // Select all text
      yield* When.USER_PRESSES("{Tab}");

      // Should still indent despite having selection
      yield* Then.NODE_HAS_CHILDREN(rootNodeId, 1);
      yield* Then.NODE_HAS_CHILDREN(childNodeIds[0], 1);

      // Text should be preserved (not replaced by tab character)
      yield* Then.NODE_HAS_TEXT(childNodeIds[1], "Second child");
    }).pipe(runtime.runPromise);
  });

  it("preserves cursor position after indentation", async () => {
    await Effect.gen(function* () {
      const { frameId, rootNodeId, childNodeIds } =
        yield* Given.A_FRAME_WITH_CHILDREN("Root node", [
          { text: "First child" },
          { text: "Second child" },
        ]);

      const secondChildBlockId = Id.makeFrameBlockId(frameId, childNodeIds[1]);

      render(() => <FrameView frameId={frameId} />);

      // Focus second child, move cursor to position 7 ("Second |child")
      yield* Given.BLOCK_IS_FOCUSED_AT(secondChildBlockId, 7);
      yield* When.USER_PRESSES("{Tab}");

      // Should indent
      yield* Then.NODE_HAS_CHILDREN(rootNodeId, 1);

      // Cursor should still be at position 7
      yield* Then.SELECTION_IS_COLLAPSED_AT_OFFSET(7);
    }).pipe(runtime.runPromise);
  });

  it("dedents block to become sibling of parent when Shift+Tab pressed", async () => {
    await Effect.gen(function* () {
      const { frameId, rootNodeId, childNodeIds } =
        yield* Given.A_FRAME_WITH_CHILDREN("Root node", [
          { text: "First child" },
          { text: "Second child" },
        ]);

      const secondChildBlockId = Id.makeFrameBlockId(frameId, childNodeIds[1]);

      render(() => <FrameView frameId={frameId} />);

      yield* Given.BLOCK_IS_FOCUSED_AT(secondChildBlockId, 0);
      yield* When.USER_PRESSES("{Tab}");

      yield* Then.NODE_HAS_CHILDREN(rootNodeId, 1);
      yield* Then.NODE_HAS_CHILDREN(childNodeIds[0], 1);

      yield* When.USER_PRESSES("{Shift>}{Tab}{/Shift}");

      yield* Then.NODE_HAS_CHILDREN(rootNodeId, 2);
      yield* Then.NODE_HAS_CHILDREN(childNodeIds[0], 0);

      const Node = yield* NodeT;
      const rootChildren = yield* Node.getNodeChildren(rootNodeId);
      yield* Then.NODE_HAS_TEXT(rootChildren[0]!, "First child");
      yield* Then.NODE_HAS_TEXT(rootChildren[1]!, "Second child");
    }).pipe(runtime.runPromise);
  });

  it("Shift+Tab is no-op on first-level block when frame root has a parent", async () => {
    await Effect.gen(function* () {
      // Structure:
      // - Grandparent (not visible in frame)
      //   - FrameRoot (frame's assignedNodeId)
      //     - Child  <- First-level block, Shift+Tab should be no-op
      const { frameId, parentNodeId, rootNodeId, childNodeIds } =
        yield* Given.A_FRAME_WITH_PARENT_AND_CHILDREN(
          "Grandparent",
          "Frame Root",
          [{ text: "Child" }],
        );

      const childBlockId = Id.makeFrameBlockId(frameId, childNodeIds[0]);

      render(() => <FrameView frameId={frameId} />);

      // Focus child and press Shift+Tab
      yield* Given.BLOCK_IS_FOCUSED_AT(childBlockId, 0);
      yield* When.USER_PRESSES("{Shift>}{Tab}{/Shift}");

      // Child should STILL be under frame root (no-op, not moved to grandparent)
      yield* Then.NODE_HAS_CHILDREN(rootNodeId, 1);

      // Verify child's parent is still frame root
      const Node = yield* NodeT;
      const childParent = yield* Node.getParent(childNodeIds[0]);
      expect(childParent).toBe(rootNodeId);

      // Grandparent should still have only one child (frame root)
      yield* Then.NODE_HAS_CHILDREN(parentNodeId, 1);
    }).pipe(runtime.runPromise);
  });
});

describe("BlockTypePicker", () => {
  let runtime: BrowserRuntime;
  let render: Awaited<ReturnType<typeof setupClientTest>>["render"];
  let cleanup: () => Promise<void>;

  beforeEach(async () => {
    if (cleanup!) await cleanup();
    const setup = await setupClientTest();
    runtime = setup.runtime;
    render = setup.render;
    cleanup = setup.cleanup;
  });

  describe("Opening the picker", () => {
    it("pressing # in block selection mode opens the type picker", async () => {
      await Effect.gen(function* () {
        const { frameId, childNodeIds } = yield* Given.A_FRAME_WITH_CHILDREN(
          "Root",
          [{ text: "First" }, { text: "Second" }],
        );

        const firstBlockId = Id.makeFrameBlockId(frameId, childNodeIds[0]);

        render(() => <FrameView frameId={frameId} />);

        yield* When.USER_ENTERS_BLOCK_SELECTION(firstBlockId);

        yield* When.USER_PRESSES("#");

        yield* Effect.promise(() =>
          waitFor(
            () => {
              const picker = document.querySelector(
                "[data-testid='block-type-picker']",
              );
              expect(picker).toBeTruthy();
            },
            { timeout: 2000 },
          ),
        );
      }).pipe(runtime.runPromise);
    });
  });

  describe("Filtering types", () => {
    it("typing in popup input filters the type list", async () => {
      await Effect.gen(function* () {
        const TypePicker = yield* TypePickerT;
        yield* TypePicker.createType("Page");
        yield* TypePicker.createType("Project");

        const { frameId, childNodeIds } = yield* Given.A_FRAME_WITH_CHILDREN(
          "Root",
          [{ text: "First" }],
        );

        const firstBlockId = Id.makeFrameBlockId(frameId, childNodeIds[0]);

        render(() => <FrameView frameId={frameId} />);

        yield* When.USER_ENTERS_BLOCK_SELECTION(firstBlockId);
        yield* When.USER_PRESSES("#");

        // Wait for picker to appear
        yield* Effect.promise(() =>
          waitFor(
            () => {
              const picker = document.querySelector(
                "[data-testid='block-type-picker']",
              );
              if (!picker) throw new Error("Picker not found");
            },
            { timeout: 2000 },
          ),
        );

        // Type "pa" in the input to filter
        yield* When.USER_PRESSES("pa");

        yield* Effect.promise(() =>
          waitFor(
            () => {
              const picker = document.querySelector(
                "[data-testid='block-type-picker']",
              )!;
              const buttons = picker.querySelectorAll("button");
              const texts = Array.from(buttons).map((btn) => btn.textContent);
              // "Page" should be visible
              expect(texts.some((t) => t?.includes("Page"))).toBe(true);
              // "Project" should NOT be visible (doesn't match "pa")
              expect(texts.some((t) => t?.includes("Project"))).toBe(false);
            },
            { timeout: 2000 },
          ),
        );
      }).pipe(runtime.runPromise);
    });
  });

  describe("Applying types", () => {
    it("Enter on a type applies it to all selected blocks", async () => {
      await Effect.gen(function* () {
        const TypePicker = yield* TypePickerT;
        const uniqueName = `ApplyTest_${Date.now()}`;
        const typeId = yield* TypePicker.createType(uniqueName);

        const { frameId, childNodeIds } = yield* Given.A_FRAME_WITH_CHILDREN(
          "Root",
          [{ text: "First" }, { text: "Second" }],
        );

        const firstBlockId = Id.makeFrameBlockId(frameId, childNodeIds[0]);

        render(() => <FrameView frameId={frameId} />);

        // Enter block selection with first block, then extend to second
        yield* When.USER_ENTERS_BLOCK_SELECTION(firstBlockId);
        yield* When.USER_PRESSES("{Shift>}{ArrowDown}{/Shift}");

        // Open picker
        yield* When.USER_PRESSES("#");

        // Wait for picker and types to load
        yield* Effect.promise(() =>
          waitFor(
            () => {
              const picker = document.querySelector(
                "[data-testid='block-type-picker']",
              );
              if (!picker) throw new Error("Picker not found");
              const buttons = picker.querySelectorAll("button");
              if (buttons.length === 0) throw new Error("Types not loaded");
            },
            { timeout: 2000 },
          ),
        );

        // Type part of the name to filter down to our type
        yield* When.USER_PRESSES("apply");

        // Wait for filter to take effect and our type to show
        yield* Effect.promise(() =>
          waitFor(
            () => {
              const picker = document.querySelector(
                "[data-testid='block-type-picker']",
              )!;
              const buttons = picker.querySelectorAll("button");
              const hasType = Array.from(buttons).some((btn) =>
                btn.textContent?.includes(uniqueName),
              );
              if (!hasType)
                throw new Error("Type not showing in filtered list");
            },
            { timeout: 2000 },
          ),
        );

        // First type is already selected (index 0), just press Enter
        yield* When.USER_PRESSES("{Enter}");

        // Verify type applied to both blocks
        yield* Effect.promise(() =>
          waitFor(
            async () => {
              const Type = await TypeT.pipe(runtime.runPromise);
              const has1 = await Type.hasType(childNodeIds[0], typeId).pipe(
                runtime.runPromise,
              );
              const has2 = await Type.hasType(childNodeIds[1], typeId).pipe(
                runtime.runPromise,
              );
              expect(has1).toBe(true);
              expect(has2).toBe(true);
            },
            { timeout: 2000 },
          ),
        );

        // Picker should be closed
        yield* Effect.promise(() =>
          waitFor(
            () => {
              const picker = document.querySelector(
                "[data-testid='block-type-picker']",
              );
              expect(picker).toBeFalsy();
            },
            { timeout: 2000 },
          ),
        );
      }).pipe(runtime.runPromise);
    });

    it("Enter on 'Create and apply' creates and applies a new type", async () => {
      await Effect.gen(function* () {
        const { frameId, childNodeIds } = yield* Given.A_FRAME_WITH_CHILDREN(
          "Root",
          [{ text: "First" }, { text: "Second" }],
        );

        const firstBlockId = Id.makeFrameBlockId(frameId, childNodeIds[0]);

        render(() => <FrameView frameId={frameId} />);

        // Select both blocks
        yield* When.USER_ENTERS_BLOCK_SELECTION(firstBlockId);
        yield* When.USER_PRESSES("{Shift>}{ArrowDown}{/Shift}");

        // Open picker and type a new tag name
        yield* When.USER_PRESSES("#");

        yield* Effect.promise(() =>
          waitFor(
            () => {
              const picker = document.querySelector(
                "[data-testid='block-type-picker']",
              );
              if (!picker) throw new Error("Picker not found");
            },
            { timeout: 2000 },
          ),
        );

        yield* When.USER_PRESSES("newtag");

        // Wait for "Create and apply" to appear
        yield* Effect.promise(() =>
          waitFor(
            () => {
              const create = document.querySelector(
                "[data-testid='block-type-picker-create']",
              );
              if (!create) throw new Error("Create button not found");
            },
            { timeout: 2000 },
          ),
        );

        // No matching types, so "Create and apply" is at index 0 (the only item)
        yield* When.USER_PRESSES("{Enter}");

        // Verify the new type was created under System.SCHEMA
        yield* Effect.promise(() =>
          waitFor(
            async () => {
              const Node = await runtime.runPromise(NodeT);
              const Automerge = await runtime.runPromise(AutomergeT);
              const typeChildren = await runtime.runPromise(
                Node.getNodeChildren(System.SCHEMA),
              );
              const typeNames = await Promise.all(
                typeChildren.map((id) =>
                  runtime.runPromise(Automerge.getText(id)),
                ),
              );
              expect(typeNames).toContain("newtag");
            },
            { timeout: 2000 },
          ),
        );

        // Verify type applied to both selected blocks
        yield* Effect.promise(() =>
          waitFor(
            async () => {
              const Node = await runtime.runPromise(NodeT);
              const Automerge = await runtime.runPromise(AutomergeT);
              const Type = await TypeT.pipe(runtime.runPromise);

              // Find the "newtag" type id
              const typeChildren = await runtime.runPromise(
                Node.getNodeChildren(System.SCHEMA),
              );
              let newtagId: Id.Node | null = null;
              for (const id of typeChildren) {
                const text = await runtime.runPromise(Automerge.getText(id));
                if (text === "newtag") {
                  newtagId = id;
                  break;
                }
              }
              expect(newtagId).not.toBeNull();

              const has1 = await Type.hasType(childNodeIds[0], newtagId!).pipe(
                runtime.runPromise,
              );
              const has2 = await Type.hasType(childNodeIds[1], newtagId!).pipe(
                runtime.runPromise,
              );
              expect(has1).toBe(true);
              expect(has2).toBe(true);
            },
            { timeout: 2000 },
          ),
        );
      }).pipe(runtime.runPromise);
    });
  });

  describe("Closing the picker", () => {
    it("Escape closes the popup without applying types", async () => {
      await Effect.gen(function* () {
        const TypePicker = yield* TypePickerT;
        const typeId = yield* TypePicker.createType("ShouldNotApply");

        const { frameId, childNodeIds } = yield* Given.A_FRAME_WITH_CHILDREN(
          "Root",
          [{ text: "First" }],
        );

        const firstBlockId = Id.makeFrameBlockId(frameId, childNodeIds[0]);

        render(() => <FrameView frameId={frameId} />);

        yield* When.USER_ENTERS_BLOCK_SELECTION(firstBlockId);
        yield* When.USER_PRESSES("#");

        // Wait for picker
        yield* Effect.promise(() =>
          waitFor(
            () => {
              const picker = document.querySelector(
                "[data-testid='block-type-picker']",
              );
              if (!picker) throw new Error("Picker not found");
            },
            { timeout: 2000 },
          ),
        );

        // Close with Escape
        yield* When.USER_PRESSES("{Escape}");

        // Picker should be gone
        yield* Effect.promise(() =>
          waitFor(
            () => {
              const picker = document.querySelector(
                "[data-testid='block-type-picker']",
              );
              expect(picker).toBeFalsy();
            },
            { timeout: 2000 },
          ),
        );

        // No type should have been applied
        const Type = yield* TypeT;
        const hasType = yield* Type.hasType(childNodeIds[0], typeId);
        expect(hasType).toBe(false);
      }).pipe(runtime.runPromise);
    });

    it("after closing, focus returns to frame container", async () => {
      await Effect.gen(function* () {
        const { frameId, childNodeIds } = yield* Given.A_FRAME_WITH_CHILDREN(
          "Root",
          [{ text: "First" }],
        );

        const firstBlockId = Id.makeFrameBlockId(frameId, childNodeIds[0]);

        render(() => <FrameView frameId={frameId} />);

        yield* When.USER_ENTERS_BLOCK_SELECTION(firstBlockId);
        yield* When.USER_PRESSES("#");

        // Wait for picker
        yield* Effect.promise(() =>
          waitFor(
            () => {
              const picker = document.querySelector(
                "[data-testid='block-type-picker']",
              );
              if (!picker) throw new Error("Picker not found");
            },
            { timeout: 2000 },
          ),
        );

        // Close with Escape
        yield* When.USER_PRESSES("{Escape}");

        // Frame container should have focus
        yield* Effect.promise(() =>
          waitFor(
            () => {
              const container = document.querySelector(
                `[data-frame-id="${frameId}"]`,
              ) as HTMLElement | null;
              expect(container).toBeTruthy();
              expect(document.activeElement).toBe(container);
            },
            { timeout: 2000 },
          ),
        );
      }).pipe(runtime.runPromise);
    });
  });

  describe("Create and apply button", () => {
    it("'Create and apply' is visible at end when query is non-empty", async () => {
      await Effect.gen(function* () {
        const { frameId, childNodeIds } = yield* Given.A_FRAME_WITH_CHILDREN(
          "Root",
          [{ text: "First" }],
        );

        const firstBlockId = Id.makeFrameBlockId(frameId, childNodeIds[0]);

        render(() => <FrameView frameId={frameId} />);

        yield* When.USER_ENTERS_BLOCK_SELECTION(firstBlockId);
        yield* When.USER_PRESSES("#");

        // Wait for picker
        yield* Effect.promise(() =>
          waitFor(
            () => {
              const picker = document.querySelector(
                "[data-testid='block-type-picker']",
              );
              if (!picker) throw new Error("Picker not found");
            },
            { timeout: 2000 },
          ),
        );

        // "Create and apply" should NOT be visible when query is empty
        const createBefore = document.querySelector(
          "[data-testid='block-type-picker-create']",
        );
        expect(createBefore).toBeFalsy();

        // Type something
        yield* When.USER_PRESSES("abc");

        // "Create and apply" should now be visible
        yield* Effect.promise(() =>
          waitFor(
            () => {
              const create = document.querySelector(
                "[data-testid='block-type-picker-create']",
              );
              expect(create).toBeTruthy();
              expect(create?.textContent).toContain("Create and apply");
              expect(create?.textContent).toContain("#abc");
            },
            { timeout: 2000 },
          ),
        );
      }).pipe(runtime.runPromise);
    });
  });
});

// =============================================================================
// Collapse (Mod+Up) — Text editing mode
// =============================================================================

describe("Collapse (Mod+Up) — Text editing mode", () => {
  let runtime: BrowserRuntime;
  let render: Awaited<ReturnType<typeof setupClientTest>>["render"];
  let cleanup: () => Promise<void>;

  beforeEach(async () => {
    if (cleanup!) await cleanup();
    const setup = await setupClientTest();
    runtime = setup.runtime;
    render = setup.render;
    cleanup = setup.cleanup;
  });

  it("Mod+Up on expanded block collapses it and stays on the block", async () => {
    await Effect.gen(function* () {
      const { frameId, childNodeIds } = yield* Given.A_FRAME_WITH_CHILDREN(
        "Root",
        [{ text: "Parent" }],
      );

      const parentNodeId = childNodeIds[0];
      const parentBlockId = Id.makeFrameBlockId(frameId, parentNodeId);

      yield* Given.INSERT_NODE_WITH_TEXT({
        parentId: parentNodeId,
        insert: "after",
        text: "Child",
      });

      render(() => <FrameView frameId={frameId} />);

      yield* Given.BLOCK_IS_FOCUSED_AT(parentBlockId, 0);
      yield* Then.BLOCK_IS_EXPANDED(parentBlockId);

      yield* When.USER_PRESSES("{Meta>}{ArrowUp}{/Meta}");

      yield* Then.BLOCK_IS_COLLAPSED(parentBlockId);
      yield* Then.SELECTION_IS_ON_BLOCK(parentBlockId);
    }).pipe(runtime.runPromise);
  });

  it("Mod+Up on collapsed block navigates to parent", async () => {
    await Effect.gen(function* () {
      const { frameId, childNodeIds } = yield* Given.A_FRAME_WITH_CHILDREN(
        "Root",
        [{ text: "Parent" }],
      );

      const parentNodeId = childNodeIds[0];
      const parentBlockId = Id.makeFrameBlockId(frameId, parentNodeId);

      const childNodeId = yield* Given.INSERT_NODE_WITH_TEXT({
        parentId: parentNodeId,
        insert: "after",
        text: "Child",
      });
      const childBlockId = Id.makeFrameBlockId(frameId, childNodeId);

      render(() => <FrameView frameId={frameId} />);

      yield* Given.BLOCK_IS_FOCUSED_AT(childBlockId, 0);

      yield* When.USER_PRESSES("{Meta>}{ArrowUp}{/Meta}");

      yield* Then.SELECTION_IS_ON_BLOCK(parentBlockId);
      yield* Then.BLOCK_IS_COLLAPSED(parentBlockId);
    }).pipe(runtime.runPromise);
  });

  it("Mod+Up on root block (collapsed) focuses title", async () => {
    await Effect.gen(function* () {
      const { frameId, childNodeIds } = yield* Given.A_FRAME_WITH_CHILDREN(
        "Root",
        [{ text: "TopLevel" }],
      );

      const rootBlockNodeId = childNodeIds[0];
      const rootBlockId = Id.makeFrameBlockId(frameId, rootBlockNodeId);

      yield* Given.INSERT_NODE_WITH_TEXT({
        parentId: rootBlockNodeId,
        insert: "after",
        text: "Child",
      });

      render(() => <FrameView frameId={frameId} />);

      const Block = yield* BlockT;
      yield* Block.setExpanded(rootBlockId, false);
      yield* Then.BLOCK_IS_COLLAPSED(rootBlockId);

      yield* Given.BLOCK_IS_FOCUSED_AT(rootBlockId, 0);

      yield* When.USER_PRESSES("{Meta>}{ArrowUp}{/Meta}");

      yield* Then.SELECTION_IS_ON_TITLE(frameId);
    }).pipe(runtime.runPromise);
  });

  it("Mod+Up preserves goalX when navigating to parent", async () => {
    await Effect.gen(function* () {
      const Frame = yield* FrameT;

      const { frameId, childNodeIds } = yield* Given.A_FRAME_WITH_CHILDREN(
        "Root",
        [{ text: "Parent" }],
      );

      const parentNodeId = childNodeIds[0];
      const parentBlockId = Id.makeFrameBlockId(frameId, parentNodeId);

      const childNodeId = yield* Given.INSERT_NODE_WITH_TEXT({
        parentId: parentNodeId,
        insert: "after",
        text: "Child",
      });
      const childBlockId = Id.makeFrameBlockId(frameId, childNodeId);

      render(() => <FrameView frameId={frameId} />);

      // Pre-set goalX=42 on the child block
      yield* Given.BLOCK_IS_FOCUSED_AT(childBlockId, 0, 0, { goalX: 42 });

      yield* When.USER_PRESSES("{Meta>}{ArrowUp}{/Meta}");

      yield* Then.SELECTION_IS_ON_BLOCK(parentBlockId);

      const selectionAfter = yield* Frame.getSelection(frameId);
      expect(Option.isSome(selectionAfter)).toBe(true);
      expect(Option.getOrThrow(selectionAfter).goalX).toBe(42);
    }).pipe(runtime.runPromise);
  });

  it("Mod+Up on ghost block navigates to parent and collapses it", async () => {
    await Effect.gen(function* () {
      const { frameId, childNodeIds } = yield* Given.A_FRAME_WITH_CHILDREN(
        "Root",
        [{ text: "Leaf" }],
      );

      const leafNodeId = childNodeIds[0];
      const leafBlockId = Id.makeFrameBlockId(frameId, leafNodeId);

      render(() => <FrameView frameId={frameId} />);

      // Focus the leaf and expand it — creates a ghost
      yield* Given.BLOCK_IS_FOCUSED_AT(leafBlockId, 0);
      yield* When.USER_PRESSES("{Meta>}{ArrowDown}{/Meta}");

      // Ghost should exist and be focused
      const Store = yield* StoreT;
      const blockDoc = yield* Store.getDocument("block", leafBlockId);
      const ghostChildId = Option.getOrThrow(blockDoc).ghostChildId!;
      const ghostBlockId = Id.makeFrameBlockId(
        frameId,
        ghostChildId as Id.Node,
      );
      yield* Then.SELECTION_IS_ON_BLOCK(ghostBlockId);

      // Mod+Up on ghost → navigate to parent and collapse it
      yield* When.USER_PRESSES("{Meta>}{ArrowUp}{/Meta}");

      yield* Then.SELECTION_IS_ON_BLOCK(leafBlockId);
      yield* Then.BLOCK_IS_COLLAPSED(leafBlockId);
    }).pipe(runtime.runPromise);
  });
});

// =============================================================================
// Collapse (Mod+Up) — Block selection mode
// =============================================================================

describe("Collapse (Mod+Up) — Block selection mode", () => {
  let runtime: BrowserRuntime;
  let render: Awaited<ReturnType<typeof setupClientTest>>["render"];
  let cleanup: () => Promise<void>;

  beforeEach(async () => {
    if (cleanup!) await cleanup();
    const setup = await setupClientTest();
    runtime = setup.runtime;
    render = setup.render;
    cleanup = setup.cleanup;
  });

  // Multi-block collapse not yet implemented (Collapse only handles selectedBlocks[0])
  it.fails("Mod+Up collapses all expanded selected blocks", async () => {
    await Effect.gen(function* () {
      const { frameId, childNodeIds } = yield* Given.A_FRAME_WITH_CHILDREN(
        "Root",
        [{ text: "A" }, { text: "B" }],
      );

      const [nodeA, nodeB] = childNodeIds;
      const blockA = Id.makeFrameBlockId(frameId, nodeA);
      const blockB = Id.makeFrameBlockId(frameId, nodeB);

      // Give both children so they are expandable
      yield* Given.INSERT_NODE_WITH_TEXT({
        parentId: nodeA,
        insert: "after",
        text: "Child of A",
      });
      yield* Given.INSERT_NODE_WITH_TEXT({
        parentId: nodeB,
        insert: "after",
        text: "Child of B",
      });

      render(() => <FrameView frameId={frameId} />);

      yield* Then.BLOCK_IS_EXPANDED(blockA);
      yield* Then.BLOCK_IS_EXPANDED(blockB);

      // Select both blocks
      yield* When.USER_ENTERS_BLOCK_SELECTION(blockA);
      yield* When.USER_PRESSES("{Shift>}{ArrowDown}{/Shift}");
      yield* Then.BLOCKS_ARE_SELECTED(frameId, [nodeA, nodeB]);

      yield* When.USER_PRESSES("{Meta>}{ArrowUp}{/Meta}");

      yield* Then.BLOCK_IS_COLLAPSED(blockA);
      yield* Then.BLOCK_IS_COLLAPSED(blockB);
    }).pipe(runtime.runPromise);
  });

  it("Mod+Up on collapsed blocks navigates to focus block's parent", async () => {
    await Effect.gen(function* () {
      const { frameId, childNodeIds } = yield* Given.A_FRAME_WITH_CHILDREN(
        "Root",
        [{ text: "A" }, { text: "B" }],
      );

      const [nodeA, nodeB] = childNodeIds;
      const blockA = Id.makeFrameBlockId(frameId, nodeA);

      render(() => <FrameView frameId={frameId} />);

      // Select both collapsed sibling blocks (no children = treated as collapsed)
      yield* When.USER_ENTERS_BLOCK_SELECTION(blockA);
      yield* When.USER_PRESSES("{Shift>}{ArrowDown}{/Shift}");
      yield* Then.BLOCKS_ARE_SELECTED(frameId, [nodeA, nodeB]);

      yield* When.USER_PRESSES("{Meta>}{ArrowUp}{/Meta}");

      // Should navigate to parent (root node) — focuses title since parent is frame root
      yield* Then.SELECTION_IS_ON_TITLE(frameId);
    }).pipe(runtime.runPromise);
  });
});

// =============================================================================
// Expand (Mod+Down) — Text editing mode
// =============================================================================

describe("Expand (Mod+Down) — Text editing mode", () => {
  let runtime: BrowserRuntime;
  let render: Awaited<ReturnType<typeof setupClientTest>>["render"];
  let cleanup: () => Promise<void>;

  beforeEach(async () => {
    if (cleanup!) await cleanup();
    const setup = await setupClientTest();
    runtime = setup.runtime;
    render = setup.render;
    cleanup = setup.cleanup;
  });

  it("Mod+Down expands a collapsed block", async () => {
    await Effect.gen(function* () {
      const { frameId, childNodeIds } = yield* Given.A_FRAME_WITH_CHILDREN(
        "Root",
        [{ text: "Parent" }],
      );

      const parentNodeId = childNodeIds[0];
      const parentBlockId = Id.makeFrameBlockId(frameId, parentNodeId);

      yield* Given.INSERT_NODE_WITH_TEXT({
        parentId: parentNodeId,
        insert: "after",
        text: "Child",
      });

      render(() => <FrameView frameId={frameId} />);

      const Block = yield* BlockT;
      yield* Block.setExpanded(parentBlockId, false);
      yield* Then.BLOCK_IS_COLLAPSED(parentBlockId);

      yield* Given.BLOCK_IS_FOCUSED_AT(parentBlockId, 0);

      yield* When.USER_PRESSES("{Meta>}{ArrowDown}{/Meta}");

      yield* Then.BLOCK_IS_EXPANDED(parentBlockId);
    }).pipe(runtime.runPromise);
  });

  it("Mod+Down on a childless block creates ghost and focuses it", async () => {
    await Effect.gen(function* () {
      const { frameId, childNodeIds } = yield* Given.A_FRAME_WITH_CHILDREN(
        "Root",
        [{ text: "Leaf" }],
      );

      const leafNodeId = childNodeIds[0];
      const leafBlockId = Id.makeFrameBlockId(frameId, leafNodeId);

      render(() => <FrameView frameId={frameId} />);

      yield* Given.BLOCK_IS_FOCUSED_AT(leafBlockId, 0);

      yield* When.USER_PRESSES("{Meta>}{ArrowDown}{/Meta}");

      // Parent should have a ghostChildId
      const Store = yield* StoreT;
      const blockDoc = yield* Store.getDocument("block", leafBlockId);
      expect(Option.isSome(blockDoc)).toBe(true);
      const ghostChildId = Option.getOrThrow(blockDoc).ghostChildId;
      expect(ghostChildId).not.toBeNull();

      // Focus should have moved to the ghost block
      const ghostBlockId = Id.makeFrameBlockId(
        frameId,
        ghostChildId! as Id.Node,
      );
      yield* Then.SELECTION_IS_ON_BLOCK(ghostBlockId);
    }).pipe(runtime.runPromise);
  });
});

// =============================================================================
// Expand (Mod+Down) — Block selection mode
// =============================================================================

describe("Expand (Mod+Down) — Block selection mode", () => {
  let runtime: BrowserRuntime;
  let render: Awaited<ReturnType<typeof setupClientTest>>["render"];
  let cleanup: () => Promise<void>;

  beforeEach(async () => {
    if (cleanup!) await cleanup();
    const setup = await setupClientTest();
    runtime = setup.runtime;
    render = setup.render;
    cleanup = setup.cleanup;
  });

  it("Mod+Down expands all collapsed selected blocks", async () => {
    await Effect.gen(function* () {
      const { frameId, childNodeIds } = yield* Given.A_FRAME_WITH_CHILDREN(
        "Root",
        [{ text: "A" }, { text: "B" }],
      );

      const [nodeA, nodeB] = childNodeIds;
      const blockA = Id.makeFrameBlockId(frameId, nodeA);
      const blockB = Id.makeFrameBlockId(frameId, nodeB);

      yield* Given.INSERT_NODE_WITH_TEXT({
        parentId: nodeA,
        insert: "after",
        text: "Child of A",
      });
      yield* Given.INSERT_NODE_WITH_TEXT({
        parentId: nodeB,
        insert: "after",
        text: "Child of B",
      });

      render(() => <FrameView frameId={frameId} />);

      const Block = yield* BlockT;
      yield* Block.setExpanded(blockA, false);
      yield* Block.setExpanded(blockB, false);
      yield* Then.BLOCK_IS_COLLAPSED(blockA);
      yield* Then.BLOCK_IS_COLLAPSED(blockB);

      // Select both blocks
      yield* When.USER_ENTERS_BLOCK_SELECTION(blockA);
      yield* When.USER_PRESSES("{Shift>}{ArrowDown}{/Shift}");
      yield* Then.BLOCKS_ARE_SELECTED(frameId, [nodeA, nodeB]);

      yield* When.USER_PRESSES("{Meta>}{ArrowDown}{/Meta}");

      yield* Then.BLOCK_IS_EXPANDED(blockA);
      yield* Then.BLOCK_IS_EXPANDED(blockB);
      yield* Then.BLOCKS_ARE_SELECTED(frameId, [nodeA, nodeB]);
    }).pipe(runtime.runPromise);
  });

  it("Mod+Down expands children when the node is already expanded", async () => {
    await Effect.gen(function* () {
      const { frameId, childNodeIds } = yield* Given.A_FRAME_WITH_CHILDREN(
        "Root",
        [{ text: "A" }],
      );

      const nodeA = childNodeIds[0];
      const blockA = Id.makeFrameBlockId(frameId, nodeA);

      const nodeB = yield* Given.INSERT_NODE_WITH_TEXT({
        parentId: nodeA,
        insert: "after",
        text: "B",
      });
      const blockB = Id.makeFrameBlockId(frameId, nodeB);

      // Give B a child so it's collapsible
      yield* Given.INSERT_NODE_WITH_TEXT({
        parentId: nodeB,
        insert: "after",
        text: "C",
      });

      render(() => <FrameView frameId={frameId} />);

      // A expanded by default, collapse B
      const Block = yield* BlockT;
      yield* Block.setExpanded(blockB, false);
      yield* Then.BLOCK_IS_EXPANDED(blockA);
      yield* Then.BLOCK_IS_COLLAPSED(blockB);

      // Select A in block selection mode
      yield* When.USER_ENTERS_BLOCK_SELECTION(blockA);

      yield* When.USER_PRESSES("{Meta>}{ArrowDown}{/Meta}");

      // A was already expanded, so B (child) should expand
      yield* Then.BLOCK_IS_EXPANDED(blockB);
    }).pipe(runtime.runPromise);
  });
});

// =============================================================================
// Expand (Mod+Down) — Title
// =============================================================================

describe("Expand (Mod+Down) — Title", () => {
  let runtime: BrowserRuntime;
  let render: Awaited<ReturnType<typeof setupClientTest>>["render"];
  let cleanup: () => Promise<void>;

  beforeEach(async () => {
    if (cleanup!) await cleanup();
    const setup = await setupClientTest();
    runtime = setup.runtime;
    render = setup.render;
    cleanup = setup.cleanup;
  });

  it("Mod+Down on title expands all first-level nodes", async () => {
    await Effect.gen(function* () {
      const { frameId, childNodeIds } = yield* Given.A_FRAME_WITH_CHILDREN(
        "Root",
        [{ text: "A" }, { text: "B" }],
      );

      const [nodeA, nodeB] = childNodeIds;
      const blockA = Id.makeFrameBlockId(frameId, nodeA);
      const blockB = Id.makeFrameBlockId(frameId, nodeB);

      // Give both children so they are collapsible
      yield* Given.INSERT_NODE_WITH_TEXT({
        parentId: nodeA,
        insert: "after",
        text: "Child of A",
      });
      yield* Given.INSERT_NODE_WITH_TEXT({
        parentId: nodeB,
        insert: "after",
        text: "Child of B",
      });

      render(() => <FrameView frameId={frameId} />);

      // Collapse both
      const Block = yield* BlockT;
      yield* Block.setExpanded(blockA, false);
      yield* Block.setExpanded(blockB, false);
      yield* Then.BLOCK_IS_COLLAPSED(blockA);
      yield* Then.BLOCK_IS_COLLAPSED(blockB);

      yield* When.USER_CLICKS_TITLE(frameId);

      // DFS expand: first press expands A (first collapsed child)
      yield* When.USER_PRESSES("{Meta>}{ArrowDown}{/Meta}");
      yield* Then.BLOCK_IS_EXPANDED(blockA);
      yield* Then.BLOCK_IS_COLLAPSED(blockB);

      // Second press expands B (next collapsed child at same level)
      yield* When.USER_PRESSES("{Meta>}{ArrowDown}{/Meta}");
      yield* Then.BLOCK_IS_EXPANDED(blockB);
    }).pipe(runtime.runPromise);
  });

  it("Mod+Down expands next level when first level already expanded", async () => {
    await Effect.gen(function* () {
      const { frameId, childNodeIds } = yield* Given.A_FRAME_WITH_CHILDREN(
        "Root",
        [{ text: "A" }],
      );

      const nodeA = childNodeIds[0];
      const blockA = Id.makeFrameBlockId(frameId, nodeA);

      const nodeA1 = yield* Given.INSERT_NODE_WITH_TEXT({
        parentId: nodeA,
        insert: "after",
        text: "A1",
      });
      const blockA1 = Id.makeFrameBlockId(frameId, nodeA1);

      yield* Given.INSERT_NODE_WITH_TEXT({
        parentId: nodeA1,
        insert: "after",
        text: "A1a",
      });

      render(() => <FrameView frameId={frameId} />);

      // A expanded by default, collapse A1
      const Block = yield* BlockT;
      yield* Block.setExpanded(blockA1, false);
      yield* Then.BLOCK_IS_EXPANDED(blockA);
      yield* Then.BLOCK_IS_COLLAPSED(blockA1);

      yield* When.USER_CLICKS_TITLE(frameId);

      yield* When.USER_PRESSES("{Meta>}{ArrowDown}{/Meta}");

      // First level (A) already expanded, so A1 should expand
      yield* Then.BLOCK_IS_EXPANDED(blockA1);
    }).pipe(runtime.runPromise);
  });
});

// =============================================================================
// Auto-expand ancestors on selection
// =============================================================================

describe("Auto-expand ancestors on selection", () => {
  let runtime: BrowserRuntime;
  let render: Awaited<ReturnType<typeof setupClientTest>>["render"];
  let cleanup: () => Promise<void>;

  beforeEach(async () => {
    if (cleanup!) await cleanup();
    const setup = await setupClientTest();
    runtime = setup.runtime;
    render = setup.render;
    cleanup = setup.cleanup;
  });

  it("expands collapsed parent when setting block selection to child", async () => {
    await Effect.gen(function* () {
      const { frameId, childNodeIds } = yield* Given.A_FRAME_WITH_CHILDREN(
        "Root",
        [{ text: "Parent" }],
      );

      const parentNodeId = childNodeIds[0];
      const parentBlockId = Id.makeFrameBlockId(frameId, parentNodeId);

      const childNodeId = yield* Given.INSERT_NODE_WITH_TEXT({
        parentId: parentNodeId,
        insert: "after",
        text: "Child content",
      });

      render(() => <FrameView frameId={frameId} />);

      const Block = yield* BlockT;
      yield* Block.setExpanded(parentBlockId, false);
      yield* Then.BLOCK_IS_COLLAPSED(parentBlockId);

      const Frame = yield* FrameT;
      yield* Frame.setBlockSelection(
        frameId,
        [childNodeId],
        childNodeId,
        childNodeId,
      );

      yield* Then.BLOCK_IS_EXPANDED(parentBlockId);
    }).pipe(runtime.runPromise);
  });

  it("expands all necessary ancestors for multiple nodes at different depths", async () => {
    await Effect.gen(function* () {
      const { frameId, childNodeIds } = yield* Given.A_FRAME_WITH_CHILDREN(
        "Root",
        [{ text: "A" }, { text: "B" }],
      );

      const [nodeA, nodeB] = childNodeIds;
      const blockA = Id.makeFrameBlockId(frameId, nodeA);
      const blockB = Id.makeFrameBlockId(frameId, nodeB);

      const nodeA1 = yield* Given.INSERT_NODE_WITH_TEXT({
        parentId: nodeA,
        insert: "after",
        text: "A1",
      });

      const nodeB1 = yield* Given.INSERT_NODE_WITH_TEXT({
        parentId: nodeB,
        insert: "after",
        text: "B1",
      });
      const blockB1 = Id.makeFrameBlockId(frameId, nodeB1);

      const nodeB1a = yield* Given.INSERT_NODE_WITH_TEXT({
        parentId: nodeB1,
        insert: "after",
        text: "B1a",
      });

      render(() => <FrameView frameId={frameId} />);

      const Block = yield* BlockT;
      yield* Block.setExpanded(blockA, false);
      yield* Block.setExpanded(blockB, false);
      yield* Block.setExpanded(blockB1, false);
      yield* Then.BLOCK_IS_COLLAPSED(blockA);
      yield* Then.BLOCK_IS_COLLAPSED(blockB);
      yield* Then.BLOCK_IS_COLLAPSED(blockB1);

      const Frame = yield* FrameT;
      yield* Frame.setBlockSelection(
        frameId,
        [nodeA1, nodeB1a],
        nodeA1,
        nodeB1a,
      );

      yield* Then.BLOCK_IS_EXPANDED(blockA);
      yield* Then.BLOCK_IS_EXPANDED(blockB);
      yield* Then.BLOCK_IS_EXPANDED(blockB1);
    }).pipe(runtime.runPromise);
  });

  it("does not expand anything when selecting direct child of frame root", async () => {
    await Effect.gen(function* () {
      const { frameId, childNodeIds } = yield* Given.A_FRAME_WITH_CHILDREN(
        "Root",
        [{ text: "Direct child" }],
      );

      const childNodeId = childNodeIds[0];

      render(() => <FrameView frameId={frameId} />);

      const Frame = yield* FrameT;
      const childBlockId = Id.makeFrameBlockId(frameId, childNodeId);
      yield* Frame.setSelection(
        frameId,
        makeCollapsedSelection(childBlockId, 0),
      );

      const selection = yield* Frame.getSelection(frameId);
      expect(Option.isSome(selection)).toBe(true);
      expect(Option.getOrThrow(selection).anchor.elementId).toBe(childBlockId);
    }).pipe(runtime.runPromise);
  });
});
