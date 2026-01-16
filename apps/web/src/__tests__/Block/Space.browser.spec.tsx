import "@/index.css";
import { Id } from "@/schema";
import { NodeT } from "@/services/domain/Node";
import { StoreT } from "@/services/external/Store";
import EditorBuffer from "@/ui/EditorBuffer";
import { Effect, Option } from "effect";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { waitFor } from "solid-testing-library";
import {
  Given,
  Then,
  When,
  setupClientTest,
  type BrowserRuntime,
} from "../bdd";

describe("Space in block selection mode", () => {
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

  it("creates sibling block after focused block and enters editing mode", async () => {
    await Effect.gen(function* () {
      const { bufferId, rootNodeId, childNodeIds, windowId } =
        yield* Given.A_BUFFER_WITH_CHILDREN("Root", [{ text: "First block" }]);

      const firstBlockId = Id.makeBlockId(bufferId, childNodeIds[0]);
      render(() => <EditorBuffer bufferId={bufferId} />);

      yield* When.USER_ENTERS_BLOCK_SELECTION(firstBlockId);

      const Store = yield* StoreT;

      yield* Effect.promise(() =>
        waitFor(
          async () => {
            const bufferDoc = await Store.getDocument("buffer", bufferId).pipe(
              runtime.runPromise,
            );
            expect(Option.isSome(bufferDoc)).toBe(true);
            expect(Option.getOrThrow(bufferDoc).selectedBlocks).toContain(
              childNodeIds[0],
            );
          },
          { timeout: 2000 },
        ),
      );

      yield* When.USER_PRESSES(" ");

      yield* Then.NODE_HAS_CHILDREN(rootNodeId, 2);

      const Node = yield* NodeT;
      const children = yield* Node.getNodeChildren(rootNodeId);

      expect(children[0]).toBe(childNodeIds[0]);

      const newNodeId = children[1]!;
      yield* Then.NODE_HAS_TEXT(newNodeId, "");

      yield* Effect.promise(() =>
        waitFor(
          async () => {
            const windowDoc = await Store.getDocument("window", windowId).pipe(
              runtime.runPromise,
            );
            expect(Option.isSome(windowDoc)).toBe(true);
            const activeEl = Option.getOrThrow(windowDoc).activeElement;
            expect(activeEl?.type).toBe("block");
          },
          { timeout: 2000 },
        ),
      );

      yield* Effect.promise(() =>
        waitFor(
          async () => {
            const bufferDoc = await Store.getDocument("buffer", bufferId).pipe(
              runtime.runPromise,
            );
            expect(Option.isSome(bufferDoc)).toBe(true);
            const buf = Option.getOrThrow(bufferDoc);
            expect(buf.selectedBlocks).toEqual([]);
          },
          { timeout: 2000 },
        ),
      );
    }).pipe(runtime.runPromise);
  });

  it("creates sibling at same level for nested blocks", async () => {
    await Effect.gen(function* () {
      const { bufferId, rootNodeId, childNodeIds } =
        yield* Given.A_BUFFER_WITH_CHILDREN("Root", [{ text: "Parent block" }]);

      const parentNodeId = childNodeIds[0];

      const nestedChild = yield* Given.INSERT_NODE_WITH_TEXT({
        parentId: parentNodeId,
        insert: "after",
        text: "Nested child",
      });

      const nestedBlockId = Id.makeBlockId(bufferId, nestedChild);
      render(() => <EditorBuffer bufferId={bufferId} />);

      yield* When.USER_ENTERS_BLOCK_SELECTION(nestedBlockId);

      const Store = yield* StoreT;

      yield* Effect.promise(() =>
        waitFor(
          async () => {
            const bufferDoc = await Store.getDocument("buffer", bufferId).pipe(
              runtime.runPromise,
            );
            expect(Option.isSome(bufferDoc)).toBe(true);
            expect(Option.getOrThrow(bufferDoc).selectedBlocks).toContain(
              nestedChild,
            );
          },
          { timeout: 2000 },
        ),
      );

      yield* When.USER_PRESSES(" ");

      const Node = yield* NodeT;

      yield* Then.NODE_HAS_CHILDREN(rootNodeId, 1);

      yield* Then.NODE_HAS_CHILDREN(parentNodeId, 2);

      const parentChildren = yield* Node.getNodeChildren(parentNodeId);
      expect(parentChildren[0]).toBe(nestedChild);
      const newSibling = parentChildren[1]!;
      yield* Then.NODE_HAS_TEXT(newSibling, "");
    }).pipe(runtime.runPromise);
  });
});
