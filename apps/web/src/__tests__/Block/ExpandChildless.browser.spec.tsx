import "@/index.css";
import { Id } from "@/schema";
import { NodeT } from "@/services/domain/Node";
import EditorBuffer from "@/ui/EditorBuffer";
import { userEvent } from "@vitest/browser/context";
import { Effect } from "effect";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  Given,
  Then,
  When,
  setupClientTest,
  type BrowserRuntime,
} from "../bdd";

describe("Block Cmd+Down on childless block", () => {
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

  it("Cmd+Down on childless block creates new child and focuses it", async () => {
    await Effect.gen(function* () {
      // Given: A block with no children
      const { bufferId, childNodeIds } = yield* Given.A_BUFFER_WITH_CHILDREN(
        "Root",
        [{ text: "Leaf block" }],
      );

      const leafNodeId = childNodeIds[0];
      const leafBlockId = Id.makeBlockId(bufferId, leafNodeId);

      render(() => <EditorBuffer bufferId={bufferId} />);

      // Focus on the leaf block
      yield* When.USER_CLICKS_BLOCK(leafBlockId);

      // When: Cmd+Down pressed
      yield* When.USER_PRESSES("{Meta>}{ArrowDown}{/Meta}");

      // Then: A new child block is created and focused
      const Node = yield* NodeT;
      const children = yield* Node.getNodeChildren(leafNodeId);
      expect(children.length).toBe(1);

      // The new child block should be focused
      const newChildBlockId = Id.makeBlockId(bufferId, children[0]!);
      yield* Then.SELECTION_IS_ON_BLOCK(newChildBlockId);
    }).pipe(runtime.runPromise);
  });

  it("new child from Cmd+Down is a real node in the tree", async () => {
    await Effect.gen(function* () {
      // Given: A block with no children
      const { bufferId, childNodeIds } = yield* Given.A_BUFFER_WITH_CHILDREN(
        "Root",
        [{ text: "Parent" }],
      );

      const parentNodeId = childNodeIds[0];
      const parentBlockId = Id.makeBlockId(bufferId, parentNodeId);

      render(() => <EditorBuffer bufferId={bufferId} />);

      // Verify no children initially
      const Node = yield* NodeT;
      const childrenBefore = yield* Node.getNodeChildren(parentNodeId);
      expect(childrenBefore.length).toBe(0);

      // Focus and press Cmd+Down
      yield* When.USER_CLICKS_BLOCK(parentBlockId);
      yield* When.USER_PRESSES("{Meta>}{ArrowDown}{/Meta}");

      // Then: The new child is a proper node
      const childrenAfter = yield* Node.getNodeChildren(parentNodeId);
      expect(childrenAfter.length).toBe(1);

      const newChildId = childrenAfter[0]!;

      // Verify the child's parent is correct
      const childParent = yield* Node.getParent(newChildId);
      expect(childParent).toBe(parentNodeId);

      // Verify the child starts with empty text
      yield* Then.NODE_HAS_TEXT(newChildId, "");
    }).pipe(runtime.runPromise);
  });

  it("can type in newly created child from Cmd+Down", async () => {
    await Effect.gen(function* () {
      // Given: A block with no children
      const { bufferId, childNodeIds } = yield* Given.A_BUFFER_WITH_CHILDREN(
        "Root",
        [{ text: "Parent" }],
      );

      const parentNodeId = childNodeIds[0];
      const parentBlockId = Id.makeBlockId(bufferId, parentNodeId);

      render(() => <EditorBuffer bufferId={bufferId} />);

      // Focus and press Cmd+Down to create new child
      yield* When.USER_CLICKS_BLOCK(parentBlockId);
      yield* When.USER_PRESSES("{Meta>}{ArrowDown}{/Meta}");

      // Get the newly created child
      const Node = yield* NodeT;
      const children = yield* Node.getNodeChildren(parentNodeId);
      const newChildId = children[0]!;

      // Type some text
      yield* Effect.promise(() => userEvent.keyboard("Hello world"));

      // Then: The typed text appears in the new child
      yield* Then.NODE_HAS_TEXT(newChildId, "Hello world");
    }).pipe(runtime.runPromise);
  });
});
