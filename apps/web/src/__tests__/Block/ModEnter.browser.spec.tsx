import "@/index.css";
import { Id, System } from "@/schema";
import { TupleT } from "@/services/domain/Tuple";
import { TypeT } from "@/services/domain/Type";
import EditorBuffer from "@/ui/EditorBuffer";
import { Effect } from "effect";
import { waitFor } from "solid-testing-library";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  Given,
  Then,
  When,
  setupClientTest,
  type BrowserRuntime,
} from "../bdd";

/**
 * Tests for Mod+Enter (Cmd+Enter on Mac) todo toggle feature.
 *
 * The shortcut cycles through checkbox states:
 * 1. Normal block -> Unchecked checkbox (add CHECKBOX type + IS_CHECKED=FALSE tuple)
 * 2. Unchecked checkbox -> Checked checkbox (update IS_CHECKED tuple to TRUE)
 * 3. Checked checkbox -> Normal block (remove CHECKBOX type + delete IS_CHECKED tuple)
 *
 * Works in both editor mode (CodeMirror) and block selection mode.
 * When multiple blocks selected, toggles each independently.
 * If block has LIST_ELEMENT (bullet), replaces it with CHECKBOX.
 */
describe("Block Mod+Enter todo toggle", () => {
  let runtime: BrowserRuntime;
  let render: Awaited<ReturnType<typeof setupClientTest>>["render"];
  let cleanup: () => Promise<void>;

  beforeEach(async () => {
    const setup = await setupClientTest();
    runtime = setup.runtime;
    render = setup.render;
    cleanup = setup.cleanup;
    history.replaceState({}, "", "/");
  });

  afterEach(async () => {
    await cleanup();
  });

  describe("Editor mode (CodeMirror focused)", () => {
    it("converts normal block to unchecked checkbox", async () => {
      await Effect.gen(function* () {
        const Type = yield* TypeT;
        const Tuple = yield* TupleT;

        // Setup: buffer with a normal block (no checkbox type)
        const { bufferId, childNodeIds } = yield* Given.A_BUFFER_WITH_CHILDREN(
          "Root node",
          [{ text: "Buy groceries" }],
        );
        const childNodeId = childNodeIds[0];
        const childBlockId = Id.makeBlockId(bufferId, childNodeId);

        render(() => <EditorBuffer bufferId={bufferId} />);

        // Click the block to focus CodeMirror
        yield* When.USER_CLICKS_BLOCK(childBlockId);

        // Wait for CodeMirror to be focused
        yield* Effect.promise(() =>
          waitFor(
            () => {
              const cmEditor = document.querySelector(".cm-editor.cm-focused");
              if (!cmEditor) throw new Error("CodeMirror not focused");
            },
            { timeout: 2000 },
          ),
        );

        // Press Mod+Enter
        yield* When.USER_PRESSES("{Meta>}{Enter}{/Meta}");

        // Verify: node has CHECKBOX type
        yield* Effect.promise(() =>
          waitFor(
            async () => {
              const hasCheckbox = await Type.hasType(
                childNodeId,
                System.CHECKBOX,
              ).pipe(runtime.runPromise);
              expect(hasCheckbox).toBe(true);
            },
            { timeout: 2000 },
          ),
        );

        // Verify: IS_CHECKED tuple exists with FALSE value (unchecked)
        const isCheckedTuples = yield* Tuple.findByPosition(
          System.IS_CHECKED,
          0,
          childNodeId,
        );
        expect(isCheckedTuples.length).toBe(1);
        expect(isCheckedTuples[0]!.members[1]).toBe(System.FALSE);

        // Verify: text content preserved
        yield* Then.NODE_HAS_TEXT(childNodeId, "Buy groceries");
      }).pipe(runtime.runPromise);
    });

    it("converts unchecked checkbox to checked checkbox", async () => {
      await Effect.gen(function* () {
        const Type = yield* TypeT;
        const Tuple = yield* TupleT;

        // Setup: buffer with a child node that has unchecked checkbox
        const { bufferId, childNodeIds } = yield* Given.A_BUFFER_WITH_CHILDREN(
          "Root node",
          [{ text: "Task to complete" }],
        );
        const childNodeId = childNodeIds[0];
        const childBlockId = Id.makeBlockId(bufferId, childNodeId);

        // Add checkbox type and IS_CHECKED tuple with FALSE
        yield* Type.addType(childNodeId, System.CHECKBOX);
        yield* Tuple.create(System.IS_CHECKED, [childNodeId, System.FALSE]);

        render(() => <EditorBuffer bufferId={bufferId} />);

        // Click the block to focus CodeMirror
        yield* When.USER_CLICKS_BLOCK(childBlockId);

        // Wait for CodeMirror to be focused
        yield* Effect.promise(() =>
          waitFor(
            () => {
              const cmEditor = document.querySelector(".cm-editor.cm-focused");
              if (!cmEditor) throw new Error("CodeMirror not focused");
            },
            { timeout: 2000 },
          ),
        );

        // Press Mod+Enter
        yield* When.USER_PRESSES("{Meta>}{Enter}{/Meta}");

        // Verify: node still has CHECKBOX type
        yield* Effect.promise(() =>
          waitFor(
            async () => {
              const hasCheckbox = await Type.hasType(
                childNodeId,
                System.CHECKBOX,
              ).pipe(runtime.runPromise);
              expect(hasCheckbox).toBe(true);
            },
            { timeout: 2000 },
          ),
        );

        // Verify: IS_CHECKED tuple now has TRUE value (checked)
        const isCheckedTuples = yield* Tuple.findByPosition(
          System.IS_CHECKED,
          0,
          childNodeId,
        );
        expect(isCheckedTuples.length).toBe(1);
        expect(isCheckedTuples[0]!.members[1]).toBe(System.TRUE);

        // Verify: text content preserved
        yield* Then.NODE_HAS_TEXT(childNodeId, "Task to complete");
      }).pipe(runtime.runPromise);
    });

    it("converts checked checkbox back to normal block", async () => {
      await Effect.gen(function* () {
        const Type = yield* TypeT;
        const Tuple = yield* TupleT;

        // Setup: buffer with a child node that has checked checkbox
        const { bufferId, childNodeIds } = yield* Given.A_BUFFER_WITH_CHILDREN(
          "Root node",
          [{ text: "Completed task" }],
        );
        const childNodeId = childNodeIds[0];
        const childBlockId = Id.makeBlockId(bufferId, childNodeId);

        // Add checkbox type and IS_CHECKED tuple with TRUE (checked)
        yield* Type.addType(childNodeId, System.CHECKBOX);
        yield* Tuple.create(System.IS_CHECKED, [childNodeId, System.TRUE]);

        render(() => <EditorBuffer bufferId={bufferId} />);

        // Click the block to focus CodeMirror
        yield* When.USER_CLICKS_BLOCK(childBlockId);

        // Wait for CodeMirror to be focused
        yield* Effect.promise(() =>
          waitFor(
            () => {
              const cmEditor = document.querySelector(".cm-editor.cm-focused");
              if (!cmEditor) throw new Error("CodeMirror not focused");
            },
            { timeout: 2000 },
          ),
        );

        // Press Mod+Enter
        yield* When.USER_PRESSES("{Meta>}{Enter}{/Meta}");

        // Verify: node no longer has CHECKBOX type
        yield* Effect.promise(() =>
          waitFor(
            async () => {
              const hasCheckbox = await Type.hasType(
                childNodeId,
                System.CHECKBOX,
              ).pipe(runtime.runPromise);
              expect(hasCheckbox).toBe(false);
            },
            { timeout: 2000 },
          ),
        );

        // Verify: IS_CHECKED tuple removed
        const isCheckedTuples = yield* Tuple.findByPosition(
          System.IS_CHECKED,
          0,
          childNodeId,
        );
        expect(isCheckedTuples.length).toBe(0);

        // Verify: text content preserved
        yield* Then.NODE_HAS_TEXT(childNodeId, "Completed task");
      }).pipe(runtime.runPromise);
    });

    it("replaces bullet (LIST_ELEMENT) with unchecked checkbox", async () => {
      await Effect.gen(function* () {
        const Type = yield* TypeT;
        const Tuple = yield* TupleT;

        // Setup: buffer with a child node that has LIST_ELEMENT type
        const { bufferId, childNodeIds } = yield* Given.A_BUFFER_WITH_CHILDREN(
          "Root node",
          [{ text: "Bullet item" }],
        );
        const childNodeId = childNodeIds[0];
        const childBlockId = Id.makeBlockId(bufferId, childNodeId);

        // Add LIST_ELEMENT type (bullet)
        yield* Type.addType(childNodeId, System.LIST_ELEMENT);

        render(() => <EditorBuffer bufferId={bufferId} />);

        // Click the block to focus CodeMirror
        yield* When.USER_CLICKS_BLOCK(childBlockId);

        // Wait for CodeMirror to be focused
        yield* Effect.promise(() =>
          waitFor(
            () => {
              const cmEditor = document.querySelector(".cm-editor.cm-focused");
              if (!cmEditor) throw new Error("CodeMirror not focused");
            },
            { timeout: 2000 },
          ),
        );

        // Press Mod+Enter
        yield* When.USER_PRESSES("{Meta>}{Enter}{/Meta}");

        // Verify: node has CHECKBOX type
        yield* Effect.promise(() =>
          waitFor(
            async () => {
              const hasCheckbox = await Type.hasType(
                childNodeId,
                System.CHECKBOX,
              ).pipe(runtime.runPromise);
              expect(hasCheckbox).toBe(true);
            },
            { timeout: 2000 },
          ),
        );

        // Verify: node no longer has LIST_ELEMENT type
        const hasList = yield* Type.hasType(childNodeId, System.LIST_ELEMENT);
        expect(hasList).toBe(false);

        // Verify: IS_CHECKED tuple exists with FALSE value (unchecked)
        const isCheckedTuples = yield* Tuple.findByPosition(
          System.IS_CHECKED,
          0,
          childNodeId,
        );
        expect(isCheckedTuples.length).toBe(1);
        expect(isCheckedTuples[0]!.members[1]).toBe(System.FALSE);

        // Verify: text content preserved
        yield* Then.NODE_HAS_TEXT(childNodeId, "Bullet item");
      }).pipe(runtime.runPromise);
    });
  });

  describe("Block selection mode", () => {
    it("converts normal block to unchecked checkbox in block selection mode", async () => {
      await Effect.gen(function* () {
        const Type = yield* TypeT;
        const Tuple = yield* TupleT;

        // Setup: buffer with a normal block
        const { bufferId, childNodeIds } = yield* Given.A_BUFFER_WITH_CHILDREN(
          "Root node",
          [{ text: "Task item" }],
        );
        const childNodeId = childNodeIds[0];
        const childBlockId = Id.makeBlockId(bufferId, childNodeId);

        render(() => <EditorBuffer bufferId={bufferId} />);

        // Enter block selection mode (click then Escape)
        yield* When.USER_ENTERS_BLOCK_SELECTION(childBlockId);

        // Verify we're in block selection mode
        yield* Then.BLOCKS_ARE_SELECTED(bufferId, [childNodeId]);

        // Press Mod+Enter
        yield* When.USER_PRESSES("{Meta>}{Enter}{/Meta}");

        // Verify: node has CHECKBOX type
        yield* Effect.promise(() =>
          waitFor(
            async () => {
              const hasCheckbox = await Type.hasType(
                childNodeId,
                System.CHECKBOX,
              ).pipe(runtime.runPromise);
              expect(hasCheckbox).toBe(true);
            },
            { timeout: 2000 },
          ),
        );

        // Verify: IS_CHECKED tuple exists with FALSE value (unchecked)
        const isCheckedTuples = yield* Tuple.findByPosition(
          System.IS_CHECKED,
          0,
          childNodeId,
        );
        expect(isCheckedTuples.length).toBe(1);
        expect(isCheckedTuples[0]!.members[1]).toBe(System.FALSE);
      }).pipe(runtime.runPromise);
    });

    it("toggles multiple selected blocks independently", async () => {
      await Effect.gen(function* () {
        const Type = yield* TypeT;
        const Tuple = yield* TupleT;

        // Setup: buffer with three blocks in different checkbox states
        const { bufferId, childNodeIds } = yield* Given.A_BUFFER_WITH_CHILDREN(
          "Root node",
          [
            { text: "Normal block" }, // Will become unchecked
            { text: "Unchecked task" }, // Already unchecked, will become checked
            { text: "Checked task" }, // Already checked, will become normal
          ],
        );
        const [normalId, uncheckedId, checkedId] = childNodeIds;
        const normalBlockId = Id.makeBlockId(bufferId, normalId);

        // Set up initial states:
        // - First block: normal (no type)
        // - Second block: unchecked checkbox
        yield* Type.addType(uncheckedId, System.CHECKBOX);
        yield* Tuple.create(System.IS_CHECKED, [uncheckedId, System.FALSE]);
        // - Third block: checked checkbox
        yield* Type.addType(checkedId, System.CHECKBOX);
        yield* Tuple.create(System.IS_CHECKED, [checkedId, System.TRUE]);

        render(() => <EditorBuffer bufferId={bufferId} />);

        // Enter block selection mode on first block
        yield* When.USER_ENTERS_BLOCK_SELECTION(normalBlockId);

        // Extend selection to all three blocks with Shift+ArrowDown twice
        yield* When.USER_PRESSES("{Shift>}{ArrowDown}{/Shift}");
        yield* When.USER_PRESSES("{Shift>}{ArrowDown}{/Shift}");

        // Verify all three blocks are selected
        yield* Then.BLOCKS_ARE_SELECTED(bufferId, [
          normalId,
          uncheckedId,
          checkedId,
        ]);

        // Press Mod+Enter to toggle all
        yield* When.USER_PRESSES("{Meta>}{Enter}{/Meta}");

        // Verify each block cycled to its next state:
        // 1. Normal -> Unchecked checkbox
        yield* Effect.promise(() =>
          waitFor(
            async () => {
              const hasCheckbox = await Type.hasType(
                normalId,
                System.CHECKBOX,
              ).pipe(runtime.runPromise);
              expect(hasCheckbox).toBe(true);
            },
            { timeout: 2000 },
          ),
        );
        const normalTuples = yield* Tuple.findByPosition(
          System.IS_CHECKED,
          0,
          normalId,
        );
        expect(normalTuples.length).toBe(1);
        expect(normalTuples[0]!.members[1]).toBe(System.FALSE);

        // 2. Unchecked -> Checked
        const uncheckedTuples = yield* Tuple.findByPosition(
          System.IS_CHECKED,
          0,
          uncheckedId,
        );
        expect(uncheckedTuples.length).toBe(1);
        expect(uncheckedTuples[0]!.members[1]).toBe(System.TRUE);

        // 3. Checked -> Normal (no checkbox type, no tuple)
        const hasCheckedCheckbox = yield* Type.hasType(
          checkedId,
          System.CHECKBOX,
        );
        expect(hasCheckedCheckbox).toBe(false);
        const checkedTuples = yield* Tuple.findByPosition(
          System.IS_CHECKED,
          0,
          checkedId,
        );
        expect(checkedTuples.length).toBe(0);
      }).pipe(runtime.runPromise);
    });

    it("cycles through states: normal -> unchecked -> checked -> normal", async () => {
      await Effect.gen(function* () {
        const Type = yield* TypeT;
        const Tuple = yield* TupleT;

        // Setup: buffer with a normal block
        const { bufferId, childNodeIds } = yield* Given.A_BUFFER_WITH_CHILDREN(
          "Root node",
          [{ text: "Cycle test" }],
        );
        const childNodeId = childNodeIds[0];
        const childBlockId = Id.makeBlockId(bufferId, childNodeId);

        render(() => <EditorBuffer bufferId={bufferId} />);

        // Enter block selection mode
        yield* When.USER_ENTERS_BLOCK_SELECTION(childBlockId);

        // Initial state: no checkbox type
        const hasCheckbox = yield* Type.hasType(childNodeId, System.CHECKBOX);
        expect(hasCheckbox).toBe(false);

        // First toggle: normal -> unchecked checkbox
        yield* When.USER_PRESSES("{Meta>}{Enter}{/Meta}");
        yield* Effect.promise(() =>
          waitFor(
            async () => {
              const has = await Type.hasType(childNodeId, System.CHECKBOX).pipe(
                runtime.runPromise,
              );
              expect(has).toBe(true);
            },
            { timeout: 2000 },
          ),
        );
        let tuples = yield* Tuple.findByPosition(
          System.IS_CHECKED,
          0,
          childNodeId,
        );
        expect(tuples[0]!.members[1]).toBe(System.FALSE);

        // Second toggle: unchecked -> checked
        yield* When.USER_PRESSES("{Meta>}{Enter}{/Meta}");
        yield* Effect.promise(() =>
          waitFor(
            async () => {
              const t = await Tuple.findByPosition(
                System.IS_CHECKED,
                0,
                childNodeId,
              ).pipe(runtime.runPromise);
              expect(t[0]!.members[1]).toBe(System.TRUE);
            },
            { timeout: 2000 },
          ),
        );

        // Third toggle: checked -> normal
        yield* When.USER_PRESSES("{Meta>}{Enter}{/Meta}");
        yield* Effect.promise(() =>
          waitFor(
            async () => {
              const has = await Type.hasType(childNodeId, System.CHECKBOX).pipe(
                runtime.runPromise,
              );
              expect(has).toBe(false);
            },
            { timeout: 2000 },
          ),
        );
        tuples = yield* Tuple.findByPosition(
          System.IS_CHECKED,
          0,
          childNodeId,
        );
        expect(tuples.length).toBe(0);
      }).pipe(runtime.runPromise);
    });
  });

  describe("Edge cases", () => {
    it("preserves user-defined types when toggling checkbox", async () => {
      await Effect.gen(function* () {
        const Type = yield* TypeT;

        // Setup: buffer with a block that has a user-defined type
        const { bufferId, childNodeIds } = yield* Given.A_BUFFER_WITH_CHILDREN(
          "Root node",
          [{ text: "Important task" }],
        );
        const childNodeId = childNodeIds[0];
        const childBlockId = Id.makeBlockId(bufferId, childNodeId);

        // Create a user type (simulate by adding any non-system type)
        const userTypeResult = yield* Given.A_TYPE_WITHOUT_COLOR();
        yield* Type.addType(childNodeId, userTypeResult.typeId);

        render(() => <EditorBuffer bufferId={bufferId} />);

        // Enter block selection mode
        yield* When.USER_ENTERS_BLOCK_SELECTION(childBlockId);

        // Toggle to checkbox
        yield* When.USER_PRESSES("{Meta>}{Enter}{/Meta}");

        // Verify: CHECKBOX type added
        yield* Effect.promise(() =>
          waitFor(
            async () => {
              const hasCheckbox = await Type.hasType(
                childNodeId,
                System.CHECKBOX,
              ).pipe(runtime.runPromise);
              expect(hasCheckbox).toBe(true);
            },
            { timeout: 2000 },
          ),
        );

        // Verify: user-defined type preserved
        const hasUserType = yield* Type.hasType(
          childNodeId,
          userTypeResult.typeId,
        );
        expect(hasUserType).toBe(true);

        // Toggle through states back to normal
        yield* When.USER_PRESSES("{Meta>}{Enter}{/Meta}"); // unchecked -> checked
        yield* When.USER_PRESSES("{Meta>}{Enter}{/Meta}"); // checked -> normal

        // Verify: CHECKBOX removed but user type still present
        yield* Effect.promise(() =>
          waitFor(
            async () => {
              const hasCheckbox = await Type.hasType(
                childNodeId,
                System.CHECKBOX,
              ).pipe(runtime.runPromise);
              expect(hasCheckbox).toBe(false);
            },
            { timeout: 2000 },
          ),
        );
        const stillHasUserType = yield* Type.hasType(
          childNodeId,
          userTypeResult.typeId,
        );
        expect(stillHasUserType).toBe(true);
      }).pipe(runtime.runPromise);
    });

    it("handles block with existing IS_CHECKED tuple but no CHECKBOX type gracefully", async () => {
      await Effect.gen(function* () {
        const Type = yield* TypeT;
        const Tuple = yield* TupleT;

        // Setup: unusual state - IS_CHECKED tuple exists but no CHECKBOX type
        // This could happen from data migration or manual manipulation
        const { bufferId, childNodeIds } = yield* Given.A_BUFFER_WITH_CHILDREN(
          "Root node",
          [{ text: "Orphaned tuple" }],
        );
        const childNodeId = childNodeIds[0];
        const childBlockId = Id.makeBlockId(bufferId, childNodeId);

        // Create orphaned IS_CHECKED tuple without CHECKBOX type
        yield* Tuple.create(System.IS_CHECKED, [childNodeId, System.TRUE]);

        render(() => <EditorBuffer bufferId={bufferId} />);

        // Enter block selection mode
        yield* When.USER_ENTERS_BLOCK_SELECTION(childBlockId);

        // Toggle - should treat as normal block and add CHECKBOX + new tuple
        yield* When.USER_PRESSES("{Meta>}{Enter}{/Meta}");

        // Verify: CHECKBOX type added
        yield* Effect.promise(() =>
          waitFor(
            async () => {
              const hasCheckbox = await Type.hasType(
                childNodeId,
                System.CHECKBOX,
              ).pipe(runtime.runPromise);
              expect(hasCheckbox).toBe(true);
            },
            { timeout: 2000 },
          ),
        );

        // Behavior depends on implementation - either:
        // 1. Clean up orphaned tuple and create new FALSE tuple, OR
        // 2. Use existing tuple value
        // Test verifies the operation completes without error
        const tuples = yield* Tuple.findByPosition(
          System.IS_CHECKED,
          0,
          childNodeId,
        );
        expect(tuples.length).toBeGreaterThanOrEqual(1);
      }).pipe(runtime.runPromise);
    });
  });
});
