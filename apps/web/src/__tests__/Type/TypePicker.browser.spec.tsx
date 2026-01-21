import "@/index.css";
import { Id, System } from "@/schema";
import { NodeT } from "@/services/domain/Node";
import { TypeT } from "@/services/domain/Type";
import { YjsT } from "@/services/external/Yjs";
import { TypePickerT } from "@/services/ui/TypePicker";
import EditorBuffer from "@/ui/EditorBuffer";
import { waitFor } from "@testing-library/dom";
import { Effect } from "effect";
import { waitFor as stlWaitFor } from "solid-testing-library";
import { beforeEach, describe, expect, it } from "vitest";
import {
  Given,
  setupClientTest,
  Then,
  When,
  type BrowserRuntime,
} from "../bdd";

describe("TypePicker", () => {
  let testRuntime: BrowserRuntime;
  let testRender: Awaited<ReturnType<typeof setupClientTest>>["render"];
  let cleanup: () => Promise<void>;

  beforeEach(async () => {
    await cleanup?.();
    const setup = await setupClientTest();
    testRuntime = setup.runtime;
    testRender = setup.render;
    cleanup = setup.cleanup;
  });

  describe("In Block", () => {
    describe("Opening the picker", () => {
      it("shows picker popup when # is typed", async () => {
        await Effect.gen(function* () {
          const { bufferId, childNodeIds } =
            yield* Given.A_BUFFER_WITH_CHILDREN("Root node", [
              { text: "Hello" },
            ]);

          const firstChildBlockId = Id.makeBlockId(bufferId, childNodeIds[0]);

          testRender(() => <EditorBuffer bufferId={bufferId} />);

          yield* When.USER_CLICKS_BLOCK(firstChildBlockId);
          yield* When.USER_PRESSES("#");

          yield* Then.TYPE_PICKER_IS_VISIBLE();
        }).pipe(testRuntime.runPromise);
      });

      it("shows picker popup when # is typed in empty block", async () => {
        await Effect.gen(function* () {
          const { bufferId, childNodeIds } =
            yield* Given.A_BUFFER_WITH_CHILDREN("Root node", [{ text: "" }]);

          const firstChildBlockId = Id.makeBlockId(bufferId, childNodeIds[0]);

          testRender(() => <EditorBuffer bufferId={bufferId} />);

          yield* When.USER_CLICKS_BLOCK(firstChildBlockId);
          yield* When.USER_PRESSES("#");

          yield* Then.TYPE_PICKER_IS_VISIBLE();
        }).pipe(testRuntime.runPromise);
      });
    });

    describe("Filtering types", () => {
      it("filters types as user types after #", async () => {
        await Effect.gen(function* () {
          // Create some types first
          const TypePicker = yield* TypePickerT;
          yield* TypePicker.createType("Page");
          yield* TypePicker.createType("Project");

          const { bufferId, childNodeIds } =
            yield* Given.A_BUFFER_WITH_CHILDREN("Root node", [
              { text: "Hello" },
            ]);

          const firstChildBlockId = Id.makeBlockId(bufferId, childNodeIds[0]);

          testRender(() => <EditorBuffer bufferId={bufferId} />);

          yield* When.USER_CLICKS_BLOCK(firstChildBlockId);
          yield* When.USER_PRESSES("#pa");

          yield* Then.TYPE_PICKER_HAS_OPTION("Page");
        }).pipe(testRuntime.runPromise);
      });

      it("shows Create option when no exact match", async () => {
        await Effect.gen(function* () {
          const { bufferId, childNodeIds } =
            yield* Given.A_BUFFER_WITH_CHILDREN("Root node", [
              { text: "Hello" },
            ]);

          const firstChildBlockId = Id.makeBlockId(bufferId, childNodeIds[0]);

          testRender(() => <EditorBuffer bufferId={bufferId} />);

          yield* When.USER_CLICKS_BLOCK(firstChildBlockId);
          yield* When.USER_PRESSES("#newtype");

          yield* Then.TYPE_PICKER_SHOWS_CREATE("newtype");
        }).pipe(testRuntime.runPromise);
      });
    });

    describe("Selecting a type", () => {
      it("applies type and removes # text when Enter is pressed", async () => {
        await Effect.gen(function* () {
          // Create a type with unique name to avoid conflicts with other test runs
          const uniqueTypeName = `TestType_${Date.now()}`;
          const TypePicker = yield* TypePickerT;
          const typeId = yield* TypePicker.createType(uniqueTypeName);

          const { bufferId, childNodeIds } =
            yield* Given.A_BUFFER_WITH_CHILDREN("Root node", [
              { text: "Hello" },
            ]);

          const firstChildBlockId = Id.makeBlockId(bufferId, childNodeIds[0]);
          const childNodeId = childNodeIds[0];

          testRender(() => <EditorBuffer bufferId={bufferId} />);

          yield* When.USER_CLICKS_BLOCK(firstChildBlockId);

          yield* When.USER_PRESSES("#");

          yield* When.TYPE_PICKER_OPENS();

          // Type "test" to filter (matches our unique TestType_xxx name)
          yield* When.USER_PRESSES("test");

          // Wait for the text to update AND picker to show filtered result
          // Get Yjs service from our runtime for use in waitFor callback
          const Yjs = yield* YjsT;
          yield* Effect.promise(() =>
            waitFor(
              () => {
                const text = Yjs.getText(childNodeId).toString();
                if (!text.includes("#test"))
                  throw new Error("Text not updated: " + text);
                // Verify the picker shows our unique type
                const picker = document.querySelector(
                  "[data-testid='type-picker']",
                );
                if (!picker) throw new Error("Picker closed unexpectedly");
                const buttons = picker.querySelectorAll("button");
                const hasType = Array.from(buttons).some((btn) =>
                  btn.textContent?.includes(uniqueTypeName),
                );
                if (!hasType)
                  throw new Error(
                    `${uniqueTypeName} not showing in filtered list`,
                  );
              },
              { timeout: 2000 },
            ),
          );

          // Press Enter to select the first filtered type
          yield* When.USER_PRESSES("{Enter}");

          // Type should be applied
          const Type = yield* TypeT;
          yield* Effect.promise(() =>
            waitFor(
              async () => {
                const hasType = await Type.hasType(childNodeId, typeId).pipe(
                  testRuntime.runPromise,
                );
                expect(hasType).toBe(true);
              },
              { timeout: 2000 },
            ),
          );

          // # text should be removed
          yield* Then.NODE_HAS_TEXT(childNodeId, "Hello");

          yield* Then.TYPE_PICKER_IS_CLOSED();
        }).pipe(testRuntime.runPromise);
      });

      it("creates and applies new type when selecting Create option", async () => {
        await Effect.gen(function* () {
          const { bufferId, childNodeIds } =
            yield* Given.A_BUFFER_WITH_CHILDREN("Root node", [
              { text: "Hello" },
            ]);

          const firstChildBlockId = Id.makeBlockId(bufferId, childNodeIds[0]);
          const childNodeId = childNodeIds[0];

          testRender(() => <EditorBuffer bufferId={bufferId} />);

          yield* When.USER_CLICKS_BLOCK(firstChildBlockId);
          yield* When.USER_PRESSES("#mytag");

          yield* When.TYPE_PICKER_OPENS();

          // Press Enter to create and select
          yield* When.USER_PRESSES("{Enter}");

          // Check that a new type was created under System.TYPES
          // Get services from our runtime for use in waitFor callback
          const Node = yield* NodeT;
          const Yjs = yield* YjsT;
          yield* Effect.promise(() =>
            waitFor(
              async () => {
                const typeChildren = await Node.getNodeChildren(
                  System.TYPES,
                ).pipe(testRuntime.runPromise);
                const typeNames = typeChildren.map((id) =>
                  Yjs.getText(id).toString(),
                );
                expect(typeNames).toContain("mytag");
              },
              { timeout: 2000 },
            ),
          );

          // # text should be removed
          yield* Then.NODE_HAS_TEXT(childNodeId, "Hello");
        }).pipe(testRuntime.runPromise);
      });
    });

    describe("Closing the picker", () => {
      it("closes picker when Escape is pressed", async () => {
        await Effect.gen(function* () {
          const { bufferId, childNodeIds } =
            yield* Given.A_BUFFER_WITH_CHILDREN("Root node", [
              { text: "Hello" },
            ]);

          const firstChildBlockId = Id.makeBlockId(bufferId, childNodeIds[0]);

          testRender(() => <EditorBuffer bufferId={bufferId} />);

          yield* When.USER_CLICKS_BLOCK(firstChildBlockId);
          yield* When.USER_PRESSES("#test");

          yield* When.TYPE_PICKER_OPENS();

          yield* When.USER_PRESSES("{Escape}");

          yield* Then.TYPE_PICKER_IS_CLOSED();
        }).pipe(testRuntime.runPromise);
      });

      it("closes picker when # is deleted", async () => {
        await Effect.gen(function* () {
          const { bufferId, childNodeIds } =
            yield* Given.A_BUFFER_WITH_CHILDREN("Root node", [{ text: "" }]);

          const firstChildBlockId = Id.makeBlockId(bufferId, childNodeIds[0]);

          testRender(() => <EditorBuffer bufferId={bufferId} />);

          yield* When.USER_CLICKS_BLOCK(firstChildBlockId);
          yield* When.USER_PRESSES("#");

          yield* When.TYPE_PICKER_OPENS();

          yield* When.USER_PRESSES("{Backspace}");

          yield* Then.TYPE_PICKER_IS_CLOSED();
        }).pipe(testRuntime.runPromise);
      });

      it("closes picker when space is typed", async () => {
        await Effect.gen(function* () {
          const { bufferId, childNodeIds } =
            yield* Given.A_BUFFER_WITH_CHILDREN("Root node", [{ text: "" }]);

          const firstChildBlockId = Id.makeBlockId(bufferId, childNodeIds[0]);

          testRender(() => <EditorBuffer bufferId={bufferId} />);

          yield* When.USER_CLICKS_BLOCK(firstChildBlockId);
          yield* When.USER_PRESSES("#foo");

          yield* When.TYPE_PICKER_OPENS();

          yield* When.USER_PRESSES(" ");

          yield* Then.TYPE_PICKER_IS_CLOSED();
        }).pipe(testRuntime.runPromise);
      });
    });

    describe("Type display", () => {
      it("displays applied types below title", async () => {
        await Effect.gen(function* () {
          // Create a type and apply it to the root node
          const TypePicker = yield* TypePickerT;
          const typeId = yield* TypePicker.createType("Important");

          const { bufferId, rootNodeId } = yield* Given.A_BUFFER_WITH_CHILDREN(
            "Root node",
            [{ text: "Child" }],
          );

          // Apply the type to the root node
          yield* TypePicker.applyType(rootNodeId, typeId);

          testRender(() => <EditorBuffer bufferId={bufferId} />);

          yield* Then.TEXT_IS_VISIBLE("Important");
        }).pipe(testRuntime.runPromise);
      });
    });
  });

  describe("In Title", () => {
    describe("Opening the picker", () => {
      it("shows picker popup when # is typed in title", async () => {
        await Effect.gen(function* () {
          const { bufferId } = yield* Given.A_BUFFER_WITH_CHILDREN(
            "Root node",
            [{ text: "Child" }],
          );

          testRender(() => <EditorBuffer bufferId={bufferId} />);

          yield* When.USER_CLICKS_TITLE(bufferId);
          yield* When.USER_PRESSES("#");

          yield* Effect.promise(() =>
            stlWaitFor(
              () => {
                const picker = document.querySelector(
                  "[data-testid='type-picker']",
                );
                expect(picker).toBeTruthy();
              },
              { timeout: 2000 },
            ),
          );
        }).pipe(testRuntime.runPromise);
      });
    });

    describe("Selecting a type", () => {
      it("applies type to title node and removes # text when Enter is pressed", async () => {
        await Effect.gen(function* () {
          const uniqueTypeName = `TitleType_${Date.now()}`;
          const TypePicker = yield* TypePickerT;
          const typeId = yield* TypePicker.createType(uniqueTypeName);

          const { bufferId, rootNodeId } = yield* Given.A_BUFFER_WITH_CHILDREN(
            "My Title",
            [{ text: "Child" }],
          );

          testRender(() => <EditorBuffer bufferId={bufferId} />);

          yield* When.USER_CLICKS_TITLE(bufferId);

          // Type # to open picker
          yield* When.USER_PRESSES("#");

          yield* Effect.promise(() =>
            stlWaitFor(
              () => {
                const picker = document.querySelector(
                  "[data-testid='type-picker']",
                );
                if (!picker) throw new Error("Picker not found");
                const buttons = picker.querySelectorAll("button");
                if (buttons.length === 0)
                  throw new Error("Types not loaded yet");
              },
              { timeout: 2000 },
            ),
          );

          // Type "title" to filter (matches our unique TitleType_xxx name)
          yield* When.USER_PRESSES("title");

          // Get Yjs service from our runtime for use in waitFor callback
          const Yjs = yield* YjsT;
          yield* Effect.promise(() =>
            stlWaitFor(
              () => {
                const text = Yjs.getText(rootNodeId).toString();
                if (!text.includes("#title"))
                  throw new Error("Text not updated: " + text);
                const picker = document.querySelector(
                  "[data-testid='type-picker']",
                );
                if (!picker) throw new Error("Picker closed unexpectedly");
                const buttons = picker.querySelectorAll("button");
                const hasType = Array.from(buttons).some((btn) =>
                  btn.textContent?.includes(uniqueTypeName),
                );
                if (!hasType)
                  throw new Error(
                    `${uniqueTypeName} not showing in filtered list`,
                  );
              },
              { timeout: 2000 },
            ),
          );

          // Press Enter to select the first filtered type
          yield* When.USER_PRESSES("{Enter}");

          // Type should be applied to the root node (title)
          const Type = yield* TypeT;
          yield* Effect.promise(() =>
            stlWaitFor(
              async () => {
                const hasType = await Type.hasType(rootNodeId, typeId).pipe(
                  testRuntime.runPromise,
                );
                expect(hasType).toBe(true);
              },
              { timeout: 2000 },
            ),
          );

          // # text should be removed, title should be back to original
          yield* Then.NODE_HAS_TEXT(rootNodeId, "My Title");

          // Picker should be closed
          yield* Effect.promise(() =>
            stlWaitFor(
              () => {
                const picker = document.querySelector(
                  "[data-testid='type-picker']",
                );
                expect(picker).toBeFalsy();
              },
              { timeout: 2000 },
            ),
          );
        }).pipe(testRuntime.runPromise);
      });

      it("creates and applies new type from title", async () => {
        await Effect.gen(function* () {
          const { bufferId, rootNodeId } = yield* Given.A_BUFFER_WITH_CHILDREN(
            "My Title",
            [{ text: "Child" }],
          );

          testRender(() => <EditorBuffer bufferId={bufferId} />);

          yield* When.USER_CLICKS_TITLE(bufferId);
          yield* When.USER_PRESSES("#newtitletag");

          yield* Effect.promise(() =>
            stlWaitFor(
              () => {
                const picker = document.querySelector(
                  "[data-testid='type-picker']",
                );
                if (!picker) throw new Error("Picker not found");
              },
              { timeout: 2000 },
            ),
          );

          // Press Enter to create and select
          yield* When.USER_PRESSES("{Enter}");

          // Check that a new type was created under System.TYPES
          // Get services from our runtime for use in waitFor callback
          const Node = yield* NodeT;
          const Yjs = yield* YjsT;
          yield* Effect.promise(() =>
            stlWaitFor(
              async () => {
                const typeChildren = await Node.getNodeChildren(
                  System.TYPES,
                ).pipe(testRuntime.runPromise);
                const typeNames = typeChildren.map((id) =>
                  Yjs.getText(id).toString(),
                );
                expect(typeNames).toContain("newtitletag");
              },
              { timeout: 2000 },
            ),
          );

          // # text should be removed
          yield* Then.NODE_HAS_TEXT(rootNodeId, "My Title");
        }).pipe(testRuntime.runPromise);
      });
    });

    describe("Closing the picker", () => {
      it("closes picker when Escape is pressed in title", async () => {
        await Effect.gen(function* () {
          const { bufferId } = yield* Given.A_BUFFER_WITH_CHILDREN("My Title", [
            { text: "Child" },
          ]);

          testRender(() => <EditorBuffer bufferId={bufferId} />);

          yield* When.USER_CLICKS_TITLE(bufferId);
          yield* When.USER_PRESSES("#test");

          yield* Effect.promise(() =>
            stlWaitFor(
              () => {
                const picker = document.querySelector(
                  "[data-testid='type-picker']",
                );
                if (!picker) throw new Error("Picker not found");
              },
              { timeout: 2000 },
            ),
          );

          // Press Escape
          yield* When.USER_PRESSES("{Escape}");

          // Picker should be closed
          yield* Effect.promise(() =>
            stlWaitFor(
              () => {
                const picker = document.querySelector(
                  "[data-testid='type-picker']",
                );
                expect(picker).toBeFalsy();
              },
              { timeout: 2000 },
            ),
          );
        }).pipe(testRuntime.runPromise);
      });
    });

    describe("Type display", () => {
      it("displays types applied to title in TypeList", async () => {
        await Effect.gen(function* () {
          const TypePicker = yield* TypePickerT;
          const typeId = yield* TypePicker.createType("TitleTag");

          const { bufferId, rootNodeId } = yield* Given.A_BUFFER_WITH_CHILDREN(
            "My Title",
            [{ text: "Child" }],
          );

          // Apply the type to the root node (title)
          yield* TypePicker.applyType(rootNodeId, typeId);

          testRender(() => <EditorBuffer bufferId={bufferId} />);

          // Type badge should be visible below title
          yield* Effect.promise(() =>
            stlWaitFor(
              () => {
                const allText = document.body.textContent;
                expect(allText).toContain("TitleTag");
              },
              { timeout: 2000 },
            ),
          );
        }).pipe(testRuntime.runPromise);
      });
    });
  });
});

describe("TypePicker scroll behavior", () => {
  let testRuntime: BrowserRuntime;
  let testRender: Awaited<ReturnType<typeof setupClientTest>>["render"];
  let cleanup: () => Promise<void>;

  beforeEach(async () => {
    await cleanup?.();
    const setup = await setupClientTest();
    testRuntime = setup.runtime;
    testRender = setup.render;
    cleanup = setup.cleanup;
  });

  /**
   * Verifies that scrolling is locked while TypePicker is open.
   *
   * When the picker is open, scroll attempts are blocked to keep
   * the popup anchored to the cursor position.
   */
  it("scroll should be locked while picker is open", async () => {
    await Effect.gen(function* () {
      // Create 20 blocks to make page scrollable
      const children = Array.from({ length: 20 }, (_, i) => ({
        text: `Block ${i + 1}: Content that takes up space`,
      }));

      const { bufferId, childNodeIds } = yield* Given.A_BUFFER_WITH_CHILDREN(
        "Root node with many children",
        children,
      );

      // Use the 15th block (near the bottom, needs scrolling to see)
      const targetBlockIndex = 14;
      const targetNodeId = childNodeIds[targetBlockIndex]!;
      const targetBlockId = Id.makeBlockId(bufferId, targetNodeId);

      testRender(() => (
        <div
          class="overflow-y-auto"
          style={{ height: "300px" }}
          data-testid="scroll-container"
        >
          <EditorBuffer bufferId={bufferId} />
        </div>
      ));

      // Get scroll container
      const scrollContainer = yield* Effect.promise(() =>
        waitFor(
          () => {
            const el = document.querySelector<HTMLElement>(
              "[data-testid='scroll-container']",
            );
            if (!el) throw new Error("Scroll container not found");
            return el;
          },
          { timeout: 2000 },
        ),
      );

      // Scroll down to make target block visible
      scrollContainer.scrollTop = 400;

      // Wait for scroll to settle
      yield* Effect.promise(
        () => new Promise((resolve) => setTimeout(resolve, 50)),
      );

      // Click the target block to focus it
      yield* When.USER_CLICKS_BLOCK(targetBlockId);

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

      // Type "#" to open the TypePicker
      yield* When.USER_PRESSES("#");

      // Wait for picker to appear
      yield* When.TYPE_PICKER_OPENS();

      const picker = document.querySelector<HTMLElement>(
        "[data-testid='type-picker']",
      );
      expect(picker).not.toBeNull();

      // Record scroll position before attempting to scroll
      const scrollBefore = scrollContainer.scrollTop;

      // Attempt to scroll the container while popup is open
      scrollContainer.scrollTop += 100;

      // Wait for scroll event to be processed
      yield* Effect.promise(
        () => new Promise((resolve) => setTimeout(resolve, 100)),
      );

      // Scroll should have been locked (reset to original position)
      expect(
        scrollContainer.scrollTop,
        "Scroll should be locked while picker is open",
      ).toBe(scrollBefore);

      // Picker should still be visible
      const pickerAfter = document.querySelector<HTMLElement>(
        "[data-testid='type-picker']",
      );
      expect(pickerAfter).not.toBeNull();
    }).pipe(testRuntime.runPromise);
  });
});

describe("TypePickerT Service", () => {
  let testRuntime: BrowserRuntime;
  let cleanup: () => Promise<void>;

  beforeEach(async () => {
    await cleanup?.();
    const setup = await setupClientTest();
    testRuntime = setup.runtime;
    cleanup = setup.cleanup;
  });

  it("getAvailableTypes returns children of Types node", async () => {
    await Effect.gen(function* () {
      const TypePicker = yield* TypePickerT;

      // Create some types
      yield* TypePicker.createType("TestType1");
      yield* TypePicker.createType("TestType2");

      const types = yield* TypePicker.getAvailableTypes();

      const names = types.map((t) => t.name);
      expect(names).toContain("TestType1");
      expect(names).toContain("TestType2");
    }).pipe(testRuntime.runPromise);
  });

  it("filterTypes matches case-insensitively", async () => {
    await Effect.gen(function* () {
      const TypePicker = yield* TypePickerT;

      const types = [
        { id: "a" as Id.Node, name: "Apple" },
        { id: "b" as Id.Node, name: "Banana" },
        { id: "c" as Id.Node, name: "apricot" },
      ];

      const filtered = TypePicker.filterTypes(types, "ap");

      expect(filtered.length).toBe(2);
      expect(filtered.map((t) => t.name)).toContain("Apple");
      expect(filtered.map((t) => t.name)).toContain("apricot");
    }).pipe(testRuntime.runPromise);
  });

  it("createType adds child to Types node", async () => {
    await Effect.gen(function* () {
      const TypePicker = yield* TypePickerT;
      const Node = yield* NodeT;
      const Yjs = yield* YjsT;

      const typeId = yield* TypePicker.createType("NewType");

      // Should be a child of System.TYPES
      const typeChildren = yield* Node.getNodeChildren(System.TYPES);
      expect(typeChildren).toContain(typeId);

      // Should have the correct text
      const ytext = Yjs.getText(typeId);
      expect(ytext.toString()).toBe("NewType");
    }).pipe(testRuntime.runPromise);
  });

  it("applyType adds type to node", async () => {
    await Effect.gen(function* () {
      const TypePicker = yield* TypePickerT;
      const Type = yield* TypeT;

      // Create a node
      const { childNodeIds } = yield* Given.A_BUFFER_WITH_CHILDREN("Root", [
        { text: "Test" },
      ]);

      const nodeId = childNodeIds[0];
      const typeId = yield* TypePicker.createType("TestType");

      // Apply type
      yield* TypePicker.applyType(nodeId, typeId);

      // Check it was applied
      const hasType = yield* Type.hasType(nodeId, typeId);
      expect(hasType).toBe(true);
    }).pipe(testRuntime.runPromise);
  });
});
