import "@/index.css";
import { Id } from "@/schema";
import { TypeT } from "@/services/domain/Type";
import { AutomergeT } from "@/services/external/Automerge";
import { PropertyT } from "@/services/ui/Property";
import PropertySection from "@/ui/PropertySection";
import {
  Given,
  setupClientTest,
  type BrowserRuntime,
  When,
} from "@/test-utils/bdd";
import { doubleRaf } from "@/utils/effect";
import { Effect } from "effect";
import { waitFor } from "solid-testing-library";
import { beforeEach, describe, expect, it } from "vitest";

describe("PropertySection", () => {
  let runtime: BrowserRuntime;
  let render: Awaited<ReturnType<typeof setupClientTest>>["render"];
  let cleanup: () => Promise<void>;

  beforeEach(async () => {
    if (cleanup) await cleanup();
    const setup = await setupClientTest();
    runtime = setup.runtime;
    render = setup.render;
    cleanup = setup.cleanup;
  });

  const waitForElement = (selector: string) =>
    Effect.promise(() =>
      waitFor(
        () => {
          const el = document.querySelector(selector);
          expect(el).toBeTruthy();
        },
        { timeout: 2000 },
      ),
    );

  describe("property title editor", () => {
    it("mounts a focused CodeMirror editor in .property-name when enterKhoraEditing targets the title khora", async () => {
      await Effect.gen(function* () {
        const { frameId, rootNodeId } = yield* Given.A_FRAME_WITH_CHILDREN(
          "Page",
          [],
        );
        const propertyId = yield* Given.A_PROPERTY_WITH_TEXT("name");
        const titleKhoraId = Id.makePropertyTitleKhoraId(
          frameId,
          rootNodeId,
          propertyId,
        );

        render(() => (
          <PropertySection
            propertyId={propertyId}
            pageId={rootNodeId}
            frameId={frameId}
          />
        ));

        yield* waitForElement(`[data-element-id="${titleKhoraId}"]`);

        yield* Given.KHORA_IS_FOCUSED_AT(titleKhoraId, 0);
        yield* doubleRaf;

        const editor = document.querySelector(
          ".property-name .cm-editor.cm-focused",
        );
        expect(editor).toBeTruthy();
      }).pipe(runtime.runPromise);
    });

    it("persists typing into the focused property title to Automerge at propertyId", async () => {
      await Effect.gen(function* () {
        const Automerge = yield* AutomergeT;

        const { frameId, rootNodeId } = yield* Given.A_FRAME_WITH_CHILDREN(
          "Page",
          [],
        );
        const propertyId = yield* Given.A_PROPERTY_WITH_TEXT("");
        const titleKhoraId = Id.makePropertyTitleKhoraId(
          frameId,
          rootNodeId,
          propertyId,
        );

        render(() => (
          <PropertySection
            propertyId={propertyId}
            pageId={rootNodeId}
            frameId={frameId}
          />
        ));

        yield* waitForElement(`[data-element-id="${titleKhoraId}"]`);
        yield* Given.KHORA_IS_FOCUSED_AT(titleKhoraId, 0);
        yield* doubleRaf;

        yield* When.USER_PRESSES("hello");
        yield* doubleRaf;

        const text = yield* Automerge.getText(propertyId);
        expect(text).toBe("hello");
      }).pipe(runtime.runPromise);
    });
  });

  it("does not render inline type badges for a typed property title", async () => {
    await Effect.gen(function* () {
      const Type = yield* TypeT;

      const { frameId, rootNodeId } = yield* Given.A_FRAME_WITH_CHILDREN(
        "Page",
        [],
      );
      const propertyId = yield* Given.A_PROPERTY_WITH_TEXT("name");
      const { typeId } = yield* Given.A_TYPE_WITHOUT_COLOR();
      yield* Type.addType(propertyId, typeId);
      const titleKhoraId = Id.makePropertyTitleKhoraId(
        frameId,
        rootNodeId,
        propertyId,
      );

      render(() => (
        <PropertySection
          propertyId={propertyId}
          pageId={rootNodeId}
          frameId={frameId}
        />
      ));

      yield* waitForElement(`[data-element-id="${titleKhoraId}"]`);
      yield* doubleRaf;

      expect(
        document.querySelector(".property-name .group.inline-flex.items-baseline"),
      ).toBeNull();
    }).pipe(runtime.runPromise);
  });

  describe("linked block rendering and editor", () => {
    const setupLinkedBlock = () =>
      Effect.gen(function* () {
        const Property = yield* PropertyT;
        const Automerge = yield* AutomergeT;

        const { frameId, rootNodeId } = yield* Given.A_FRAME_WITH_CHILDREN(
          "Teloi",
          [],
        );
        const propertyId = yield* Given.A_PROPERTY_WITH_TEXT("Priority");

        const { nodeId: linkedNodeId, tupleId } =
          yield* Property.quickCreateTupleType(propertyId, rootNodeId);
        yield* Automerge.setText(linkedNodeId, "High");

        const linkedKhoraId = Id.makePropertyKhoraId(
          frameId,
          rootNodeId,
          propertyId,
          tupleId,
        );

        return { frameId, rootNodeId, propertyId, linkedKhoraId };
      });

    it("renders unfocused linked block text from the linked node, not blank and not the host page text", async () => {
      await Effect.gen(function* () {
        const { frameId, rootNodeId, propertyId, linkedKhoraId } =
          yield* setupLinkedBlock();

        render(() => (
          <PropertySection
            propertyId={propertyId}
            pageId={rootNodeId}
            frameId={frameId}
          />
        ));

        yield* waitForElement(`[data-element-id="${linkedKhoraId}"]`);
        yield* doubleRaf;

        yield* Effect.promise(() =>
          waitFor(
            () => {
              const block = document.querySelector(
                `[data-element-id="${linkedKhoraId}"]`,
              );
              expect(block).toBeTruthy();

              const text = block?.textContent ?? "";
              expect(text).toContain("High");
              expect(text).not.toContain("Teloi");
            },
            { timeout: 2000 },
          ),
        );
      }).pipe(runtime.runPromise);
    });

    it("binds a focused linked block editor to the linked node text, not the host page text", async () => {
      await Effect.gen(function* () {
        const { frameId, rootNodeId, propertyId, linkedKhoraId } =
          yield* setupLinkedBlock();

        render(() => (
          <PropertySection
            propertyId={propertyId}
            pageId={rootNodeId}
            frameId={frameId}
          />
        ));

        yield* waitForElement(`[data-element-id="${linkedKhoraId}"]`);
        yield* Given.KHORA_IS_FOCUSED_AT(linkedKhoraId, 0);
        yield* doubleRaf;

        yield* Effect.promise(() =>
          waitFor(
            () => {
              const editor = document.querySelector(
                `[data-element-id="${linkedKhoraId}"] .cm-editor.cm-focused`,
              );
              expect(editor).toBeTruthy();

              const text = editor?.textContent ?? "";
              expect(text).toContain("High");
              expect(text).not.toContain("Teloi");
            },
            { timeout: 2000 },
          ),
        );
      }).pipe(runtime.runPromise);
    });
  });
});
