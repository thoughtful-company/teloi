import "@/index.css";
import { Id, System } from "@/schema";
import { TupleT } from "@/services/domain/Tuple";
import { TypeT } from "@/services/domain/Type";
import { TypePickerT } from "@/services/ui/TypePicker";
import BufferView from "@/ui/BufferView";
import { Effect } from "effect";
import { waitFor } from "solid-testing-library";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  type BrowserRuntime,
  Given,
  setupClientTest,
  Then,
  When,
} from "@/test-utils/bdd";

describe("Type Trigger Replacement", () => {
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

  describe("List to checkbox conversion", () => {
    it("replaces list type with checkbox when user types [ ] at start", async () => {
      await Effect.gen(function* () {
        const Type = yield* TypeT;

        // Setup: buffer with a child node that has list-element type
        const { bufferId, childNodeIds } = yield* Given.A_BUFFER_WITH_CHILDREN(
          "Root node",
          [{ text: "Buy groceries" }],
        );
        const childNodeId = childNodeIds[0];
        const childBlockId = Id.makeBufferBlockId(bufferId, childNodeId);

        // Add list-element type to the node
        yield* Type.addType(childNodeId, System.LIST_ELEMENT);

        render(() => <BufferView bufferId={bufferId} />);

        // Wait for list decoration to appear
        yield* Effect.promise(() =>
          waitFor(
            () => {
              const block = document.querySelector(
                `[data-element-id="${childBlockId}"]`,
              );
              expect(block).toBeTruthy();
            },
            { timeout: 2000 },
          ),
        );

        // Click the block and move to start
        yield* Given.BLOCK_IS_FOCUSED_AT(childBlockId, 0);

        // Type "[ ]" then space separately (space is the trigger)
        // Note: [[ escapes to [, but ] is typed literally
        yield* When.USER_PRESSES("[[ ]");
        yield* When.USER_PRESSES(" ");

        // Verify: node has checkbox type
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

        // Verify: node no longer has list type
        const hasList = yield* Type.hasType(childNodeId, System.LIST_ELEMENT);
        expect(hasList).toBe(false);

        // Verify: text content preserved
        yield* Then.NODE_HAS_TEXT(childNodeId, "Buy groceries");
      }).pipe(runtime.runPromise);
    });
  });

  describe("Checkbox to list conversion", () => {
    it("replaces checkbox type with list when user types - at start and removes IS_CHECKED tuple", async () => {
      await Effect.gen(function* () {
        const Type = yield* TypeT;
        const Tuple = yield* TupleT;

        // Setup: buffer with a child node that has checkbox type (checked)
        const { bufferId, childNodeIds } = yield* Given.A_BUFFER_WITH_CHILDREN(
          "Root node",
          [{ text: "Task done" }],
        );
        const childNodeId = childNodeIds[0];
        const childBlockId = Id.makeBufferBlockId(bufferId, childNodeId);

        // Add checkbox type and IS_CHECKED tuple to the node
        yield* Type.addType(childNodeId, System.CHECKBOX);
        yield* Tuple.create(System.IS_CHECKED, [childNodeId, System.TRUE]);

        render(() => <BufferView bufferId={bufferId} />);

        // Wait for checkbox decoration to appear
        yield* Effect.promise(() =>
          waitFor(
            () => {
              const block = document.querySelector(
                `[data-element-id="${childBlockId}"]`,
              );
              expect(block).toBeTruthy();
            },
            { timeout: 2000 },
          ),
        );

        // Click the block and move to start
        yield* Given.BLOCK_IS_FOCUSED_AT(childBlockId, 0);

        // Type "-" then space separately (space is the trigger)
        yield* When.USER_PRESSES("-");
        yield* When.USER_PRESSES(" ");

        // Verify: node has list type
        yield* Effect.promise(() =>
          waitFor(
            async () => {
              const hasList = await Type.hasType(
                childNodeId,
                System.LIST_ELEMENT,
              ).pipe(runtime.runPromise);
              expect(hasList).toBe(true);
            },
            { timeout: 2000 },
          ),
        );

        // Verify: node no longer has checkbox type
        const hasCheckbox = yield* Type.hasType(childNodeId, System.CHECKBOX);
        expect(hasCheckbox).toBe(false);

        // Verify: IS_CHECKED tuple removed
        const isCheckedTuples = yield* Tuple.findByPosition(
          System.IS_CHECKED,
          0,
          childNodeId,
        );
        expect(isCheckedTuples.length).toBe(0);

        // Verify: text content preserved
        yield* Then.NODE_HAS_TEXT(childNodeId, "Task done");
      }).pipe(runtime.runPromise);
    });
  });

  describe("Same-type trigger inserts literal text", () => {
    it("inserts '- ' literally when list node triggers list", async () => {
      await Effect.gen(function* () {
        const Type = yield* TypeT;

        // Setup: buffer with a child node that has list-element type
        const { bufferId, childNodeIds } = yield* Given.A_BUFFER_WITH_CHILDREN(
          "Root node",
          [{ text: "Item" }],
        );
        const childNodeId = childNodeIds[0];
        const childBlockId = Id.makeBufferBlockId(bufferId, childNodeId);

        // Add list-element type to the node
        yield* Type.addType(childNodeId, System.LIST_ELEMENT);

        render(() => <BufferView bufferId={bufferId} />);

        // Wait for block to appear
        yield* Effect.promise(() =>
          waitFor(
            () => {
              const block = document.querySelector(
                `[data-element-id="${childBlockId}"]`,
              );
              expect(block).toBeTruthy();
            },
            { timeout: 2000 },
          ),
        );

        // Click the block and move to start
        yield* Given.BLOCK_IS_FOCUSED_AT(childBlockId, 0);

        // Type "-" then space - should insert literally since node already has list type
        yield* When.USER_PRESSES("-");
        yield* When.USER_PRESSES(" ");

        // Verify: node still has list type
        const hasList = yield* Type.hasType(childNodeId, System.LIST_ELEMENT);
        expect(hasList).toBe(true);

        // Verify: "- " text was inserted (trigger not consumed)
        yield* Then.NODE_HAS_TEXT(childNodeId, "- Item");
      }).pipe(runtime.runPromise);
    });

    it("inserts '[ ]' literally when checkbox node triggers checkbox", async () => {
      await Effect.gen(function* () {
        const Type = yield* TypeT;

        // Setup: buffer with a child node that has checkbox type
        const { bufferId, childNodeIds } = yield* Given.A_BUFFER_WITH_CHILDREN(
          "Root node",
          [{ text: "Task" }],
        );
        const childNodeId = childNodeIds[0];
        const childBlockId = Id.makeBufferBlockId(bufferId, childNodeId);

        // Add checkbox type to the node
        yield* Type.addType(childNodeId, System.CHECKBOX);

        render(() => <BufferView bufferId={bufferId} />);

        // Wait for block to appear
        yield* Effect.promise(() =>
          waitFor(
            () => {
              const block = document.querySelector(
                `[data-element-id="${childBlockId}"]`,
              );
              expect(block).toBeTruthy();
            },
            { timeout: 2000 },
          ),
        );

        // Click the block and move to start
        yield* Given.BLOCK_IS_FOCUSED_AT(childBlockId, 0);

        // Type "[ ]" then space - should insert literally since node already has checkbox type
        // Note: [[ escapes to [, but ] is typed literally
        yield* When.USER_PRESSES("[[ ]");
        yield* When.USER_PRESSES(" ");

        // Verify: node still has checkbox type
        const hasCheckbox = yield* Type.hasType(childNodeId, System.CHECKBOX);
        expect(hasCheckbox).toBe(true);

        // Verify: "[ ] " text was inserted (trigger not consumed)
        yield* Then.NODE_HAS_TEXT(childNodeId, "[ ] Task");
      }).pipe(runtime.runPromise);
    });
  });

  describe("User types preserved during replacement", () => {
    it("preserves user-defined types when converting list to checkbox", async () => {
      await Effect.gen(function* () {
        const Type = yield* TypeT;
        const TypePicker = yield* TypePickerT;

        // Setup: buffer with a child node that has list-element type
        const { bufferId, childNodeIds } = yield* Given.A_BUFFER_WITH_CHILDREN(
          "Root node",
          [{ text: "Important task" }],
        );
        const childNodeId = childNodeIds[0];
        const childBlockId = Id.makeBufferBlockId(bufferId, childNodeId);

        // Add list-element type to the node
        yield* Type.addType(childNodeId, System.LIST_ELEMENT);

        // Create and apply a user-defined type
        const projectTypeId = yield* TypePicker.createType("project");
        yield* TypePicker.applyType(childNodeId, projectTypeId);

        render(() => <BufferView bufferId={bufferId} />);

        // Wait for block to appear
        yield* Effect.promise(() =>
          waitFor(
            () => {
              const block = document.querySelector(
                `[data-element-id="${childBlockId}"]`,
              );
              expect(block).toBeTruthy();
            },
            { timeout: 2000 },
          ),
        );

        // Click the block and move to start
        yield* Given.BLOCK_IS_FOCUSED_AT(childBlockId, 0);

        // Type "[ ]" then space to trigger checkbox replacement
        // Note: [[ escapes to [, but ] is typed literally
        yield* When.USER_PRESSES("[[ ]");
        yield* When.USER_PRESSES(" ");

        // Verify: node has checkbox type
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

        // Verify: node no longer has list type
        const hasList = yield* Type.hasType(childNodeId, System.LIST_ELEMENT);
        expect(hasList).toBe(false);

        // Verify: user-defined type is preserved
        const hasProjectType = yield* Type.hasType(childNodeId, projectTypeId);
        expect(hasProjectType).toBe(true);

        // Verify: text content preserved
        yield* Then.NODE_HAS_TEXT(childNodeId, "Important task");
      }).pipe(runtime.runPromise);
    });
  });

  describe("[x] on list creates checked checkbox", () => {
    it("replaces list with checked checkbox when user types [x] at start", async () => {
      await Effect.gen(function* () {
        const Type = yield* TypeT;
        const Tuple = yield* TupleT;

        // Setup: buffer with a child node that has list-element type
        const { bufferId, childNodeIds } = yield* Given.A_BUFFER_WITH_CHILDREN(
          "Root node",
          [{ text: "Completed task" }],
        );
        const childNodeId = childNodeIds[0];
        const childBlockId = Id.makeBufferBlockId(bufferId, childNodeId);

        // Add list-element type to the node
        yield* Type.addType(childNodeId, System.LIST_ELEMENT);

        render(() => <BufferView bufferId={bufferId} />);

        // Wait for block to appear
        yield* Effect.promise(() =>
          waitFor(
            () => {
              const block = document.querySelector(
                `[data-element-id="${childBlockId}"]`,
              );
              expect(block).toBeTruthy();
            },
            { timeout: 2000 },
          ),
        );

        // Click the block and move to start
        yield* Given.BLOCK_IS_FOCUSED_AT(childBlockId, 0);

        // Type "[x]" then space separately (space is the trigger)
        // Note: [[ escapes to [, but ] is typed literally
        yield* When.USER_PRESSES("[[x]");
        yield* When.USER_PRESSES(" ");

        // Verify: node has checkbox type
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

        // Verify: node no longer has list type
        const hasList = yield* Type.hasType(childNodeId, System.LIST_ELEMENT);
        expect(hasList).toBe(false);

        // Verify: IS_CHECKED tuple exists (checkbox is checked)
        const isCheckedTuples = yield* Tuple.findByPosition(
          System.IS_CHECKED,
          0,
          childNodeId,
        );
        expect(isCheckedTuples.length).toBe(1);
        expect(isCheckedTuples[0]!.members[1]).toBe(System.TRUE);

        // Verify: text content preserved
        yield* Then.NODE_HAS_TEXT(childNodeId, "Completed task");
      }).pipe(runtime.runPromise);
    });
  });
});
