import "@/index.css";
import { events } from "@/livestore/schema";
import { Id, System } from "@/schema";
import { TupleT } from "@/services/domain/Tuple";
import { StoreT } from "@/services/external/Store";
import { AutomergeT } from "@/services/external/Automerge";
import { PropertyT } from "@/services/ui/Property";
import { ViewT } from "@/services/ui/View";
import PropertySection from "@/ui/PropertySection";
import { userEvent } from "@vitest/browser/context";
import { Effect } from "effect";
import { nanoid } from "nanoid";
import { waitFor } from "solid-testing-library";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { Given, setupClientTest, type BrowserRuntime } from "./bdd";

/**
 * PropertySection Linked Blocks Tests
 *
 * Tests for rendering linked blocks as full Block components in PropertySection:
 * - Block components with property block IDs
 * - Navigation between property name and linked blocks
 * - Creating new linked blocks
 * - Keyboard navigation within linked blocks area
 *
 * IMPLEMENTATION REQUIREMENT: These tests expect PropertySection to accept
 * a `bufferId` prop in addition to the existing `propertyId` and `pageId` props.
 * The bufferId is needed to generate proper property block IDs for linked blocks.
 */

/**
 * Extended props interface that includes bufferId.
 * The implementation needs to add this prop to PropertySectionProps.
 */
interface PropertySectionPropsWithBuffer {
  propertyId: Id.Node;
  pageId: Id.Node;
  bufferId: Id.Buffer;
}

/**
 * Store bufferId in module scope for tests that need it for ID generation.
 * This is used by the test's section ID helper function.
 */
let testBufferId: Id.Buffer | null = null;

/** Get the bufferId set by renderPropertySection */
export const getTestBufferId = () => testBufferId;

/**
 * Render helper that passes bufferId to PropertySection.
 * Also stores bufferId for test assertions.
 */
const renderPropertySection = (props: PropertySectionPropsWithBuffer) => {
  testBufferId = props.bufferId;
  return <PropertySection {...props} />;
};

describe("PropertySection Linked Blocks", () => {
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

  /** Creates a tuple type node for testing linked blocks */
  const createTupleType = (name: string) =>
    Effect.gen(function* () {
      const Store = yield* StoreT;
      const Automerge = yield* AutomergeT;
      const tupleTypeId = Id.Node.make(nanoid());

      // Create node as shadow child of SCHEMA
      yield* Store.commit(
        events.nodeCreated({
          timestamp: Date.now(),
          data: { nodeId: tupleTypeId, parentId: System.SCHEMA, position: "" },
        }),
      );
      yield* Store.commit(
        events.nodeMoved({
          timestamp: Date.now(),
          data: {
            nodeId: tupleTypeId,
            newParentId: System.SCHEMA,
            position: "",
            inShadow: true,
          },
        }),
      );

      // Set title
      yield* Automerge.setText(tupleTypeId, name);

      return tupleTypeId;
    });

  /** Creates a linked node with text */
  const createLinkedNode = (text: string) =>
    Effect.gen(function* () {
      const Store = yield* StoreT;
      const Automerge = yield* AutomergeT;
      const nodeId = Id.Node.make(nanoid());

      yield* Store.commit(
        events.nodeCreated({
          timestamp: Date.now(),
          data: { nodeId },
        }),
      );

      yield* Automerge.setText(nodeId, text);
      return nodeId;
    });

  /** Sets up a property bound to a tuple type with optional linked blocks */
  const setupBoundProperty = (
    pageId: Id.Node,
    propertyName: string,
    linkedBlockTexts: string[] = [],
  ) =>
    Effect.gen(function* () {
      const Property = yield* PropertyT;
      const View = yield* ViewT;
      const Tuple = yield* TupleT;
      const Automerge = yield* AutomergeT;

      const viewId = yield* View.getOrCreateView(pageId);
      const propertyId = yield* Property.createProperty(viewId);
      yield* Automerge.setText(propertyId, propertyName);

      // Create tuple type and bind
      const tupleTypeId = yield* createTupleType(`${propertyName}_Tuple`);
      yield* Property.bindToTupleType(propertyId, tupleTypeId, 0, 1);

      // Create linked nodes and tuples
      const linkedNodeIds: Id.Node[] = [];
      const tupleIds: Id.Tuple[] = [];
      for (const text of linkedBlockTexts) {
        const linkedNodeId = yield* createLinkedNode(text);
        const tupleId = yield* Tuple.create(tupleTypeId, [
          pageId,
          linkedNodeId,
        ]);
        linkedNodeIds.push(linkedNodeId);
        tupleIds.push(tupleId);
      }

      return { propertyId, viewId, tupleTypeId, linkedNodeIds, tupleIds };
    });

  describe("Block renders with property block ID", () => {
    it("renders linked blocks with data-element-type='block' attribute", async () => {
      await Effect.gen(function* () {
        const { rootNodeId: pageId, bufferId } =
          yield* Given.A_BUFFER_WITH_CHILDREN("Test Page", []);

        const { propertyId } = yield* setupBoundProperty(
          pageId,
          "Related Items",
          ["First Linked Block"],
        );

        render(() => renderPropertySection({ propertyId, pageId, bufferId }));

        // Wait for linked blocks to render as Block components
        yield* Effect.promise(() =>
          waitFor(
            () => {
              const linkedBlocksArea = document.querySelector(
                "[data-testid='linked-blocks']",
              );
              expect(linkedBlocksArea).toBeTruthy();

              // Should contain a Block component with data-element-type="block"
              const blockElements = linkedBlocksArea!.querySelectorAll(
                "[data-element-type='block']",
              );
              expect(blockElements.length).toBe(1);
            },
            { timeout: 2000 },
          ),
        );
      }).pipe(runtime.runPromise);
    });

    it("renders linked block with property block ID format", async () => {
      await Effect.gen(function* () {
        const { rootNodeId: pageId, bufferId } =
          yield* Given.A_BUFFER_WITH_CHILDREN("Test Page", []);

        const { propertyId, tupleIds } = yield* setupBoundProperty(
          pageId,
          "Tasks",
          ["Important Task"],
        );

        render(() => renderPropertySection({ propertyId, pageId, bufferId }));

        const expectedBlockId = Id.makePropertyBlockId(
          bufferId,
          pageId,
          propertyId,
          tupleIds[0]!,
        );

        // Verify the block has the correct property block ID
        yield* Effect.promise(() =>
          waitFor(
            () => {
              const blockElement = document.querySelector(
                `[data-element-id="${expectedBlockId}"]`,
              );
              expect(blockElement).toBeTruthy();
              expect(blockElement?.getAttribute("data-element-type")).toBe(
                "block",
              );
            },
            { timeout: 2000 },
          ),
        );
      }).pipe(runtime.runPromise);
    });
  });

  describe("Ghost block for empty bound property", () => {
    it("shows ghost block when property is bound but has no linked blocks", async () => {
      await Effect.gen(function* () {
        const { rootNodeId: pageId, bufferId } =
          yield* Given.A_BUFFER_WITH_CHILDREN("Test Page", []);

        // Bound property with NO linked blocks
        const { propertyId } = yield* setupBoundProperty(
          pageId,
          "Empty Property",
          [], // No linked blocks
        );

        render(() => renderPropertySection({ propertyId, pageId, bufferId }));

        // Ghost block should appear with placeholder
        yield* Effect.promise(() =>
          waitFor(
            () => {
              const ghostBlock = document.querySelector(
                "[data-testid='ghost-block']",
              );
              expect(ghostBlock).toBeTruthy();
            },
            { timeout: 2000 },
          ),
        );
      }).pipe(runtime.runPromise);
    });

    it("clicking ghost block focuses editor but does NOT create linked block", async () => {
      await Effect.gen(function* () {
        const Property = yield* PropertyT;

        const { rootNodeId: pageId, bufferId } =
          yield* Given.A_BUFFER_WITH_CHILDREN("Test Page", []);

        const { propertyId } = yield* setupBoundProperty(
          pageId,
          "Empty Property",
          [],
        );

        render(() => renderPropertySection({ propertyId, pageId, bufferId }));

        // Click the ghost block
        yield* Effect.promise(() =>
          waitFor(
            async () => {
              const ghostBlock = document.querySelector(
                "[data-testid='ghost-block']",
              );
              expect(ghostBlock).toBeTruthy();
              await userEvent.click(ghostBlock as HTMLElement);
            },
            { timeout: 2000 },
          ),
        );

        // Ghost block should show a focused CodeMirror editor
        yield* Effect.promise(() =>
          waitFor(
            () => {
              const ghostBlock = document.querySelector(
                "[data-testid='ghost-block']",
              );
              expect(ghostBlock).toBeTruthy();

              const focusedEditor = ghostBlock!.querySelector(
                ".cm-editor.cm-focused",
              );
              expect(focusedEditor).toBeTruthy();
            },
            { timeout: 2000 },
          ),
        );

        // No linked tuple should be created yet
        const linkedTuples = yield* Property.getLinkedTuples(
          propertyId,
          pageId,
        );
        expect(linkedTuples.length).toBe(0);
      }).pipe(runtime.runPromise);
    });

    it("typing in ghost block creates real linked block with typed content", async () => {
      await Effect.gen(function* () {
        const Property = yield* PropertyT;
        const Automerge = yield* AutomergeT;

        const { rootNodeId: pageId, bufferId } =
          yield* Given.A_BUFFER_WITH_CHILDREN("Test Page", []);

        const { propertyId } = yield* setupBoundProperty(pageId, "Tasks", []);

        render(() => renderPropertySection({ propertyId, pageId, bufferId }));

        // Before typing: no linked tuples
        const linkedTuplesBefore = yield* Property.getLinkedTuples(
          propertyId,
          pageId,
        );
        expect(linkedTuplesBefore.length).toBe(0);

        // Focus ghost block
        yield* Effect.promise(() =>
          waitFor(
            async () => {
              const ghostBlock = document.querySelector(
                "[data-testid='ghost-block']",
              );
              expect(ghostBlock).toBeTruthy();
              await userEvent.click(ghostBlock as HTMLElement);
            },
            { timeout: 2000 },
          ),
        );

        // Type in the ghost block
        yield* Effect.promise(() => userEvent.keyboard("New Task"));

        // Wait for materialization: ghost should be gone, replaced by real Block
        // (materialization is debounced to allow typing to complete)
        yield* Effect.promise(() =>
          waitFor(
            () => {
              const ghostBlock = document.querySelector(
                "[data-testid='ghost-block']",
              );
              expect(ghostBlock).toBeNull();

              const blockElements = document.querySelectorAll(
                "[data-testid='linked-blocks'] [data-element-type='block']",
              );
              expect(blockElements.length).toBe(1);
            },
            { timeout: 2000 },
          ),
        );

        // After materialization: exactly 1 linked tuple should exist
        const linkedTuplesAfter = yield* Property.getLinkedTuples(
          propertyId,
          pageId,
        );
        expect(linkedTuplesAfter.length).toBe(1);

        // The typed text should be preserved in the real block
        const displayNodeId = linkedTuplesAfter[0]!.displayNodeId;
        const nodeText = yield* Automerge.getText(displayNodeId);
        expect(nodeText).toBe("New Task");
      }).pipe(runtime.runPromise);
    });

    it("Escape in focused ghost blurs without creating linked block", async () => {
      await Effect.gen(function* () {
        const Property = yield* PropertyT;

        const { rootNodeId: pageId, bufferId } =
          yield* Given.A_BUFFER_WITH_CHILDREN("Test Page", []);

        const { propertyId } = yield* setupBoundProperty(pageId, "Tasks", []);

        render(() => renderPropertySection({ propertyId, pageId, bufferId }));

        // Focus ghost block
        yield* Effect.promise(() =>
          waitFor(
            async () => {
              const ghostBlock = document.querySelector(
                "[data-testid='ghost-block']",
              );
              expect(ghostBlock).toBeTruthy();
              await userEvent.click(ghostBlock as HTMLElement);
            },
            { timeout: 2000 },
          ),
        );

        // Verify ghost is focused
        yield* Effect.promise(() =>
          waitFor(
            () => {
              const ghostBlock = document.querySelector(
                "[data-testid='ghost-block']",
              );
              const focusedEditor = ghostBlock!.querySelector(
                ".cm-editor.cm-focused",
              );
              expect(focusedEditor).toBeTruthy();
            },
            { timeout: 2000 },
          ),
        );

        // Press Escape
        yield* Effect.promise(() => userEvent.keyboard("{Escape}"));

        // Ghost block should be unfocused (no focused editor)
        yield* Effect.promise(() =>
          waitFor(
            () => {
              const focusedEditor = document.querySelector(
                ".cm-editor.cm-focused",
              );
              expect(focusedEditor).toBeNull();
            },
            { timeout: 2000 },
          ),
        );

        // No linked tuple should have been created
        const linkedTuples = yield* Property.getLinkedTuples(
          propertyId,
          pageId,
        );
        expect(linkedTuples.length).toBe(0);
      }).pipe(runtime.runPromise);
    });

    it("ArrowUp in ghost navigates to property name", async () => {
      await Effect.gen(function* () {
        const { rootNodeId: pageId, bufferId } =
          yield* Given.A_BUFFER_WITH_CHILDREN("Test Page", []);

        const { propertyId } = yield* setupBoundProperty(pageId, "Tasks", []);

        render(() => renderPropertySection({ propertyId, pageId, bufferId }));

        // Focus ghost block
        yield* Effect.promise(() =>
          waitFor(
            async () => {
              const ghostBlock = document.querySelector(
                "[data-testid='ghost-block']",
              );
              expect(ghostBlock).toBeTruthy();
              await userEvent.click(ghostBlock as HTMLElement);
            },
            { timeout: 2000 },
          ),
        );

        // Verify ghost is focused
        yield* Effect.promise(() =>
          waitFor(
            () => {
              const ghostBlock = document.querySelector(
                "[data-testid='ghost-block']",
              );
              const focusedEditor = ghostBlock!.querySelector(
                ".cm-editor.cm-focused",
              );
              expect(focusedEditor).toBeTruthy();
            },
            { timeout: 2000 },
          ),
        );

        // Press ArrowUp
        yield* Effect.promise(() => userEvent.keyboard("{ArrowUp}"));

        // Property name editor should be focused
        yield* Effect.promise(() =>
          waitFor(
            () => {
              const propertyNameEditor = document.querySelector(
                ".property-name .cm-editor.cm-focused",
              );
              expect(propertyNameEditor).toBeTruthy();
            },
            { timeout: 2000 },
          ),
        );
      }).pipe(runtime.runPromise);
    });

    it("ArrowLeft in ghost navigates to property name", async () => {
      await Effect.gen(function* () {
        const { rootNodeId: pageId, bufferId } =
          yield* Given.A_BUFFER_WITH_CHILDREN("Test Page", []);

        const { propertyId } = yield* setupBoundProperty(pageId, "Tasks", []);

        render(() => renderPropertySection({ propertyId, pageId, bufferId }));

        // Focus ghost block
        yield* Effect.promise(() =>
          waitFor(
            async () => {
              const ghostBlock = document.querySelector(
                "[data-testid='ghost-block']",
              );
              expect(ghostBlock).toBeTruthy();
              await userEvent.click(ghostBlock as HTMLElement);
            },
            { timeout: 2000 },
          ),
        );

        // Verify ghost is focused
        yield* Effect.promise(() =>
          waitFor(
            () => {
              const ghostBlock = document.querySelector(
                "[data-testid='ghost-block']",
              );
              const focusedEditor = ghostBlock!.querySelector(
                ".cm-editor.cm-focused",
              );
              expect(focusedEditor).toBeTruthy();
            },
            { timeout: 2000 },
          ),
        );

        // Press ArrowLeft (at start of empty ghost, should navigate)
        yield* Effect.promise(() => userEvent.keyboard("{ArrowLeft}"));

        // Property name editor should be focused
        yield* Effect.promise(() =>
          waitFor(
            () => {
              const propertyNameEditor = document.querySelector(
                ".property-name .cm-editor.cm-focused",
              );
              expect(propertyNameEditor).toBeTruthy();
            },
            { timeout: 2000 },
          ),
        );
      }).pipe(runtime.runPromise);
    });

    it("Tab in ghost is a no-op (stays focused)", async () => {
      await Effect.gen(function* () {
        const { rootNodeId: pageId, bufferId } =
          yield* Given.A_BUFFER_WITH_CHILDREN("Test Page", []);

        const { propertyId } = yield* setupBoundProperty(pageId, "Tasks", []);

        render(() => renderPropertySection({ propertyId, pageId, bufferId }));

        // Focus ghost block
        yield* Effect.promise(() =>
          waitFor(
            async () => {
              const ghostBlock = document.querySelector(
                "[data-testid='ghost-block']",
              );
              expect(ghostBlock).toBeTruthy();
              await userEvent.click(ghostBlock as HTMLElement);
            },
            { timeout: 2000 },
          ),
        );

        // Verify ghost is focused
        yield* Effect.promise(() =>
          waitFor(
            () => {
              const ghostBlock = document.querySelector(
                "[data-testid='ghost-block']",
              );
              const focusedEditor = ghostBlock!.querySelector(
                ".cm-editor.cm-focused",
              );
              expect(focusedEditor).toBeTruthy();
            },
            { timeout: 2000 },
          ),
        );

        // Press Tab
        yield* Effect.promise(() => userEvent.keyboard("{Tab}"));

        // Ghost should still be focused (Tab is a no-op)
        yield* Effect.promise(() =>
          waitFor(
            () => {
              const ghostBlock = document.querySelector(
                "[data-testid='ghost-block']",
              );
              const focusedEditor = ghostBlock!.querySelector(
                ".cm-editor.cm-focused",
              );
              expect(focusedEditor).toBeTruthy();
            },
            { timeout: 2000 },
          ),
        );
      }).pipe(runtime.runPromise);
    });

    it("ShiftTab in ghost is a no-op (stays focused)", async () => {
      await Effect.gen(function* () {
        const { rootNodeId: pageId, bufferId } =
          yield* Given.A_BUFFER_WITH_CHILDREN("Test Page", []);

        const { propertyId } = yield* setupBoundProperty(pageId, "Tasks", []);

        render(() => renderPropertySection({ propertyId, pageId, bufferId }));

        // Focus ghost block
        yield* Effect.promise(() =>
          waitFor(
            async () => {
              const ghostBlock = document.querySelector(
                "[data-testid='ghost-block']",
              );
              expect(ghostBlock).toBeTruthy();
              await userEvent.click(ghostBlock as HTMLElement);
            },
            { timeout: 2000 },
          ),
        );

        // Verify ghost is focused
        yield* Effect.promise(() =>
          waitFor(
            () => {
              const ghostBlock = document.querySelector(
                "[data-testid='ghost-block']",
              );
              const focusedEditor = ghostBlock!.querySelector(
                ".cm-editor.cm-focused",
              );
              expect(focusedEditor).toBeTruthy();
            },
            { timeout: 2000 },
          ),
        );

        // Press Shift+Tab
        yield* Effect.promise(() =>
          userEvent.keyboard("{Shift>}{Tab}{/Shift}"),
        );

        // Ghost should still be focused (ShiftTab is a no-op)
        yield* Effect.promise(() =>
          waitFor(
            () => {
              const ghostBlock = document.querySelector(
                "[data-testid='ghost-block']",
              );
              const focusedEditor = ghostBlock!.querySelector(
                ".cm-editor.cm-focused",
              );
              expect(focusedEditor).toBeTruthy();
            },
            { timeout: 2000 },
          ),
        );
      }).pipe(runtime.runPromise);
    });
  });

  describe("Navigation from property name to linked blocks", () => {
    it("ArrowRight at end of property name focuses first linked block", async () => {
      await Effect.gen(function* () {
        const { rootNodeId: pageId, bufferId } =
          yield* Given.A_BUFFER_WITH_CHILDREN("Test Page", []);

        const { propertyId, tupleIds } = yield* setupBoundProperty(
          pageId,
          "Related",
          ["First Link"],
        );

        render(() => renderPropertySection({ propertyId, pageId, bufferId }));

        // Click property name to focus it
        yield* Effect.promise(() =>
          waitFor(
            async () => {
              const propertyName = document.querySelector(".property-name");
              expect(propertyName).toBeTruthy();
              await userEvent.click(propertyName as HTMLElement);
            },
            { timeout: 2000 },
          ),
        );

        // Wait for editor to be focused
        yield* Effect.promise(() =>
          waitFor(
            () => {
              const focusedEditor = document.querySelector(
                ".cm-editor.cm-focused",
              );
              expect(focusedEditor).toBeTruthy();
            },
            { timeout: 2000 },
          ),
        );

        // Move cursor to end and press ArrowRight
        yield* Effect.promise(() => userEvent.keyboard("{End}{ArrowRight}"));

        // First linked block should now be focused
        const firstBlockId = Id.makePropertyBlockId(
          bufferId,
          pageId,
          propertyId,
          tupleIds[0]!,
        );

        yield* Effect.promise(() =>
          waitFor(
            () => {
              // The linked block's editor should be focused
              const linkedBlockEl = document.querySelector(
                `[data-element-id="${firstBlockId}"] .cm-editor.cm-focused`,
              );
              expect(linkedBlockEl).toBeTruthy();
            },
            { timeout: 2000 },
          ),
        );
      }).pipe(runtime.runPromise);
    });

    it("ArrowRight at end focuses ghost block when empty (does not create linked block)", async () => {
      await Effect.gen(function* () {
        const Property = yield* PropertyT;

        const { rootNodeId: pageId, bufferId } =
          yield* Given.A_BUFFER_WITH_CHILDREN("Test Page", []);

        const { propertyId } = yield* setupBoundProperty(
          pageId,
          "Empty",
          [], // No linked blocks
        );

        render(() => renderPropertySection({ propertyId, pageId, bufferId }));

        // Focus property name
        yield* Effect.promise(() =>
          waitFor(
            async () => {
              const propertyName = document.querySelector(".property-name");
              expect(propertyName).toBeTruthy();
              await userEvent.click(propertyName as HTMLElement);
            },
            { timeout: 2000 },
          ),
        );

        yield* Effect.promise(() => userEvent.keyboard("{End}{ArrowRight}"));

        // ArrowRight at end of empty bound property focuses the ghost block
        yield* Effect.promise(() =>
          waitFor(
            () => {
              // Ghost block editor should be focused
              const ghostBlock = document.querySelector(
                "[data-testid='ghost-block']",
              );
              expect(ghostBlock).toBeTruthy();

              const focusedEditor = ghostBlock!.querySelector(
                ".cm-editor.cm-focused",
              );
              expect(focusedEditor).toBeTruthy();
            },
            { timeout: 2000 },
          ),
        );

        // No linked block should be created yet
        const linkedTuples = yield* Property.getLinkedTuples(
          propertyId,
          pageId,
        );
        expect(linkedTuples.length).toBe(0);
      }).pipe(runtime.runPromise);
    });
  });

  describe("Arrow navigation between linked blocks", () => {
    it("ArrowDown from first linked block focuses second linked block", async () => {
      await Effect.gen(function* () {
        const { rootNodeId: pageId, bufferId } =
          yield* Given.A_BUFFER_WITH_CHILDREN("Test Page", []);

        const { propertyId, tupleIds } = yield* setupBoundProperty(
          pageId,
          "Items",
          ["First Item", "Second Item"],
        );

        render(() => renderPropertySection({ propertyId, pageId, bufferId }));

        const firstBlockId = Id.makePropertyBlockId(
          bufferId,
          pageId,
          propertyId,
          tupleIds[0]!,
        );
        const secondBlockId = Id.makePropertyBlockId(
          bufferId,
          pageId,
          propertyId,
          tupleIds[1]!,
        );

        // Click first linked block
        yield* Effect.promise(() =>
          waitFor(
            async () => {
              const firstBlock = document.querySelector(
                `[data-element-id="${firstBlockId}"]`,
              );
              expect(firstBlock).toBeTruthy();
              await userEvent.click(firstBlock as HTMLElement);
            },
            { timeout: 2000 },
          ),
        );

        // Press ArrowDown
        yield* Effect.promise(() => userEvent.keyboard("{ArrowDown}"));

        // Second block should be focused
        yield* Effect.promise(() =>
          waitFor(
            () => {
              const secondBlockEditor = document.querySelector(
                `[data-element-id="${secondBlockId}"] .cm-editor.cm-focused`,
              );
              expect(secondBlockEditor).toBeTruthy();
            },
            { timeout: 2000 },
          ),
        );
      }).pipe(runtime.runPromise);
    });

    it("ArrowUp from second linked block focuses first linked block", async () => {
      await Effect.gen(function* () {
        const { rootNodeId: pageId, bufferId } =
          yield* Given.A_BUFFER_WITH_CHILDREN("Test Page", []);

        const { propertyId, tupleIds } = yield* setupBoundProperty(
          pageId,
          "Items",
          ["First Item", "Second Item"],
        );

        render(() => renderPropertySection({ propertyId, pageId, bufferId }));

        const firstBlockId = Id.makePropertyBlockId(
          bufferId,
          pageId,
          propertyId,
          tupleIds[0]!,
        );
        const secondBlockId = Id.makePropertyBlockId(
          bufferId,
          pageId,
          propertyId,
          tupleIds[1]!,
        );

        // Click second linked block
        yield* Effect.promise(() =>
          waitFor(
            async () => {
              const secondBlock = document.querySelector(
                `[data-element-id="${secondBlockId}"]`,
              );
              expect(secondBlock).toBeTruthy();
              await userEvent.click(secondBlock as HTMLElement);
            },
            { timeout: 2000 },
          ),
        );

        // Press ArrowUp
        yield* Effect.promise(() => userEvent.keyboard("{ArrowUp}"));

        // First block should be focused
        yield* Effect.promise(() =>
          waitFor(
            () => {
              const firstBlockEditor = document.querySelector(
                `[data-element-id="${firstBlockId}"] .cm-editor.cm-focused`,
              );
              expect(firstBlockEditor).toBeTruthy();
            },
            { timeout: 2000 },
          ),
        );
      }).pipe(runtime.runPromise);
    });

    it("ArrowUp from first linked block focuses property name", async () => {
      await Effect.gen(function* () {
        const { rootNodeId: pageId, bufferId } =
          yield* Given.A_BUFFER_WITH_CHILDREN("Test Page", []);

        const { propertyId, tupleIds } = yield* setupBoundProperty(
          pageId,
          "Items",
          ["First Item"],
        );

        render(() => renderPropertySection({ propertyId, pageId, bufferId }));

        const firstBlockId = Id.makePropertyBlockId(
          bufferId,
          pageId,
          propertyId,
          tupleIds[0]!,
        );

        // Click first linked block
        yield* Effect.promise(() =>
          waitFor(
            async () => {
              const firstBlock = document.querySelector(
                `[data-element-id="${firstBlockId}"]`,
              );
              expect(firstBlock).toBeTruthy();
              await userEvent.click(firstBlock as HTMLElement);
            },
            { timeout: 2000 },
          ),
        );

        // Press ArrowUp
        yield* Effect.promise(() => userEvent.keyboard("{ArrowUp}"));

        // Property name editor should be focused
        yield* Effect.promise(() =>
          waitFor(
            () => {
              const propertyNameEditor = document.querySelector(
                ".property-name .cm-editor.cm-focused",
              );
              expect(propertyNameEditor).toBeTruthy();
            },
            { timeout: 2000 },
          ),
        );
      }).pipe(runtime.runPromise);
    });
  });

  describe("Enter in linked block creates new linked block", () => {
    it("Enter creates new linked block below current one", async () => {
      await Effect.gen(function* () {
        const Property = yield* PropertyT;

        const { rootNodeId: pageId, bufferId } =
          yield* Given.A_BUFFER_WITH_CHILDREN("Test Page", []);

        const { propertyId, tupleIds } = yield* setupBoundProperty(
          pageId,
          "Tasks",
          ["First Task"],
        );

        render(() => renderPropertySection({ propertyId, pageId, bufferId }));

        const firstBlockId = Id.makePropertyBlockId(
          bufferId,
          pageId,
          propertyId,
          tupleIds[0]!,
        );

        // Click first linked block
        yield* Effect.promise(() =>
          waitFor(
            async () => {
              const firstBlock = document.querySelector(
                `[data-element-id="${firstBlockId}"]`,
              );
              expect(firstBlock).toBeTruthy();
              await userEvent.click(firstBlock as HTMLElement);
            },
            { timeout: 2000 },
          ),
        );

        // Move to end and press Enter
        yield* Effect.promise(() => userEvent.keyboard("{End}{Enter}"));

        // Should now have two linked tuples
        const linkedTuples = yield* Property.getLinkedTuples(
          propertyId,
          pageId,
        );
        expect(linkedTuples.length).toBe(2);

        // DOM should reflect the new block
        yield* Effect.promise(() =>
          waitFor(
            () => {
              const blockElements = document.querySelectorAll(
                "[data-testid='linked-blocks'] [data-element-type='block']",
              );
              expect(blockElements.length).toBe(2);
            },
            { timeout: 2000 },
          ),
        );
      }).pipe(runtime.runPromise);
    });

    it("Enter focuses the new linked block", async () => {
      await Effect.gen(function* () {
        const { rootNodeId: pageId, bufferId } =
          yield* Given.A_BUFFER_WITH_CHILDREN("Test Page", []);

        const { propertyId, tupleIds } = yield* setupBoundProperty(
          pageId,
          "Tasks",
          ["First Task"],
        );

        render(() => renderPropertySection({ propertyId, pageId, bufferId }));

        const firstBlockId = Id.makePropertyBlockId(
          bufferId,
          pageId,
          propertyId,
          tupleIds[0]!,
        );

        // Click first linked block
        yield* Effect.promise(() =>
          waitFor(
            async () => {
              const firstBlock = document.querySelector(
                `[data-element-id="${firstBlockId}"]`,
              );
              expect(firstBlock).toBeTruthy();
              await userEvent.click(firstBlock as HTMLElement);
            },
            { timeout: 2000 },
          ),
        );

        yield* Effect.promise(() => userEvent.keyboard("{End}{Enter}"));

        // The NEW block's editor should be focused (not the original)
        yield* Effect.promise(() =>
          waitFor(
            () => {
              // Should have 2 blocks
              const blockElements = document.querySelectorAll(
                "[data-testid='linked-blocks'] [data-element-type='block']",
              );
              expect(blockElements.length).toBe(2);

              // The second one should have focused editor
              const focusedEditor = document.querySelector(
                "[data-testid='linked-blocks'] .cm-editor.cm-focused",
              );
              expect(focusedEditor).toBeTruthy();

              // The focused editor should NOT be in the first block
              const firstBlockFocused = document.querySelector(
                `[data-element-id="${firstBlockId}"] .cm-editor.cm-focused`,
              );
              expect(firstBlockFocused).toBeNull();
            },
            { timeout: 2000 },
          ),
        );
      }).pipe(runtime.runPromise);
    });
  });

  describe("Tab/ShiftTab are no-op in linked blocks", () => {
    it("Tab does not indent linked blocks", async () => {
      await Effect.gen(function* () {
        const { rootNodeId: pageId, bufferId } =
          yield* Given.A_BUFFER_WITH_CHILDREN("Test Page", []);

        const { propertyId, tupleIds } = yield* setupBoundProperty(
          pageId,
          "Items",
          ["First Item", "Second Item"],
        );

        render(() => renderPropertySection({ propertyId, pageId, bufferId }));

        const secondBlockId = Id.makePropertyBlockId(
          bufferId,
          pageId,
          propertyId,
          tupleIds[1]!,
        );

        // Click second linked block
        yield* Effect.promise(() =>
          waitFor(
            async () => {
              const secondBlock = document.querySelector(
                `[data-element-id="${secondBlockId}"]`,
              );
              expect(secondBlock).toBeTruthy();
              await userEvent.click(secondBlock as HTMLElement);
            },
            { timeout: 2000 },
          ),
        );

        // Press Tab
        yield* Effect.promise(() => userEvent.keyboard("{Tab}"));

        // Linked blocks remain flat (no nesting)
        yield* Effect.promise(() =>
          waitFor(
            () => {
              // All linked blocks should still be at the same level
              const linkedBlocksArea = document.querySelector(
                "[data-testid='linked-blocks']",
              );
              const nestedBlocks = linkedBlocksArea!.querySelectorAll(
                "[data-element-type='block'] [data-element-type='block']",
              );
              // No nested blocks
              expect(nestedBlocks.length).toBe(0);
            },
            { timeout: 2000 },
          ),
        );
      }).pipe(runtime.runPromise);
    });

    it("ShiftTab does not outdent linked blocks", async () => {
      await Effect.gen(function* () {
        const { rootNodeId: pageId, bufferId } =
          yield* Given.A_BUFFER_WITH_CHILDREN("Test Page", []);

        const { propertyId, tupleIds } = yield* setupBoundProperty(
          pageId,
          "Items",
          ["First Item"],
        );

        render(() => renderPropertySection({ propertyId, pageId, bufferId }));

        const firstBlockId = Id.makePropertyBlockId(
          bufferId,
          pageId,
          propertyId,
          tupleIds[0]!,
        );

        // Click first linked block
        yield* Effect.promise(() =>
          waitFor(
            async () => {
              const firstBlock = document.querySelector(
                `[data-element-id="${firstBlockId}"]`,
              );
              expect(firstBlock).toBeTruthy();
              await userEvent.click(firstBlock as HTMLElement);
            },
            { timeout: 2000 },
          ),
        );

        // Press Shift+Tab
        yield* Effect.promise(() =>
          userEvent.keyboard("{Shift>}{Tab}{/Shift}"),
        );

        // Block should still be in linked blocks area (not moved elsewhere)
        yield* Effect.promise(() =>
          waitFor(
            () => {
              const linkedBlocksArea = document.querySelector(
                "[data-testid='linked-blocks']",
              );
              const blockElements = linkedBlocksArea!.querySelectorAll(
                "[data-element-type='block']",
              );
              expect(blockElements.length).toBe(1);
            },
            { timeout: 2000 },
          ),
        );
      }).pipe(runtime.runPromise);
    });
  });

  describe("BackspaceAtStart navigation", () => {
    it("BackspaceAtStart in first linked block navigates to property name", async () => {
      await Effect.gen(function* () {
        const Automerge = yield* AutomergeT;

        const { rootNodeId: pageId, bufferId } =
          yield* Given.A_BUFFER_WITH_CHILDREN("Test Page", []);

        const { propertyId, linkedNodeIds, tupleIds } =
          yield* setupBoundProperty(pageId, "Items", ["First Item"]);

        render(() => renderPropertySection({ propertyId, pageId, bufferId }));

        const firstBlockId = Id.makePropertyBlockId(
          bufferId,
          pageId,
          propertyId,
          tupleIds[0]!,
        );

        // Click first linked block
        yield* Effect.promise(() =>
          waitFor(
            async () => {
              const firstBlock = document.querySelector(
                `[data-element-id="${firstBlockId}"]`,
              );
              expect(firstBlock).toBeTruthy();
              await userEvent.click(firstBlock as HTMLElement);
            },
            { timeout: 2000 },
          ),
        );

        // Move to start and press Backspace
        yield* Effect.promise(() => userEvent.keyboard("{Home}{Backspace}"));

        // Property name should be focused (NOT merged content)
        yield* Effect.promise(() =>
          waitFor(
            () => {
              const propertyNameEditor = document.querySelector(
                ".property-name .cm-editor.cm-focused",
              );
              expect(propertyNameEditor).toBeTruthy();
            },
            { timeout: 2000 },
          ),
        );

        // Linked block should still exist (not merged)
        const linkedBlockText = yield* Automerge.getText(linkedNodeIds[0]!);
        expect(linkedBlockText).toBe("First Item");
      }).pipe(runtime.runPromise);
    });

    it("BackspaceAtStart in second linked block navigates to first linked block", async () => {
      await Effect.gen(function* () {
        const Automerge = yield* AutomergeT;

        const { rootNodeId: pageId, bufferId } =
          yield* Given.A_BUFFER_WITH_CHILDREN("Test Page", []);

        const { propertyId, linkedNodeIds, tupleIds } =
          yield* setupBoundProperty(pageId, "Items", [
            "First Item",
            "Second Item",
          ]);

        render(() => renderPropertySection({ propertyId, pageId, bufferId }));

        const firstBlockId = Id.makePropertyBlockId(
          bufferId,
          pageId,
          propertyId,
          tupleIds[0]!,
        );
        const secondBlockId = Id.makePropertyBlockId(
          bufferId,
          pageId,
          propertyId,
          tupleIds[1]!,
        );

        // Click second linked block
        yield* Effect.promise(() =>
          waitFor(
            async () => {
              const secondBlock = document.querySelector(
                `[data-element-id="${secondBlockId}"]`,
              );
              expect(secondBlock).toBeTruthy();
              await userEvent.click(secondBlock as HTMLElement);
            },
            { timeout: 2000 },
          ),
        );

        // Move to start and press Backspace
        yield* Effect.promise(() => userEvent.keyboard("{Home}{Backspace}"));

        // First linked block should be focused
        yield* Effect.promise(() =>
          waitFor(
            () => {
              const firstBlockEditor = document.querySelector(
                `[data-element-id="${firstBlockId}"] .cm-editor.cm-focused`,
              );
              expect(firstBlockEditor).toBeTruthy();
            },
            { timeout: 2000 },
          ),
        );

        // Both blocks should still exist (not merged)
        const firstText = yield* Automerge.getText(linkedNodeIds[0]!);
        const secondText = yield* Automerge.getText(linkedNodeIds[1]!);
        expect(firstText).toBe("First Item");
        expect(secondText).toBe("Second Item");
      }).pipe(runtime.runPromise);
    });

    it("BackspaceAtStart does not merge linked blocks", async () => {
      await Effect.gen(function* () {
        const Property = yield* PropertyT;

        const { rootNodeId: pageId, bufferId } =
          yield* Given.A_BUFFER_WITH_CHILDREN("Test Page", []);

        const { propertyId, tupleIds } = yield* setupBoundProperty(
          pageId,
          "Items",
          ["First Item", "Second Item"],
        );

        render(() => renderPropertySection({ propertyId, pageId, bufferId }));

        const secondBlockId = Id.makePropertyBlockId(
          bufferId,
          pageId,
          propertyId,
          tupleIds[1]!,
        );

        // Click second linked block
        yield* Effect.promise(() =>
          waitFor(
            async () => {
              const secondBlock = document.querySelector(
                `[data-element-id="${secondBlockId}"]`,
              );
              expect(secondBlock).toBeTruthy();
              await userEvent.click(secondBlock as HTMLElement);
            },
            { timeout: 2000 },
          ),
        );

        yield* Effect.promise(() => userEvent.keyboard("{Home}{Backspace}"));

        // Still should have 2 linked tuples
        const linkedTuples = yield* Property.getLinkedTuples(
          propertyId,
          pageId,
        );
        expect(linkedTuples.length).toBe(2);
      }).pipe(runtime.runPromise);
    });
  });

  describe("Linked blocks display text content", () => {
    it("displays linked block text content", async () => {
      await Effect.gen(function* () {
        const { rootNodeId: pageId, bufferId } =
          yield* Given.A_BUFFER_WITH_CHILDREN("Test Page", []);

        const { propertyId } = yield* setupBoundProperty(pageId, "Related", [
          "Linked Item One",
          "Linked Item Two",
        ]);

        render(() => renderPropertySection({ propertyId, pageId, bufferId }));

        yield* Effect.promise(() =>
          waitFor(
            () => {
              const text = document.body.textContent;
              expect(text).toContain("Linked Item One");
              expect(text).toContain("Linked Item Two");
            },
            { timeout: 2000 },
          ),
        );
      }).pipe(runtime.runPromise);
    });
  });
});
