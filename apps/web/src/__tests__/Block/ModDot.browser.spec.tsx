import "@/index.css";
import { Id } from "@/schema";
import { StoreT } from "@/services/external/Store";
import EditorBuffer from "@/ui/EditorBuffer";
import { Effect, Option } from "effect";
import { describe, it, expect, beforeEach } from "vitest";
import { waitFor } from "solid-testing-library";
import { Given, render, runtime, When } from "../bdd";

describe("Block Mod+. key", () => {
  beforeEach(() => {
    history.replaceState({}, "", "/");
  });

  it("zooms into focused block when Mod+. pressed", async () => {
    await Effect.gen(function* () {
      // Given: Full hierarchy with children (required for NavigationT)
      const { bufferId, childNodeIds } =
        yield* Given.A_FULL_HIERARCHY_WITH_CHILDREN("Root node", [
          { text: "First child" },
          { text: "Second child" },
        ]);

      const firstChildBlockId = Id.makeBlockId(bufferId, childNodeIds[0]);

      render(() => <EditorBuffer bufferId={bufferId} />);

      // When: User focuses first child and presses Mod+.
      yield* When.USER_CLICKS_BLOCK(firstChildBlockId);
      yield* When.USER_PRESSES("{Meta>}.{/Meta}");

      // Then: Buffer's assignedNodeId should be the first child's nodeId
      const Store = yield* StoreT;
      const bufferDoc = yield* Store.getDocument("buffer", bufferId);
      const buffer = Option.getOrThrow(bufferDoc);
      expect(buffer.assignedNodeId).toBe(childNodeIds[0]);

      // And: Title should now show "First child" (the zoomed-in node's text)
      yield* Effect.promise(() =>
        waitFor(
          () => {
            const title = document.querySelector("[data-element-type='title']");
            expect(title?.textContent).toBe("First child");
          },
          { timeout: 2000 },
        ),
      );
    }).pipe(runtime.runPromise);
  });

  it("updates URL to /workspace/{nodeId} when Mod+. pressed", async () => {
    await Effect.gen(function* () {
      // Given: Full hierarchy with children
      const { bufferId, childNodeIds } =
        yield* Given.A_FULL_HIERARCHY_WITH_CHILDREN("Root node", [
          { text: "First child" },
        ]);

      const firstChildBlockId = Id.makeBlockId(bufferId, childNodeIds[0]);

      render(() => <EditorBuffer bufferId={bufferId} />);

      // When: User focuses first child and presses Mod+.
      yield* When.USER_CLICKS_BLOCK(firstChildBlockId);
      yield* When.USER_PRESSES("{Meta>}.{/Meta}");

      // Then: URL should be updated
      expect(window.location.pathname).toBe(`/workspace/${childNodeIds[0]}`);
    }).pipe(runtime.runPromise);
  });
});
