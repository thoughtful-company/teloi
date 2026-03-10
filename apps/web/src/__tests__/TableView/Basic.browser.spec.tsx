import "@/index.css";
import { Id, System } from "@/schema";
import { TupleT } from "@/services/domain/Tuple";
import { TypeT } from "@/services/domain/Type";
import { StoreT } from "@/services/external/Store";
import { AutomergeT } from "@/services/external/Automerge";
import FrameView from "@/ui/FrameView";
import { Effect, Option } from "effect";
import { nanoid } from "nanoid";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { waitFor } from "solid-testing-library";
import { Given, setupClientTest, type BrowserRuntime } from "@/test-utils/bdd";
import { events } from "@/livestore/schema";

describe("TableView", () => {
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

  describe("Basic rendering", () => {
    it("renders a table when frame has an active TableView", async () => {
      await Effect.gen(function* () {
        // Given: A frame with children
        const { frameId, rootNodeId, childNodeIds } =
          yield* Given.A_FRAME_WITH_CHILDREN("Projects", [
            { text: "Project Alpha" },
            { text: "Project Beta" },
            { text: "Project Gamma" },
          ]);

        // Given: A TableView node linked to the frame's root node
        const tableViewNodeId = yield* createTableViewForNode(rootNodeId);

        // Given: The frame has the TableView as its active view
        yield* setFrameActiveView(frameId, tableViewNodeId);

        // When: The Frame is rendered
        render(() => <FrameView frameId={frameId} />);

        // Then: A table element should be visible
        yield* Effect.promise(() =>
          waitFor(
            () => {
              const table = document.querySelector("table");
              expect(
                table,
                "Expected a <table> element to be rendered",
              ).toBeTruthy();
            },
            { timeout: 2000 },
          ),
        );

        // Then: The table should have rows for each child
        yield* Effect.promise(() =>
          waitFor(
            () => {
              const rows = document.querySelectorAll("table tbody tr");
              expect(
                rows.length,
                `Expected ${childNodeIds.length} rows, got ${rows.length}`,
              ).toBe(childNodeIds.length);
            },
            { timeout: 2000 },
          ),
        );

        // Then: Each row should display the child's text content
        yield* Effect.promise(() =>
          waitFor(
            () => {
              const tableText = document.querySelector("table")?.textContent;
              expect(tableText).toContain("Project Alpha");
              expect(tableText).toContain("Project Beta");
              expect(tableText).toContain("Project Gamma");
            },
            { timeout: 2000 },
          ),
        );
      }).pipe(runtime.runPromise);
    });

    it("renders normal block view when no active TableView", async () => {
      await Effect.gen(function* () {
        // Given: A frame with children but NO active view
        const { frameId, childNodeIds } = yield* Given.A_FRAME_WITH_CHILDREN(
          "Tasks",
          [{ text: "Task One" }, { text: "Task Two" }],
        );

        // When: The Frame is rendered
        render(() => <FrameView frameId={frameId} />);

        // Then: No table element should be rendered
        yield* Effect.promise(() =>
          waitFor(
            () => {
              // Wait for blocks to render first
              const blocks = document.querySelectorAll(
                "[data-element-type='khora']",
              );
              expect(blocks.length).toBeGreaterThan(0);
            },
            { timeout: 2000 },
          ),
        );

        // Verify no table is present
        const table = document.querySelector("table");
        expect(
          table,
          "Expected no <table> when activeViewId is not set",
        ).toBeFalsy();

        // Then: Normal blocks should be visible
        const firstChildBlockId = Id.makeFrameKhoraId(frameId, childNodeIds[0]);
        const blockElement = document.querySelector(
          `[data-element-id="${firstChildBlockId}"]`,
        );
        expect(
          blockElement,
          "Expected block elements to be rendered",
        ).toBeTruthy();
      }).pipe(runtime.runPromise);
    });
  });

  describe("Property columns", () => {
    it("renders columns for tuple properties attached to child nodes", async () => {
      await Effect.gen(function* () {
        const Store = yield* StoreT;
        const Tuple = yield* TupleT;
        const Automerge = yield* AutomergeT;

        // Given: A frame with children
        const { frameId, rootNodeId, childNodeIds } =
          yield* Given.A_FRAME_WITH_CHILDREN("Tasks", [
            { text: "Write tests" },
            { text: "Review PR" },
            { text: "Deploy feature" },
          ]);

        // Given: A "Status" tuple type node (defines the property kind)
        const statusTupleTypeId = Id.Node.make(nanoid());
        yield* Store.commit(
          events.nodeCreated({
            timestamp: Date.now(),
            data: { nodeId: statusTupleTypeId },
          }),
        );
        yield* Automerge.setText(statusTupleTypeId, "Status");

        // Given: Value nodes for status options
        const doneNodeId = Id.Node.make(nanoid());
        const inProgressNodeId = Id.Node.make(nanoid());
        const todoNodeId = Id.Node.make(nanoid());

        yield* Store.commit(
          events.nodeCreated({
            timestamp: Date.now(),
            data: { nodeId: doneNodeId },
          }),
        );
        yield* Automerge.setText(doneNodeId, "Done");

        yield* Store.commit(
          events.nodeCreated({
            timestamp: Date.now(),
            data: { nodeId: inProgressNodeId },
          }),
        );
        yield* Automerge.setText(inProgressNodeId, "In Progress");

        yield* Store.commit(
          events.nodeCreated({
            timestamp: Date.now(),
            data: { nodeId: todoNodeId },
          }),
        );
        yield* Automerge.setText(todoNodeId, "Todo");

        // Given: Tuples linking child nodes to their status values
        // Tuple format: (ChildNode, StatusValue) with StatusTupleType
        yield* Tuple.create(statusTupleTypeId, [childNodeIds[0], doneNodeId]);
        yield* Tuple.create(statusTupleTypeId, [
          childNodeIds[1],
          inProgressNodeId,
        ]);
        yield* Tuple.create(statusTupleTypeId, [childNodeIds[2], todoNodeId]);

        // Given: A TableView linked to the root node
        const tableViewNodeId = yield* createTableViewForNode(rootNodeId);

        // Given: The frame has the TableView as its active view
        yield* setFrameActiveView(frameId, tableViewNodeId);

        // When: The Frame is rendered
        render(() => <FrameView frameId={frameId} />);

        // Then: A table element should be visible
        yield* Effect.promise(() =>
          waitFor(
            () => {
              const table = document.querySelector("table");
              expect(
                table,
                "Expected a <table> element to be rendered",
              ).toBeTruthy();
            },
            { timeout: 2000 },
          ),
        );

        // Then: The table should have a "Status" column header
        yield* Effect.promise(() =>
          waitFor(
            () => {
              const headers = document.querySelectorAll("table th");
              const headerTexts = Array.from(headers).map((h) => h.textContent);
              expect(
                headerTexts,
                `Expected a "Status" column header, got: ${headerTexts.join(", ")}`,
              ).toContain("Status");
            },
            { timeout: 2000 },
          ),
        );

        // Then: Each row should display the correct status value
        yield* Effect.promise(() =>
          waitFor(
            () => {
              const rows = document.querySelectorAll("table tbody tr");
              expect(rows.length, "Expected 3 rows").toBe(3);

              // Check each row has the expected status
              const row1Text = rows[0]?.textContent;
              const row2Text = rows[1]?.textContent;
              const row3Text = rows[2]?.textContent;

              expect(row1Text, "Row 1 should contain 'Done'").toContain("Done");
              expect(row2Text, "Row 2 should contain 'In Progress'").toContain(
                "In Progress",
              );
              expect(row3Text, "Row 3 should contain 'Todo'").toContain("Todo");
            },
            { timeout: 2000 },
          ),
        );
      }).pipe(runtime.runPromise);
    });
  });

  describe("ViewTabs", () => {
    it("shows view tabs when node has 2+ views", async () => {
      await Effect.gen(function* () {
        // Given: A frame with children
        const { frameId, rootNodeId } = yield* Given.A_FRAME_WITH_CHILDREN(
          "Projects",
          [{ text: "Project Alpha" }, { text: "Project Beta" }],
        );

        // Given: TWO TableView nodes linked to the root node via HAS_VIEW tuples
        const viewA = yield* createNamedTableViewForNode(rootNodeId, "View A");
        yield* createNamedTableViewForNode(rootNodeId, "View B");

        // Given: The frame has the first view as its active view
        yield* setFrameActiveView(frameId, viewA);

        // When: The Frame is rendered
        render(() => <FrameView frameId={frameId} />);

        // Then: A tab bar element should exist
        yield* Effect.promise(() =>
          waitFor(
            () => {
              const tabBar = document.querySelector(
                '[data-testid="view-tabs"]',
              );
              expect(tabBar, "Expected a tab bar to be rendered").toBeTruthy();
            },
            { timeout: 2000 },
          ),
        );

        // Then: There should be 2 tab buttons
        yield* Effect.promise(() =>
          waitFor(
            () => {
              const tabs = document.querySelectorAll(
                '[data-testid="view-tab"]',
              );
              expect(tabs.length, "Expected 2 tab buttons").toBe(2);
            },
            { timeout: 2000 },
          ),
        );
      }).pipe(runtime.runPromise);
    });

    it("hides tabs when only one view exists", async () => {
      await Effect.gen(function* () {
        // Given: A frame with children
        const { frameId, rootNodeId } = yield* Given.A_FRAME_WITH_CHILDREN(
          "Tasks",
          [{ text: "Task One" }, { text: "Task Two" }],
        );

        // Given: Only ONE TableView node linked to the root node
        const singleView = yield* createTableViewForNode(rootNodeId);

        // Given: The frame has that view as its active view
        yield* setFrameActiveView(frameId, singleView);

        // When: The Frame is rendered
        render(() => <FrameView frameId={frameId} />);

        // Then: The table should be rendered (view is active)
        yield* Effect.promise(() =>
          waitFor(
            () => {
              const table = document.querySelector("table");
              expect(
                table,
                "Expected a <table> element to be rendered",
              ).toBeTruthy();
            },
            { timeout: 2000 },
          ),
        );

        // Then: No tab bar element should exist (single view = no tabs)
        const tabBar = document.querySelector('[data-testid="view-tabs"]');
        expect(
          tabBar,
          "Expected no tab bar when only one view exists",
        ).toBeFalsy();
      }).pipe(runtime.runPromise);
    });

    it("clicking tab switches active view", async () => {
      await Effect.gen(function* () {
        const Store = yield* StoreT;

        // Given: A frame with children
        const { frameId, rootNodeId } = yield* Given.A_FRAME_WITH_CHILDREN(
          "Data",
          [{ text: "Item One" }, { text: "Item Two" }],
        );

        // Given: TWO TableView nodes with distinct names
        const viewA = yield* createNamedTableViewForNode(rootNodeId, "View A");
        const viewB = yield* createNamedTableViewForNode(rootNodeId, "View B");

        // Given: The frame has the first view as its active view
        yield* setFrameActiveView(frameId, viewA);

        // When: The Frame is rendered
        render(() => <FrameView frameId={frameId} />);

        // Wait for tabs to render
        yield* Effect.promise(() =>
          waitFor(
            () => {
              const tabs = document.querySelectorAll(
                '[data-testid="view-tab"]',
              );
              expect(tabs.length, "Expected 2 tabs").toBe(2);
            },
            { timeout: 2000 },
          ),
        );

        // When: User clicks the second tab (View B)
        yield* Effect.promise(() =>
          waitFor(
            () => {
              const tabs = document.querySelectorAll(
                '[data-testid="view-tab"]',
              );
              // Find the tab for View B by its text content
              const viewBTab = Array.from(tabs).find((tab) =>
                tab.textContent?.includes("View B"),
              );
              expect(viewBTab, 'Expected to find "View B" tab').toBeTruthy();
              (viewBTab as HTMLElement).click();
            },
            { timeout: 2000 },
          ),
        );

        // Then: The activeViewId should change to View B
        // Use polling to wait for state change - check if the active tab changed in the DOM
        yield* Effect.promise(() =>
          waitFor(
            () => {
              const activeTab = document.querySelector(
                '[data-testid="view-tab"][data-active="true"]',
              );
              expect(activeTab?.textContent).toContain("View B");
            },
            { timeout: 2000 },
          ),
        );

        // Additionally verify the model state changed
        const frameDoc = yield* Store.getDocument("frame", frameId);
        expect(Option.isSome(frameDoc)).toBe(true);
        const frm = Option.getOrThrow(frameDoc) as {
          activeViewId: Id.Node | null;
        };
        expect(frm.activeViewId, "Expected activeViewId to be View B").toBe(
          viewB,
        );
      }).pipe(runtime.runPromise);
    });
  });
});

// ============================================================================
// Test Helpers (to be moved to Given helpers once patterns stabilize)
// ============================================================================

/**
 * Creates a TableView node and links it to the target node via HAS_VIEW tuple.
 * Returns the TableView node ID.
 */
const createTableViewForNode = (nodeId: Id.Node) =>
  Effect.gen(function* () {
    const Store = yield* StoreT;
    const Tuple = yield* TupleT;
    const Type = yield* TypeT;
    const Automerge = yield* AutomergeT;

    const tableViewNodeId = Id.Node.make(nanoid());

    yield* Store.commit(
      events.nodeCreated({
        timestamp: Date.now(),
        data: { nodeId: tableViewNodeId },
      }),
    );

    yield* Automerge.setText(tableViewNodeId, "Table View");
    yield* Type.addType(tableViewNodeId, System.TABLE_VIEW);
    yield* Tuple.create(System.HAS_VIEW, [nodeId, tableViewNodeId]);

    return tableViewNodeId;
  }).pipe(Effect.withSpan("createTableViewForNode"));

/**
 * Sets the frame's activeViewId to the specified view node.
 */
const setFrameActiveView = (frameId: Id.Frame, viewNodeId: Id.Node) =>
  Effect.gen(function* () {
    const Store = yield* StoreT;

    const frameDoc = yield* Store.getDocument("frame", frameId);
    if (Option.isNone(frameDoc)) {
      throw new Error(`Frame ${frameId} not found`);
    }

    const currentFrame = Option.getOrThrow(frameDoc);

    yield* Store.setDocument(
      "frame",
      {
        ...currentFrame,
        activeViewId: viewNodeId,
      },
      frameId,
    );
  }).pipe(Effect.withSpan("setFrameActiveView"));

/**
 * Creates a TableView node with a custom name and links it to the target node via HAS_VIEW tuple.
 * Returns the TableView node ID.
 */
const createNamedTableViewForNode = (nodeId: Id.Node, viewName: string) =>
  Effect.gen(function* () {
    const Store = yield* StoreT;
    const Tuple = yield* TupleT;
    const Type = yield* TypeT;
    const Automerge = yield* AutomergeT;

    const tableViewNodeId = Id.Node.make(nanoid());

    yield* Store.commit(
      events.nodeCreated({
        timestamp: Date.now(),
        data: { nodeId: tableViewNodeId },
      }),
    );

    yield* Automerge.setText(tableViewNodeId, viewName);
    yield* Type.addType(tableViewNodeId, System.TABLE_VIEW);
    yield* Tuple.create(System.HAS_VIEW, [nodeId, tableViewNodeId]);

    return tableViewNodeId;
  }).pipe(Effect.withSpan("createNamedTableViewForNode"));
