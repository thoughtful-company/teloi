import "@/index.css";
import { Id } from "@/schema";
import EditorBuffer from "@/ui/EditorBuffer";
import { userEvent } from "@vitest/browser/context";
import { Effect } from "effect";
import { waitFor } from "solid-testing-library";
import { describe, expect, it } from "vitest";
import { Given, render, runtime } from "../bdd";

describe("Block Enter key", () => {
  it("creates new empty sibling when Enter pressed at end of text", async () => {
    await Effect.gen(function* () {
      const { bufferId, childNodeIds } = yield* Given.A_BUFFER_WITH_CHILDREN(
        "Root node",
        [{ text: "First child" }],
      );

      const firstChildBlockId = Id.makeBlockId(bufferId, childNodeIds[0]);

      const { waitForElement } = render(() => (
        <EditorBuffer bufferId={bufferId} />
      ));

      const blockElement = yield* waitForElement(
        `[data-element-id="${firstChildBlockId}"]`,
      );

      yield* Effect.promise(() => userEvent.click(blockElement));

      yield* Effect.promise(() => userEvent.keyboard("{Enter}"));

      yield* Effect.promise(() =>
        waitFor(
          () => {
            const allBlocks = document.querySelectorAll(
              "[data-element-type='block']",
            );

            expect(allBlocks.length).toBe(2);
          },
          { timeout: 3000 },
        ),
      );
    }).pipe(runtime.runPromise);
  });
});
