import "@/index.css";
import { Id } from "@/schema";
import EditorBuffer from "@/ui/EditorBuffer";
import { Effect } from "effect";
import { afterEach, beforeEach, describe, it } from "vitest";
import {
  Given,
  Then,
  When,
  setupClientTest,
  type BrowserRuntime,
} from "../bdd";

describe("Block Movement", () => {
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

  describe("Swap Up (Opt+Cmd+Up)", () => {
    it("swaps block with previous sibling and preserves selection", async () => {
      await Effect.gen(function* () {
        const { bufferId, rootNodeId, childNodeIds } =
          yield* Given.A_BUFFER_WITH_CHILDREN("Root", [
            { text: "First" },
            { text: "Second" },
            { text: "Third" },
          ]);

        const [first, second, third] = childNodeIds;
        const secondBlockId = Id.makeBlockId(bufferId, second);

        render(() => <EditorBuffer bufferId={bufferId} />);

        yield* When.USER_CLICKS_BLOCK(secondBlockId);
        yield* When.USER_PRESSES("{Alt>}{Meta>}{ArrowUp}{/Meta}{/Alt}");

        yield* Then.CHILDREN_ORDER_IS(rootNodeId, [second, first, third]);
        yield* Then.SELECTION_IS_ON_BLOCK(secondBlockId);
      }).pipe(runtime.runPromise);
    });

    it("does nothing when block is first child", async () => {
      await Effect.gen(function* () {
        const { bufferId, rootNodeId, childNodeIds } =
          yield* Given.A_BUFFER_WITH_CHILDREN("Root", [
            { text: "First" },
            { text: "Second" },
          ]);

        const [first, second] = childNodeIds;
        const firstBlockId = Id.makeBlockId(bufferId, first);

        render(() => <EditorBuffer bufferId={bufferId} />);

        yield* When.USER_CLICKS_BLOCK(firstBlockId);
        yield* When.USER_PRESSES("{Alt>}{Meta>}{ArrowUp}{/Meta}{/Alt}");

        yield* Then.CHILDREN_ORDER_IS(rootNodeId, [first, second]);
      }).pipe(runtime.runPromise);
    });
  });

  describe("Swap Down (Opt+Cmd+Down)", () => {
    it("swaps block with next sibling and preserves selection", async () => {
      await Effect.gen(function* () {
        const { bufferId, rootNodeId, childNodeIds } =
          yield* Given.A_BUFFER_WITH_CHILDREN("Root", [
            { text: "First" },
            { text: "Second" },
            { text: "Third" },
          ]);

        const [first, second, third] = childNodeIds;
        const secondBlockId = Id.makeBlockId(bufferId, second);

        render(() => <EditorBuffer bufferId={bufferId} />);

        yield* When.USER_CLICKS_BLOCK(secondBlockId);
        yield* When.USER_PRESSES("{Alt>}{Meta>}{ArrowDown}{/Meta}{/Alt}");

        yield* Then.CHILDREN_ORDER_IS(rootNodeId, [first, third, second]);
        yield* Then.SELECTION_IS_ON_BLOCK(secondBlockId);
      }).pipe(runtime.runPromise);
    });

    it("does nothing when block is last child", async () => {
      await Effect.gen(function* () {
        const { bufferId, rootNodeId, childNodeIds } =
          yield* Given.A_BUFFER_WITH_CHILDREN("Root", [
            { text: "First" },
            { text: "Second" },
          ]);

        const [first, second] = childNodeIds;
        const secondBlockId = Id.makeBlockId(bufferId, second);

        render(() => <EditorBuffer bufferId={bufferId} />);

        yield* When.USER_CLICKS_BLOCK(secondBlockId);
        yield* When.USER_PRESSES("{Alt>}{Meta>}{ArrowDown}{/Meta}{/Alt}");

        yield* Then.CHILDREN_ORDER_IS(rootNodeId, [first, second]);
      }).pipe(runtime.runPromise);
    });
  });

  describe("Move to First (Shift+Opt+Cmd+Up)", () => {
    it("moves block to first position among siblings", async () => {
      await Effect.gen(function* () {
        const { bufferId, rootNodeId, childNodeIds } =
          yield* Given.A_BUFFER_WITH_CHILDREN("Root", [
            { text: "First" },
            { text: "Second" },
            { text: "Third" },
          ]);

        const [first, second, third] = childNodeIds;
        const thirdBlockId = Id.makeBlockId(bufferId, third);

        render(() => <EditorBuffer bufferId={bufferId} />);

        yield* When.USER_CLICKS_BLOCK(thirdBlockId);
        yield* When.USER_PRESSES(
          "{Shift>}{Alt>}{Meta>}{ArrowUp}{/Meta}{/Alt}{/Shift}",
        );

        yield* Then.CHILDREN_ORDER_IS(rootNodeId, [third, first, second]);
        yield* Then.SELECTION_IS_ON_BLOCK(thirdBlockId);
      }).pipe(runtime.runPromise);
    });

    it("does nothing when block is already first child", async () => {
      await Effect.gen(function* () {
        const { bufferId, rootNodeId, childNodeIds } =
          yield* Given.A_BUFFER_WITH_CHILDREN("Root", [
            { text: "First" },
            { text: "Second" },
          ]);

        const [first, second] = childNodeIds;
        const firstBlockId = Id.makeBlockId(bufferId, first);

        render(() => <EditorBuffer bufferId={bufferId} />);

        yield* When.USER_CLICKS_BLOCK(firstBlockId);
        yield* When.USER_PRESSES(
          "{Shift>}{Alt>}{Meta>}{ArrowUp}{/Meta}{/Alt}{/Shift}",
        );

        yield* Then.CHILDREN_ORDER_IS(rootNodeId, [first, second]);
      }).pipe(runtime.runPromise);
    });
  });

  describe("Move to Last (Shift+Opt+Cmd+Down)", () => {
    it("moves block to last position among siblings", async () => {
      await Effect.gen(function* () {
        const { bufferId, rootNodeId, childNodeIds } =
          yield* Given.A_BUFFER_WITH_CHILDREN("Root", [
            { text: "First" },
            { text: "Second" },
            { text: "Third" },
          ]);

        const [first, second, third] = childNodeIds;
        const firstBlockId = Id.makeBlockId(bufferId, first);

        render(() => <EditorBuffer bufferId={bufferId} />);

        yield* When.USER_CLICKS_BLOCK(firstBlockId);
        yield* When.USER_PRESSES(
          "{Shift>}{Alt>}{Meta>}{ArrowDown}{/Meta}{/Alt}{/Shift}",
        );

        yield* Then.CHILDREN_ORDER_IS(rootNodeId, [second, third, first]);
        yield* Then.SELECTION_IS_ON_BLOCK(firstBlockId);
      }).pipe(runtime.runPromise);
    });

    it("does nothing when block is already last child", async () => {
      await Effect.gen(function* () {
        const { bufferId, rootNodeId, childNodeIds } =
          yield* Given.A_BUFFER_WITH_CHILDREN("Root", [
            { text: "First" },
            { text: "Second" },
          ]);

        const [first, second] = childNodeIds;
        const secondBlockId = Id.makeBlockId(bufferId, second);

        render(() => <EditorBuffer bufferId={bufferId} />);

        yield* When.USER_CLICKS_BLOCK(secondBlockId);
        yield* When.USER_PRESSES(
          "{Shift>}{Alt>}{Meta>}{ArrowDown}{/Meta}{/Alt}{/Shift}",
        );

        yield* Then.CHILDREN_ORDER_IS(rootNodeId, [first, second]);
      }).pipe(runtime.runPromise);
    });
  });
});
