import "@/index.css";
import { Id, System } from "@/schema";
import { NodeT } from "@/services/domain/Node";
import { TypeT } from "@/services/domain/Type";
import { YjsT } from "@/services/external/Yjs";
import { TypePickerT } from "@/services/ui/TypePicker";
import EditorBuffer from "@/ui/EditorBuffer";
import { Effect } from "effect";
import { describe, expect, it } from "vitest";
import { Given, render, runtime, Then, When } from "./bdd";
import { waitFor } from "solid-testing-library";

describe("TypePicker", () => {
  describe("Opening the picker", () => {
    it("shows picker popup when # is typed", async () => {
      await Effect.gen(function* () {
        const { bufferId, childNodeIds } = yield* Given.A_BUFFER_WITH_CHILDREN(
          "Root node",
          [{ text: "Hello" }],
        );

        const firstChildBlockId = Id.makeBlockId(bufferId, childNodeIds[0]);

        render(() => <EditorBuffer bufferId={bufferId} />);

        yield* When.USER_CLICKS_BLOCK(firstChildBlockId);
        yield* When.USER_PRESSES("#");

        yield* Effect.promise(() =>
          waitFor(
            () => {
              const picker = document.querySelector("[data-testid='type-picker']");
              expect(picker).toBeTruthy();
            },
            { timeout: 2000 },
          ),
        );
      }).pipe(runtime.runPromise);
    });

    it("shows picker popup when # is typed in empty block", async () => {
      await Effect.gen(function* () {
        const { bufferId, childNodeIds } = yield* Given.A_BUFFER_WITH_CHILDREN(
          "Root node",
          [{ text: "" }],
        );

        const firstChildBlockId = Id.makeBlockId(bufferId, childNodeIds[0]);

        render(() => <EditorBuffer bufferId={bufferId} />);

        yield* When.USER_CLICKS_BLOCK(firstChildBlockId);
        yield* When.USER_PRESSES("#");

        yield* Effect.promise(() =>
          waitFor(
            () => {
              const picker = document.querySelector("[data-testid='type-picker']");
              expect(picker).toBeTruthy();
            },
            { timeout: 2000 },
          ),
        );
      }).pipe(runtime.runPromise);
    });
  });

  describe("Filtering types", () => {
    it("filters types as user types after #", async () => {
      await Effect.gen(function* () {
        // Create some types first
        const TypePicker = yield* TypePickerT;
        yield* TypePicker.createType("Page");
        yield* TypePicker.createType("Project");

        const { bufferId, childNodeIds } = yield* Given.A_BUFFER_WITH_CHILDREN(
          "Root node",
          [{ text: "Hello" }],
        );

        const firstChildBlockId = Id.makeBlockId(bufferId, childNodeIds[0]);

        render(() => <EditorBuffer bufferId={bufferId} />);

        yield* When.USER_CLICKS_BLOCK(firstChildBlockId);
        yield* When.USER_PRESSES("#pa");

        yield* Effect.promise(() =>
          waitFor(
            () => {
              const picker = document.querySelector("[data-testid='type-picker']");
              expect(picker).toBeTruthy();
              // Should show "Page" but not "Project"
              const items = picker!.querySelectorAll("button");
              const texts = Array.from(items).map((btn) => btn.textContent);
              expect(texts.some((t) => t?.includes("Page"))).toBe(true);
            },
            { timeout: 2000 },
          ),
        );
      }).pipe(runtime.runPromise);
    });

    it("shows Create option when no exact match", async () => {
      await Effect.gen(function* () {
        const { bufferId, childNodeIds } = yield* Given.A_BUFFER_WITH_CHILDREN(
          "Root node",
          [{ text: "Hello" }],
        );

        const firstChildBlockId = Id.makeBlockId(bufferId, childNodeIds[0]);

        render(() => <EditorBuffer bufferId={bufferId} />);

        yield* When.USER_CLICKS_BLOCK(firstChildBlockId);
        yield* When.USER_PRESSES("#newtype");

        yield* Effect.promise(() =>
          waitFor(
            () => {
              const picker = document.querySelector("[data-testid='type-picker']");
              expect(picker).toBeTruthy();
              const createOption = picker!.querySelector("button");
              expect(createOption?.textContent).toContain("Create");
              expect(createOption?.textContent).toContain("#newtype");
            },
            { timeout: 2000 },
          ),
        );
      }).pipe(runtime.runPromise);
    });
  });

  describe("Selecting a type", () => {
    it("applies type and removes # text when Enter is pressed", async () => {
      await Effect.gen(function* () {
        // Create a type with unique name to avoid conflicts with other test runs
        const uniqueTypeName = `TestType_${Date.now()}`;
        const TypePicker = yield* TypePickerT;
        const typeId = yield* TypePicker.createType(uniqueTypeName);

        const { bufferId, childNodeIds } = yield* Given.A_BUFFER_WITH_CHILDREN(
          "Root node",
          [{ text: "Hello" }],
        );

        const firstChildBlockId = Id.makeBlockId(bufferId, childNodeIds[0]);
        const childNodeId = childNodeIds[0];

        render(() => <EditorBuffer bufferId={bufferId} />);

        yield* When.USER_CLICKS_BLOCK(firstChildBlockId);

        // Type # to open picker
        yield* When.USER_PRESSES("#");

        yield* Effect.promise(() =>
          waitFor(
            () => {
              const picker = document.querySelector("[data-testid='type-picker']");
              if (!picker) throw new Error("Picker not found");
              const buttons = picker.querySelectorAll("button");
              if (buttons.length === 0) throw new Error("Types not loaded yet");
            },
            { timeout: 2000 },
          ),
        );

        // Type "test" to filter (matches our unique TestType_xxx name)
        yield* When.USER_PRESSES("test");

        // Wait for the text to update AND picker to show filtered result
        yield* Effect.promise(() =>
          waitFor(
            () => {
              const Yjs = runtime.runSync(YjsT);
              const text = Yjs.getText(childNodeId).toString();
              if (!text.includes("#test")) throw new Error("Text not updated: " + text);
              // Verify the picker shows our unique type
              const picker = document.querySelector("[data-testid='type-picker']");
              if (!picker) throw new Error("Picker closed unexpectedly");
              const buttons = picker.querySelectorAll("button");
              const hasType = Array.from(buttons).some((btn) =>
                btn.textContent?.includes(uniqueTypeName),
              );
              if (!hasType) throw new Error(`${uniqueTypeName} not showing in filtered list`);
            },
            { timeout: 2000 },
          ),
        );

        // Press Enter to select the first filtered type
        yield* When.USER_PRESSES("{Enter}");

        // Type should be applied
        yield* Effect.promise(() =>
          waitFor(
            async () => {
              const Type = await TypeT.pipe(runtime.runPromise);
              const hasType = await Type.hasType(childNodeId, typeId).pipe(
                runtime.runPromise,
              );
              expect(hasType).toBe(true);
            },
            { timeout: 2000 },
          ),
        );

        // # text should be removed
        yield* Then.NODE_HAS_TEXT(childNodeId, "Hello");

        // Picker should be closed
        yield* Effect.promise(() =>
          waitFor(
            () => {
              const picker = document.querySelector("[data-testid='type-picker']");
              expect(picker).toBeFalsy();
            },
            { timeout: 2000 },
          ),
        );
      }).pipe(runtime.runPromise);
    });

    it("creates and applies new type when selecting Create option", async () => {
      await Effect.gen(function* () {
        const { bufferId, childNodeIds } = yield* Given.A_BUFFER_WITH_CHILDREN(
          "Root node",
          [{ text: "Hello" }],
        );

        const firstChildBlockId = Id.makeBlockId(bufferId, childNodeIds[0]);
        const childNodeId = childNodeIds[0];

        render(() => <EditorBuffer bufferId={bufferId} />);

        yield* When.USER_CLICKS_BLOCK(firstChildBlockId);
        yield* When.USER_PRESSES("#mytag");

        // Wait for picker
        yield* Effect.promise(() =>
          waitFor(
            () => {
              const picker = document.querySelector("[data-testid='type-picker']");
              if (!picker) throw new Error("Picker not found");
            },
            { timeout: 2000 },
          ),
        );

        // Press Enter to create and select
        yield* When.USER_PRESSES("{Enter}");

        // Check that a new type was created under System.TYPES
        yield* Effect.promise(() =>
          waitFor(
            async () => {
              const Node = await NodeT.pipe(runtime.runPromise);
              const Yjs = await YjsT.pipe(runtime.runPromise);
              const typeChildren = await Node.getNodeChildren(System.TYPES).pipe(
                runtime.runPromise,
              );
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
      }).pipe(runtime.runPromise);
    });
  });

  describe("Closing the picker", () => {
    it("closes picker when Escape is pressed", async () => {
      await Effect.gen(function* () {
        const { bufferId, childNodeIds } = yield* Given.A_BUFFER_WITH_CHILDREN(
          "Root node",
          [{ text: "Hello" }],
        );

        const firstChildBlockId = Id.makeBlockId(bufferId, childNodeIds[0]);

        render(() => <EditorBuffer bufferId={bufferId} />);

        yield* When.USER_CLICKS_BLOCK(firstChildBlockId);
        yield* When.USER_PRESSES("#test");

        // Wait for picker to show
        yield* Effect.promise(() =>
          waitFor(
            () => {
              const picker = document.querySelector("[data-testid='type-picker']");
              if (!picker) throw new Error("Picker not found");
            },
            { timeout: 2000 },
          ),
        );

        // Press Escape
        yield* When.USER_PRESSES("{Escape}");

        // Picker should be closed
        yield* Effect.promise(() =>
          waitFor(
            () => {
              const picker = document.querySelector("[data-testid='type-picker']");
              expect(picker).toBeFalsy();
            },
            { timeout: 2000 },
          ),
        );
      }).pipe(runtime.runPromise);
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

        render(() => <EditorBuffer bufferId={bufferId} />);

        // Type badge should be visible
        yield* Effect.promise(() =>
          waitFor(
            () => {
              const allText = document.body.textContent;
              expect(allText).toContain("Important");
            },
            { timeout: 2000 },
          ),
        );
      }).pipe(runtime.runPromise);
    });
  });
});

describe("TypePickerT Service", () => {
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
    }).pipe(runtime.runPromise);
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
    }).pipe(runtime.runPromise);
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
    }).pipe(runtime.runPromise);
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
    }).pipe(runtime.runPromise);
  });
});
