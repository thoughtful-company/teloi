import "@/index.css";
import { Id } from "@/schema";
import { AutomergeT } from "@/services/external/Automerge";
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

/**
 * Phase 3 integration: PropertySection must react to LiveStore focus state.
 * Dispatching Frame.enterKhoraEditing(propertyTitleKhoraId) should reactively
 * mount a focused CodeMirror editor inside .property-name, and typing into it
 * should persist to the property node's Automerge text.
 */
describe("PropertySection — property title editor", () => {
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
