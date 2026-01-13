import "@/index.css";
import App from "@/App";
import { events } from "@/livestore/schema";
import { Id } from "@/schema";
import { TupleT } from "@/services/domain/Tuple";
import { StoreT } from "@/services/external/Store";
import { YjsT } from "@/services/external/Yjs";
import { userEvent } from "@vitest/browser/context";
import { Effect, Option } from "effect";
import { nanoid } from "nanoid";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { waitFor } from "solid-testing-library";
import { Given, setupClientTest, type BrowserRuntime } from "../bdd";

/** Well-known tuple type for linking nodes to views */
const HAS_VIEW_TUPLE_TYPE = "sys:tuple-type:has-view" as Id.Node;

/**
 * CommandPalette tests.
 *
 * The command palette is opened with Cmd+K (or Ctrl+K on Windows/Linux).
 * It displays a searchable list of commands that can be executed.
 *
 * Architecture:
 * - CommandPalette lives in App.tsx
 * - App tracks "active buffer" via focus events from EditorBuffer
 * - Commands execute Effect-based actions with buffer/node context
 */
describe("CommandPalette", () => {
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
   * Sets up the full pane/window hierarchy for App rendering.
   * Creates a buffer and registers it in the window's pane structure.
   */
  const setupBufferInApp = (bufferId: Id.Buffer, windowId: Id.Window) =>
    Effect.gen(function* () {
      const Store = yield* StoreT;
      const paneId = Id.Pane.make("test-pane");

      // Create pane document with the buffer
      yield* Store.setDocument(
        "pane",
        {
          parent: { id: windowId, type: "window" },
          buffers: [bufferId],
        },
        paneId,
      );

      // Update window to include the pane
      yield* Store.setDocument(
        "window",
        {
          panes: [paneId],
          activeElement: null,
        },
        windowId,
      );
    });

  /**
   * Dispatches Cmd+K (Meta+K) keyboard event to open command palette.
   */
  const pressCommandK = () =>
    Effect.promise(async () => {
      await userEvent.keyboard("{Meta>}k{/Meta}");
    });

  /**
   * Dispatches Escape key to close command palette.
   */
  const pressEscape = () =>
    Effect.promise(async () => {
      await userEvent.keyboard("{Escape}");
    });

  /**
   * Waits for command palette to be visible.
   */
  const waitForCommandPalette = () =>
    Effect.promise(() =>
      waitFor(
        () => {
          const palette = document.querySelector('[data-testid="command-palette"]');
          expect(palette, "Command palette should be visible").toBeTruthy();
          return palette as HTMLElement;
        },
        { timeout: 2000 },
      ),
    );

  /**
   * Asserts command palette is NOT visible.
   */
  const assertCommandPaletteHidden = () =>
    Effect.sync(() => {
      const palette = document.querySelector('[data-testid="command-palette"]');
      expect(palette, "Command palette should not be visible").toBeFalsy();
    });

  /**
   * Gets the search input inside the command palette.
   */
  const getSearchInput = () =>
    Effect.promise(() =>
      waitFor(
        () => {
          const input = document.querySelector(
            '[data-testid="command-palette"] input[type="text"]',
          );
          expect(input, "Search input should exist").toBeTruthy();
          return input as HTMLInputElement;
        },
        { timeout: 2000 },
      ),
    );

  /**
   * Gets all visible command items in the palette.
   */
  const getVisibleCommands = () =>
    Effect.sync(() => {
      const items = document.querySelectorAll('[data-testid="command-item"]');
      return Array.from(items).map((el) => el.textContent ?? "");
    });

  describe("Opening and closing", () => {
    it("pressing Cmd+K opens command palette", async () => {
      await Effect.gen(function* () {
        const { bufferId, windowId } = yield* Given.A_BUFFER_WITH_CHILDREN(
          "Test Document",
          [{ text: "Block one" }],
        );

        yield* setupBufferInApp(bufferId, windowId);
        render(() => <App />);

        // Wait for app to render
        yield* Effect.promise(() =>
          waitFor(
            () => {
              const blocks = document.querySelectorAll("[data-element-type='block']");
              expect(blocks.length).toBeGreaterThan(0);
            },
            { timeout: 2000 },
          ),
        );

        // Command palette should NOT be visible initially
        yield* assertCommandPaletteHidden();

        // When: User presses Cmd+K
        yield* pressCommandK();

        // Then: Command palette should appear
        yield* waitForCommandPalette();

        // And: It should have a search input
        const input = yield* getSearchInput();
        expect(input.tagName).toBe("INPUT");
      }).pipe(runtime.runPromise);
    });

    it("pressing Escape closes command palette", async () => {
      await Effect.gen(function* () {
        const { bufferId, windowId } = yield* Given.A_BUFFER_WITH_CHILDREN(
          "Test Document",
          [{ text: "Block one" }],
        );

        yield* setupBufferInApp(bufferId, windowId);
        render(() => <App />);

        // Wait for app to render
        yield* Effect.promise(() =>
          waitFor(
            () => {
              const blocks = document.querySelectorAll("[data-element-type='block']");
              expect(blocks.length).toBeGreaterThan(0);
            },
            { timeout: 2000 },
          ),
        );

        // Open command palette
        yield* pressCommandK();
        yield* waitForCommandPalette();

        // When: User presses Escape
        yield* pressEscape();

        // Then: Command palette should be hidden
        // Give it a moment to close
        yield* Effect.promise(() =>
          waitFor(
            () => {
              const palette = document.querySelector('[data-testid="command-palette"]');
              expect(palette, "Command palette should be hidden after Escape").toBeFalsy();
            },
            { timeout: 2000 },
          ),
        );
      }).pipe(runtime.runPromise);
    });
  });

  describe("Filtering commands", () => {
    it("typing filters visible commands", async () => {
      await Effect.gen(function* () {
        const { bufferId, windowId } = yield* Given.A_BUFFER_WITH_CHILDREN(
          "Test Document",
          [{ text: "Block one" }],
        );

        yield* setupBufferInApp(bufferId, windowId);
        render(() => <App />);

        // Wait for app to render
        yield* Effect.promise(() =>
          waitFor(
            () => {
              const blocks = document.querySelectorAll("[data-element-type='block']");
              expect(blocks.length).toBeGreaterThan(0);
            },
            { timeout: 2000 },
          ),
        );

        // Open command palette
        yield* pressCommandK();
        yield* waitForCommandPalette();

        // Get initial command count
        const initialCommands = yield* getVisibleCommands();
        expect(initialCommands.length, "Should have at least one command").toBeGreaterThan(0);

        // When: User types "table" to filter
        yield* Effect.promise(() => userEvent.keyboard("table"));

        // Then: Only commands containing "table" should be visible
        yield* Effect.promise(() =>
          waitFor(
            () => {
              const items = document.querySelectorAll('[data-testid="command-item"]');
              const texts = Array.from(items).map((el) =>
                el.textContent?.toLowerCase() ?? "",
              );
              // All visible commands should contain "table"
              for (const text of texts) {
                expect(text).toContain("table");
              }
            },
            { timeout: 2000 },
          ),
        );
      }).pipe(runtime.runPromise);
    });
  });

  describe("Input editing", () => {
    it("ArrowLeft keydown event is not prevented anywhere in event chain", async () => {
      await Effect.gen(function* () {
        const { bufferId, windowId } = yield* Given.A_BUFFER_WITH_CHILDREN(
          "Test Document",
          [{ text: "Block one" }],
        );

        yield* setupBufferInApp(bufferId, windowId);
        render(() => <App />);

        // Wait for app to render
        yield* Effect.promise(() =>
          waitFor(
            () => {
              const blocks = document.querySelectorAll("[data-element-type='block']");
              expect(blocks.length).toBeGreaterThan(0);
            },
            { timeout: 2000 },
          ),
        );

        // Open command palette
        yield* pressCommandK();
        yield* waitForCommandPalette();

        const input = yield* getSearchInput();

        // Type some text and set cursor position
        input.value = "hello";
        input.setSelectionRange(5, 5);
        input.focus();

        // Add capture phase listener on document to see if preventDefault is called
        let preventDefaultCalled = false;
        const captureListener = (e: KeyboardEvent) => {
          if (e.key === "ArrowLeft") {
            // Monkey-patch preventDefault to detect if it's called
            const originalPreventDefault = e.preventDefault.bind(e);
            e.preventDefault = () => {
              preventDefaultCalled = true;
              originalPreventDefault();
            };
          }
        };
        document.addEventListener("keydown", captureListener, true);

        try {
          // Dispatch a real KeyboardEvent
          const event = new KeyboardEvent("keydown", {
            key: "ArrowLeft",
            code: "ArrowLeft",
            bubbles: true,
            cancelable: true,
          });

          input.dispatchEvent(event);

          // Check if preventDefault was called anywhere in the chain
          expect(
            preventDefaultCalled,
            "ArrowLeft: preventDefault() should NOT be called - something is blocking cursor movement",
          ).toBe(false);
        } finally {
          document.removeEventListener("keydown", captureListener, true);
        }
      }).pipe(runtime.runPromise);
    });

    it("Backspace keydown event is not prevented anywhere in event chain", async () => {
      await Effect.gen(function* () {
        const { bufferId, windowId } = yield* Given.A_BUFFER_WITH_CHILDREN(
          "Test Document",
          [{ text: "Block one" }],
        );

        yield* setupBufferInApp(bufferId, windowId);
        render(() => <App />);

        // Wait for app to render
        yield* Effect.promise(() =>
          waitFor(
            () => {
              const blocks = document.querySelectorAll("[data-element-type='block']");
              expect(blocks.length).toBeGreaterThan(0);
            },
            { timeout: 2000 },
          ),
        );

        // Open command palette
        yield* pressCommandK();
        yield* waitForCommandPalette();

        const input = yield* getSearchInput();

        // Type some text
        input.value = "hello";
        input.setSelectionRange(5, 5);
        input.focus();

        // Add capture phase listener on document to see if preventDefault is called
        let preventDefaultCalled = false;
        const captureListener = (e: KeyboardEvent) => {
          if (e.key === "Backspace") {
            // Monkey-patch preventDefault to detect if it's called
            const originalPreventDefault = e.preventDefault.bind(e);
            e.preventDefault = () => {
              preventDefaultCalled = true;
              originalPreventDefault();
            };
          }
        };
        document.addEventListener("keydown", captureListener, true);

        try {
          // Dispatch a real KeyboardEvent
          const event = new KeyboardEvent("keydown", {
            key: "Backspace",
            code: "Backspace",
            bubbles: true,
            cancelable: true,
          });

          input.dispatchEvent(event);

          // Check if preventDefault was called anywhere in the chain
          expect(
            preventDefaultCalled,
            "Backspace: preventDefault() should NOT be called - something is blocking deletion",
          ).toBe(false);
        } finally {
          document.removeEventListener("keydown", captureListener, true);
        }
      }).pipe(runtime.runPromise);
    });

    it("arrow keys move cursor within input text", async () => {
      await Effect.gen(function* () {
        const { bufferId, windowId } = yield* Given.A_BUFFER_WITH_CHILDREN(
          "Test Document",
          [{ text: "Block one" }],
        );

        yield* setupBufferInApp(bufferId, windowId);
        render(() => <App />);

        // Wait for app to render
        yield* Effect.promise(() =>
          waitFor(
            () => {
              const blocks = document.querySelectorAll("[data-element-type='block']");
              expect(blocks.length).toBeGreaterThan(0);
            },
            { timeout: 2000 },
          ),
        );

        // Open command palette
        yield* pressCommandK();
        yield* waitForCommandPalette();

        const input = yield* getSearchInput();

        // Type some text
        yield* Effect.promise(() => userEvent.keyboard("hello"));

        // Verify text was typed and cursor is at end
        expect(input.value).toBe("hello");
        expect(input.selectionStart).toBe(5);
        expect(input.selectionEnd).toBe(5);

        // When: Press left arrow twice to move cursor
        yield* Effect.promise(() => userEvent.keyboard("{ArrowLeft}{ArrowLeft}"));

        // Then: Cursor should be at position 3 (between "hel" and "lo")
        expect(input.selectionStart, "Cursor should move left with ArrowLeft").toBe(3);
        expect(input.selectionEnd).toBe(3);

        // When: Press right arrow once
        yield* Effect.promise(() => userEvent.keyboard("{ArrowRight}"));

        // Then: Cursor should be at position 4
        expect(input.selectionStart, "Cursor should move right with ArrowRight").toBe(4);
        expect(input.selectionEnd).toBe(4);
      }).pipe(runtime.runPromise);
    });

    it("Backspace deletes characters before cursor", async () => {
      await Effect.gen(function* () {
        const { bufferId, windowId } = yield* Given.A_BUFFER_WITH_CHILDREN(
          "Test Document",
          [{ text: "Block one" }],
        );

        yield* setupBufferInApp(bufferId, windowId);
        render(() => <App />);

        // Wait for app to render
        yield* Effect.promise(() =>
          waitFor(
            () => {
              const blocks = document.querySelectorAll("[data-element-type='block']");
              expect(blocks.length).toBeGreaterThan(0);
            },
            { timeout: 2000 },
          ),
        );

        // Open command palette
        yield* pressCommandK();
        yield* waitForCommandPalette();

        const input = yield* getSearchInput();

        // Type some text
        yield* Effect.promise(() => userEvent.keyboard("hello"));
        expect(input.value).toBe("hello");

        // When: Press Backspace
        yield* Effect.promise(() => userEvent.keyboard("{Backspace}"));

        // Then: Last character should be deleted
        expect(input.value, "Backspace should delete character before cursor").toBe("hell");
      }).pipe(runtime.runPromise);
    });

    it("Delete key removes character after cursor", async () => {
      await Effect.gen(function* () {
        const { bufferId, windowId } = yield* Given.A_BUFFER_WITH_CHILDREN(
          "Test Document",
          [{ text: "Block one" }],
        );

        yield* setupBufferInApp(bufferId, windowId);
        render(() => <App />);

        // Wait for app to render
        yield* Effect.promise(() =>
          waitFor(
            () => {
              const blocks = document.querySelectorAll("[data-element-type='block']");
              expect(blocks.length).toBeGreaterThan(0);
            },
            { timeout: 2000 },
          ),
        );

        // Open command palette
        yield* pressCommandK();
        yield* waitForCommandPalette();

        const input = yield* getSearchInput();

        // Type some text
        yield* Effect.promise(() => userEvent.keyboard("hello"));
        expect(input.value).toBe("hello");

        // Move cursor to the beginning
        yield* Effect.promise(() => userEvent.keyboard("{Home}"));

        // When: Press Delete
        yield* Effect.promise(() => userEvent.keyboard("{Delete}"));

        // Then: First character should be deleted
        expect(input.value, "Delete should remove character after cursor").toBe("ello");
      }).pipe(runtime.runPromise);
    });
  });

  describe("Executing commands", () => {
    it("selecting 'Add Table View' creates view and renders table", async () => {
      await Effect.gen(function* () {
        const { bufferId, windowId } =
          yield* Given.A_BUFFER_WITH_CHILDREN("Projects", [
            { text: "Project Alpha" },
            { text: "Project Beta" },
          ]);

        yield* setupBufferInApp(bufferId, windowId);
        render(() => <App />);

        // Wait for blocks to render
        yield* Effect.promise(() =>
          waitFor(
            () => {
              const blocks = document.querySelectorAll("[data-element-type='block']");
              expect(blocks.length).toBe(2);
            },
            { timeout: 2000 },
          ),
        );

        // Open command palette
        yield* pressCommandK();
        yield* waitForCommandPalette();

        // Type to filter for table view command
        yield* Effect.promise(() => userEvent.keyboard("table"));

        // Wait for filtered results
        yield* Effect.promise(() =>
          waitFor(
            () => {
              const items = document.querySelectorAll('[data-testid="command-item"]');
              expect(items.length).toBeGreaterThan(0);
            },
            { timeout: 2000 },
          ),
        );

        // When: User selects "Add Table View" (press Enter to select first match)
        yield* Effect.promise(() => userEvent.keyboard("{Enter}"));

        // Then: Command palette should close
        yield* Effect.promise(() =>
          waitFor(
            () => {
              const palette = document.querySelector('[data-testid="command-palette"]');
              expect(palette).toBeFalsy();
            },
            { timeout: 2000 },
          ),
        );

        // Then: A table should be rendered
        yield* Effect.promise(() =>
          waitFor(
            () => {
              const table = document.querySelector("table");
              expect(table, "Expected a <table> element to be rendered").toBeTruthy();
            },
            { timeout: 2000 },
          ),
        );

        // Then: The table should display the child nodes
        yield* Effect.promise(() =>
          waitFor(
            () => {
              const tableText = document.querySelector("table")?.textContent;
              expect(tableText).toContain("Project Alpha");
              expect(tableText).toContain("Project Beta");
            },
            { timeout: 2000 },
          ),
        );
      }).pipe(runtime.runPromise);
    });

    it("selecting 'Add Page View' removes table and shows normal blocks", async () => {
      await Effect.gen(function* () {
        const Store = yield* StoreT;
        const Tuple = yield* TupleT;
        const Yjs = yield* YjsT;

        const { bufferId, rootNodeId, windowId } =
          yield* Given.A_BUFFER_WITH_CHILDREN("Projects", [
            { text: "Project Alpha" },
            { text: "Project Beta" },
          ]);

        // Given: A TableView node linked to the buffer's root node
        const tableViewNodeId = Id.Node.make(nanoid());
        yield* Store.commit(
          events.nodeCreated({
            timestamp: Date.now(),
            data: { nodeId: tableViewNodeId },
          }),
        );
        Yjs.getText(tableViewNodeId).insert(0, "Table View");
        yield* Tuple.create(HAS_VIEW_TUPLE_TYPE, [rootNodeId, tableViewNodeId]);

        // Given: The buffer has the TableView as its active view
        const bufferDoc = yield* Store.getDocument("buffer", bufferId);
        if (Option.isNone(bufferDoc)) throw new Error("Buffer not found");
        yield* Store.setDocument(
          "buffer",
          {
            ...bufferDoc.value,
            activeViewId: tableViewNodeId,
          },
          bufferId,
        );

        yield* setupBufferInApp(bufferId, windowId);
        render(() => <App />);

        // Wait for table to render (confirming table view is active)
        yield* Effect.promise(() =>
          waitFor(
            () => {
              const table = document.querySelector("table");
              expect(table, "Expected table to be rendered initially").toBeTruthy();
            },
            { timeout: 2000 },
          ),
        );

        // When: Open command palette
        yield* pressCommandK();
        yield* waitForCommandPalette();

        // When: Type to filter for "Add Page View" command
        yield* Effect.promise(() => userEvent.keyboard("page"));

        // Wait for filtered results
        yield* Effect.promise(() =>
          waitFor(
            () => {
              const items = document.querySelectorAll('[data-testid="command-item"]');
              expect(items.length).toBeGreaterThan(0);
            },
            { timeout: 2000 },
          ),
        );

        // When: User selects "Add Page View" (press Enter to select first match)
        yield* Effect.promise(() => userEvent.keyboard("{Enter}"));

        // Then: Command palette should close
        yield* Effect.promise(() =>
          waitFor(
            () => {
              const palette = document.querySelector('[data-testid="command-palette"]');
              expect(palette).toBeFalsy();
            },
            { timeout: 2000 },
          ),
        );

        // Then: Table should be gone
        yield* Effect.promise(() =>
          waitFor(
            () => {
              const table = document.querySelector("table");
              expect(table, "Expected table to be removed").toBeFalsy();
            },
            { timeout: 2000 },
          ),
        );

        // Then: Normal blocks should be rendered
        yield* Effect.promise(() =>
          waitFor(
            () => {
              const blocks = document.querySelectorAll("[data-element-type='block']");
              expect(blocks.length, "Expected block elements to be rendered").toBe(2);
              const pageText = document.body.textContent;
              expect(pageText).toContain("Project Alpha");
              expect(pageText).toContain("Project Beta");
            },
            { timeout: 2000 },
          ),
        );
      }).pipe(runtime.runPromise);
    });

    it("keyboard navigation: type, arrow down, enter executes command", async () => {
      await Effect.gen(function* () {
        const { bufferId, windowId } =
          yield* Given.A_BUFFER_WITH_CHILDREN("Projects", [
            { text: "Project Alpha" },
            { text: "Project Beta" },
          ]);

        yield* setupBufferInApp(bufferId, windowId);
        render(() => <App />);

        // Wait for blocks to render
        yield* Effect.promise(() =>
          waitFor(
            () => {
              const blocks = document.querySelectorAll("[data-element-type='block']");
              expect(blocks.length).toBe(2);
            },
            { timeout: 2000 },
          ),
        );

        // When: Open command palette with Cmd+K
        yield* pressCommandK();
        yield* waitForCommandPalette();

        // When: Type "table" to filter commands
        yield* Effect.promise(() => userEvent.keyboard("table"));

        // Wait for filtered results and verify first item is selected
        yield* Effect.promise(() =>
          waitFor(
            () => {
              const items = document.querySelectorAll('[data-testid="command-item"]');
              expect(items.length).toBeGreaterThan(0);
              const firstItem = items[0];
              expect(firstItem, "First command item should exist").toBeTruthy();
              // First item should have the selected style (bg-sidebar-accent)
              expect(
                firstItem!.className,
                "First command should be selected initially",
              ).toContain("bg-sidebar-accent");
            },
            { timeout: 2000 },
          ),
        );

        // When: Press ArrowDown to move selection
        // (With only one command, selection stays on first item - this verifies ArrowDown doesn't break anything)
        yield* Effect.promise(() => userEvent.keyboard("{ArrowDown}"));

        // Verify the command is still selected after ArrowDown
        yield* Effect.sync(() => {
          const items = document.querySelectorAll('[data-testid="command-item"]');
          expect(items.length).toBeGreaterThan(0);
          // With one command, ArrowDown keeps it selected (clamped to max index)
          // Find the selected item
          const selectedItem = Array.from(items).find((item) =>
            item.className.includes("bg-sidebar-accent"),
          );
          expect(selectedItem, "A command should be selected after ArrowDown").toBeTruthy();
          expect(selectedItem?.textContent).toContain("Table");
        });

        // When: Press Enter to execute the selected command
        yield* Effect.promise(() => userEvent.keyboard("{Enter}"));

        // Then: Command palette should close
        yield* Effect.promise(() =>
          waitFor(
            () => {
              const palette = document.querySelector('[data-testid="command-palette"]');
              expect(palette, "Command palette should close after Enter").toBeFalsy();
            },
            { timeout: 2000 },
          ),
        );

        // Then: A table should be rendered (command executed successfully)
        yield* Effect.promise(() =>
          waitFor(
            () => {
              const table = document.querySelector("table");
              expect(table, "Table should be rendered after command execution").toBeTruthy();
            },
            { timeout: 2000 },
          ),
        );

        // Then: The table should display the child nodes
        yield* Effect.promise(() =>
          waitFor(
            () => {
              const tableText = document.querySelector("table")?.textContent;
              expect(tableText).toContain("Project Alpha");
              expect(tableText).toContain("Project Beta");
            },
            { timeout: 2000 },
          ),
        );
      }).pipe(runtime.runPromise);
    });
  });
});
