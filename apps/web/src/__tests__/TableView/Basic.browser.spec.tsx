import "@/index.css";
import { Id } from "@/schema";
import { TupleT } from "@/services/domain/Tuple";
import { StoreT } from "@/services/external/Store";
import { YjsT } from "@/services/external/Yjs";
import EditorBuffer from "@/ui/EditorBuffer";
import { Effect, Option } from "effect";
import { nanoid } from "nanoid";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { waitFor } from "solid-testing-library";
import { Given, setupClientTest, type BrowserRuntime } from "../bdd";
import { events } from "@/livestore/schema";

/**
 * System IDs for TableView feature.
 * These will be defined in schema/system.ts once the feature is implemented.
 *
 * TABLE_VIEW type would be used to type the view node itself:
 *   const TABLE_VIEW = "sys:type:table-view" as Id.Node;
 *
 * For now we only need the HAS_VIEW tuple type to link nodes to views.
 */
const SystemTupleTypes = {
  HAS_VIEW: "sys:tuple-type:has-view" as Id.Node,
} as const;

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
    it("renders a table when buffer has an active TableView", async () => {
      await Effect.gen(function* () {
        // Given: A buffer with children
        const { bufferId, rootNodeId, childNodeIds } =
          yield* Given.A_BUFFER_WITH_CHILDREN("Projects", [
            { text: "Project Alpha" },
            { text: "Project Beta" },
            { text: "Project Gamma" },
          ]);

        // Given: A TableView node linked to the buffer's root node
        const tableViewNodeId = yield* createTableViewForNode(rootNodeId);

        // Given: The buffer has the TableView as its active view
        yield* setBufferActiveView(bufferId, tableViewNodeId);

        // When: The EditorBuffer is rendered
        render(() => <EditorBuffer bufferId={bufferId} />);

        // Then: A table element should be visible
        yield* Effect.promise(() =>
          waitFor(
            () => {
              const table = document.querySelector("table");
              expect(table, "Expected a <table> element to be rendered").toBeTruthy();
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
        // Given: A buffer with children but NO active view
        const { bufferId, childNodeIds } = yield* Given.A_BUFFER_WITH_CHILDREN(
          "Tasks",
          [{ text: "Task One" }, { text: "Task Two" }],
        );

        // When: The EditorBuffer is rendered
        render(() => <EditorBuffer bufferId={bufferId} />);

        // Then: No table element should be rendered
        yield* Effect.promise(() =>
          waitFor(
            () => {
              // Wait for blocks to render first
              const blocks = document.querySelectorAll("[data-element-type='block']");
              expect(blocks.length).toBeGreaterThan(0);
            },
            { timeout: 2000 },
          ),
        );

        // Verify no table is present
        const table = document.querySelector("table");
        expect(table, "Expected no <table> when activeViewId is not set").toBeFalsy();

        // Then: Normal blocks should be visible
        const firstChildBlockId = Id.makeBlockId(bufferId, childNodeIds[0]);
        const blockElement = document.querySelector(
          `[data-element-id="${firstChildBlockId}"]`,
        );
        expect(blockElement, "Expected block elements to be rendered").toBeTruthy();
      }).pipe(runtime.runPromise);
    });
  });

  describe("Property columns", () => {
    it("renders columns for tuple properties attached to child nodes", async () => {
      await Effect.gen(function* () {
        const Store = yield* StoreT;
        const Tuple = yield* TupleT;
        const Yjs = yield* YjsT;

        // Given: A buffer with children
        const { bufferId, rootNodeId, childNodeIds } =
          yield* Given.A_BUFFER_WITH_CHILDREN("Tasks", [
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
        Yjs.getText(statusTupleTypeId).insert(0, "Status");

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
        Yjs.getText(doneNodeId).insert(0, "Done");

        yield* Store.commit(
          events.nodeCreated({
            timestamp: Date.now(),
            data: { nodeId: inProgressNodeId },
          }),
        );
        Yjs.getText(inProgressNodeId).insert(0, "In Progress");

        yield* Store.commit(
          events.nodeCreated({
            timestamp: Date.now(),
            data: { nodeId: todoNodeId },
          }),
        );
        Yjs.getText(todoNodeId).insert(0, "Todo");

        // Given: Tuples linking child nodes to their status values
        // Tuple format: (ChildNode, StatusValue) with StatusTupleType
        yield* Tuple.create(statusTupleTypeId, [childNodeIds[0], doneNodeId]);
        yield* Tuple.create(statusTupleTypeId, [childNodeIds[1], inProgressNodeId]);
        yield* Tuple.create(statusTupleTypeId, [childNodeIds[2], todoNodeId]);

        // Given: A TableView linked to the root node
        const tableViewNodeId = yield* createTableViewForNode(rootNodeId);

        // Given: The buffer has the TableView as its active view
        yield* setBufferActiveView(bufferId, tableViewNodeId);

        // When: The EditorBuffer is rendered
        render(() => <EditorBuffer bufferId={bufferId} />);

        // Then: A table element should be visible
        yield* Effect.promise(() =>
          waitFor(
            () => {
              const table = document.querySelector("table");
              expect(table, "Expected a <table> element to be rendered").toBeTruthy();
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
        // Given: A buffer with children
        const { bufferId, rootNodeId } = yield* Given.A_BUFFER_WITH_CHILDREN(
          "Projects",
          [{ text: "Project Alpha" }, { text: "Project Beta" }],
        );

        // Given: TWO TableView nodes linked to the root node via HAS_VIEW tuples
        const viewA = yield* createNamedTableViewForNode(rootNodeId, "View A");
        yield* createNamedTableViewForNode(rootNodeId, "View B");

        // Given: The buffer has the first view as its active view
        yield* setBufferActiveView(bufferId, viewA);

        // When: The EditorBuffer is rendered
        render(() => <EditorBuffer bufferId={bufferId} />);

        // Then: A tab bar element should exist
        yield* Effect.promise(() =>
          waitFor(
            () => {
              const tabBar = document.querySelector('[data-testid="view-tabs"]');
              expect(tabBar, "Expected a tab bar to be rendered").toBeTruthy();
            },
            { timeout: 2000 },
          ),
        );

        // Then: There should be 2 tab buttons
        yield* Effect.promise(() =>
          waitFor(
            () => {
              const tabs = document.querySelectorAll('[data-testid="view-tab"]');
              expect(tabs.length, "Expected 2 tab buttons").toBe(2);
            },
            { timeout: 2000 },
          ),
        );
      }).pipe(runtime.runPromise);
    });

    it("hides tabs when only one view exists", async () => {
      await Effect.gen(function* () {
        // Given: A buffer with children
        const { bufferId, rootNodeId } = yield* Given.A_BUFFER_WITH_CHILDREN(
          "Tasks",
          [{ text: "Task One" }, { text: "Task Two" }],
        );

        // Given: Only ONE TableView node linked to the root node
        const singleView = yield* createTableViewForNode(rootNodeId);

        // Given: The buffer has that view as its active view
        yield* setBufferActiveView(bufferId, singleView);

        // When: The EditorBuffer is rendered
        render(() => <EditorBuffer bufferId={bufferId} />);

        // Then: The table should be rendered (view is active)
        yield* Effect.promise(() =>
          waitFor(
            () => {
              const table = document.querySelector("table");
              expect(table, "Expected a <table> element to be rendered").toBeTruthy();
            },
            { timeout: 2000 },
          ),
        );

        // Then: No tab bar element should exist (single view = no tabs)
        const tabBar = document.querySelector('[data-testid="view-tabs"]');
        expect(tabBar, "Expected no tab bar when only one view exists").toBeFalsy();
      }).pipe(runtime.runPromise);
    });

    it("clicking tab switches active view", async () => {
      await Effect.gen(function* () {
        const Store = yield* StoreT;

        // Given: A buffer with children
        const { bufferId, rootNodeId } = yield* Given.A_BUFFER_WITH_CHILDREN(
          "Data",
          [{ text: "Item One" }, { text: "Item Two" }],
        );

        // Given: TWO TableView nodes with distinct names
        const viewA = yield* createNamedTableViewForNode(rootNodeId, "View A");
        const viewB = yield* createNamedTableViewForNode(rootNodeId, "View B");

        // Given: The buffer has the first view as its active view
        yield* setBufferActiveView(bufferId, viewA);

        // When: The EditorBuffer is rendered
        render(() => <EditorBuffer bufferId={bufferId} />);

        // Wait for tabs to render
        yield* Effect.promise(() =>
          waitFor(
            () => {
              const tabs = document.querySelectorAll('[data-testid="view-tab"]');
              expect(tabs.length, "Expected 2 tabs").toBe(2);
            },
            { timeout: 2000 },
          ),
        );

        // When: User clicks the second tab (View B)
        yield* Effect.promise(() =>
          waitFor(
            () => {
              const tabs = document.querySelectorAll('[data-testid="view-tab"]');
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
              const activeTab = document.querySelector('[data-testid="view-tab"][data-active="true"]');
              expect(activeTab?.textContent).toContain("View B");
            },
            { timeout: 2000 },
          ),
        );

        // Additionally verify the model state changed
        const bufferDoc = yield* Store.getDocument("buffer", bufferId);
        expect(Option.isSome(bufferDoc)).toBe(true);
        const buf = Option.getOrThrow(bufferDoc) as { activeViewId: Id.Node | null };
        expect(buf.activeViewId, "Expected activeViewId to be View B").toBe(viewB);
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
    const Yjs = yield* YjsT;

    // Create the TableView node
    const tableViewNodeId = Id.Node.make(nanoid());

    yield* Store.commit(
      events.nodeCreated({
        timestamp: Date.now(),
        data: { nodeId: tableViewNodeId },
      }),
    );

    // Set text content for the view (optional, for debugging)
    const ytext = Yjs.getText(tableViewNodeId);
    ytext.insert(0, "Table View");

    // Create HAS_VIEW tuple: (nodeId, tableViewNodeId)
    // This links the node to its view
    yield* Tuple.create(SystemTupleTypes.HAS_VIEW, [nodeId, tableViewNodeId]);

    return tableViewNodeId;
  }).pipe(Effect.withSpan("createTableViewForNode"));

/**
 * Sets the buffer's activeViewId to the specified view node.
 */
const setBufferActiveView = (bufferId: Id.Buffer, viewNodeId: Id.Node) =>
  Effect.gen(function* () {
    const Store = yield* StoreT;

    const bufferDoc = yield* Store.getDocument("buffer", bufferId);
    if (Option.isNone(bufferDoc)) {
      throw new Error(`Buffer ${bufferId} not found`);
    }

    const currentBuffer = Option.getOrThrow(bufferDoc);

    yield* Store.setDocument(
      "buffer",
      {
        ...currentBuffer,
        activeViewId: viewNodeId,
      },
      bufferId,
    );
  }).pipe(Effect.withSpan("setBufferActiveView"));

/**
 * Creates a TableView node with a custom name and links it to the target node via HAS_VIEW tuple.
 * Returns the TableView node ID.
 */
const createNamedTableViewForNode = (nodeId: Id.Node, viewName: string) =>
  Effect.gen(function* () {
    const Store = yield* StoreT;
    const Tuple = yield* TupleT;
    const Yjs = yield* YjsT;

    // Create the TableView node
    const tableViewNodeId = Id.Node.make(nanoid());

    yield* Store.commit(
      events.nodeCreated({
        timestamp: Date.now(),
        data: { nodeId: tableViewNodeId },
      }),
    );

    // Set custom text content for the view name
    const ytext = Yjs.getText(tableViewNodeId);
    ytext.insert(0, viewName);

    // Create HAS_VIEW tuple: (nodeId, tableViewNodeId)
    yield* Tuple.create(SystemTupleTypes.HAS_VIEW, [nodeId, tableViewNodeId]);

    return tableViewNodeId;
  }).pipe(Effect.withSpan("createNamedTableViewForNode"));
