import "@/index.css";
import { System } from "@/schema";
import { NodeT } from "@/services/domain/Node";
import { TypeT } from "@/services/domain/Type";
import { YjsT } from "@/services/external/Yjs";
import { TypePickerT } from "@/services/ui/TypePicker";
import EditorBuffer from "@/ui/EditorBuffer";
import { Effect } from "effect";
import { waitFor } from "solid-testing-library";
import { describe, expect, it } from "vitest";
import { Given, render, runtime, Then, When } from "./bdd";

describe("TypePicker in Title", () => {
  describe("Opening the picker", () => {
    it("shows picker popup when # is typed in title", async () => {
      await Effect.gen(function* () {
        const { bufferId } = yield* Given.A_BUFFER_WITH_CHILDREN("Root node", [
          { text: "Child" },
        ]);

        render(() => <EditorBuffer bufferId={bufferId} />);

        yield* When.USER_CLICKS_TITLE(bufferId);
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

        render(() => <EditorBuffer bufferId={bufferId} />);

        yield* When.USER_CLICKS_TITLE(bufferId);

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

        // Type "title" to filter (matches our unique TitleType_xxx name)
        yield* When.USER_PRESSES("title");

        yield* Effect.promise(() =>
          waitFor(
            () => {
              const Yjs = runtime.runSync(YjsT);
              const text = Yjs.getText(rootNodeId).toString();
              if (!text.includes("#title"))
                throw new Error("Text not updated: " + text);
              const picker = document.querySelector("[data-testid='type-picker']");
              if (!picker) throw new Error("Picker closed unexpectedly");
              const buttons = picker.querySelectorAll("button");
              const hasType = Array.from(buttons).some((btn) =>
                btn.textContent?.includes(uniqueTypeName),
              );
              if (!hasType)
                throw new Error(`${uniqueTypeName} not showing in filtered list`);
            },
            { timeout: 2000 },
          ),
        );

        // Press Enter to select the first filtered type
        yield* When.USER_PRESSES("{Enter}");

        // Type should be applied to the root node (title)
        yield* Effect.promise(() =>
          waitFor(
            async () => {
              const Type = await TypeT.pipe(runtime.runPromise);
              const hasType = await Type.hasType(rootNodeId, typeId).pipe(
                runtime.runPromise,
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

    it("creates and applies new type from title", async () => {
      await Effect.gen(function* () {
        const { bufferId, rootNodeId } = yield* Given.A_BUFFER_WITH_CHILDREN(
          "My Title",
          [{ text: "Child" }],
        );

        render(() => <EditorBuffer bufferId={bufferId} />);

        yield* When.USER_CLICKS_TITLE(bufferId);
        yield* When.USER_PRESSES("#newtitletag");

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
              expect(typeNames).toContain("newtitletag");
            },
            { timeout: 2000 },
          ),
        );

        // # text should be removed
        yield* Then.NODE_HAS_TEXT(rootNodeId, "My Title");
      }).pipe(runtime.runPromise);
    });
  });

  describe("Closing the picker", () => {
    it("closes picker when Escape is pressed in title", async () => {
      await Effect.gen(function* () {
        const { bufferId } = yield* Given.A_BUFFER_WITH_CHILDREN("My Title", [
          { text: "Child" },
        ]);

        render(() => <EditorBuffer bufferId={bufferId} />);

        yield* When.USER_CLICKS_TITLE(bufferId);
        yield* When.USER_PRESSES("#test");

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

        render(() => <EditorBuffer bufferId={bufferId} />);

        // Type badge should be visible below title
        yield* Effect.promise(() =>
          waitFor(
            () => {
              const allText = document.body.textContent;
              expect(allText).toContain("TitleTag");
            },
            { timeout: 2000 },
          ),
        );
      }).pipe(runtime.runPromise);
    });
  });
});
