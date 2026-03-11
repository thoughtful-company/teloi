/**
 * Unit tests for PickerT service.
 *
 * Tests picker state management (open/close/updateQuery) and high-level
 * actions (selectType, createAndSelectType) that coordinate cleanup.
 */

import { Id, Model } from "@/schema";
import { makeAutomergeLive, AutomergeT } from "@/services/external/Automerge";
import { Context, Effect, Layer, ManagedRuntime, Option, Stream } from "effect";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FrameT } from "../Frame";
import { TypePickerT } from "../TypePicker";
import { PickerT, PickerLive } from "./index";

// Test IDs
const TEST_FRAME_ID = Id.Frame.make("test-frame");
const TEST_NODE_ID = Id.Node.make("test-node");
const TEST_BLOCK_ID = Id.Khora.make(
  `frame:${TEST_FRAME_ID}/node:${TEST_NODE_ID}`,
);
const TEST_TYPE_ID = Id.Node.make("test-type");

// Helper to create mock dependencies for basic tests
const createBasicMockLayer = () => {
  const MockTypePickerT = Layer.succeed(TypePickerT, {
    getAvailableTypes: () => Effect.succeed([]),
    filterTypes: () => [],
    createType: () => Effect.succeed(TEST_TYPE_ID),
    applyType: () => Effect.succeed(null),
  });

  const MockFrameT = Layer.succeed(FrameT, {
    subscribe: () => Effect.fail(new Error("not implemented")),
    getSelection: () => Effect.succeed(Option.none()),
    getAssignedKhoraId: () => Effect.succeed(null),
    setSelection: () => Effect.void,
    setAssignedKhoraId: () => Effect.void,
    setKhoraSelection: () => Effect.void,
    getKhoraSelectionState: () =>
      Effect.succeed({ selectedKhoras: [], anchor: null, focus: null }),
    getMode: () => Effect.succeed({ type: "none" as const }),
    enterKhoraSelection: () => Effect.void,
    enterBlockEditing: () => Effect.void,
    clearFocus: () => Effect.void,
    hasPopup: () => Effect.succeed(false),
    openPopup: () => Effect.void,
    closePopup: () => Effect.void,
    updatePopupQuery: () => Effect.void,
    setActiveView: () => Effect.void,
  } as unknown as Context.Tag.Service<FrameT>);

  const AutomergeLayer = makeAutomergeLive({
    workspaceName: "test-picker-basic",
    persist: false,
  });

  return PickerLive.pipe(
    Layer.provideMerge(MockTypePickerT),
    Layer.provideMerge(MockFrameT),
    Layer.provideMerge(AutomergeLayer),
  );
};

describe("PickerT", () => {
  describe("Basic state operations", () => {
    let runtime: ManagedRuntime.ManagedRuntime<PickerT, never>;

    beforeEach(async () => {
      // PickerLive requires TypePickerT, FrameT, AutomergeT dependencies
      const layer = createBasicMockLayer();
      runtime = ManagedRuntime.make(layer);
    });

    afterEach(async () => {
      await runtime.dispose();
    });

    it("open() sets state with elementId, position, from, query=''", async () => {
      await Effect.gen(function* () {
        const Picker = yield* PickerT;
        const position = { x: 100, y: 200 };
        const from = 5;

        yield* Picker.open(TEST_BLOCK_ID, position, from);

        const state = yield* Picker.getState();
        expect(state).toEqual({
          elementId: TEST_BLOCK_ID,
          position: { x: 100, y: 200 },
          from: 5,
          query: "",
        });
      }).pipe(runtime.runPromise);
    });

    it("close() sets state to null", async () => {
      await Effect.gen(function* () {
        const Picker = yield* PickerT;

        // First open
        yield* Picker.open(TEST_BLOCK_ID, { x: 0, y: 0 }, 0);
        const stateAfterOpen = yield* Picker.getState();
        expect(stateAfterOpen).not.toBeNull();

        // Then close
        yield* Picker.close();
        const stateAfterClose = yield* Picker.getState();
        expect(stateAfterClose).toBeNull();
      }).pipe(runtime.runPromise);
    });

    it("updateQuery() updates query field when picker is open", async () => {
      await Effect.gen(function* () {
        const Picker = yield* PickerT;

        yield* Picker.open(TEST_BLOCK_ID, { x: 100, y: 200 }, 5);
        yield* Picker.updateQuery("per");

        const state = yield* Picker.getState();
        expect(state?.query).toBe("per");
      }).pipe(runtime.runPromise);
    });

    it("updateQuery() is no-op when picker is closed (race condition protection)", async () => {
      await Effect.gen(function* () {
        const Picker = yield* PickerT;

        // Try to update query without opening first
        yield* Picker.updateQuery("per");

        const state = yield* Picker.getState();
        expect(state).toBeNull();
      }).pipe(runtime.runPromise);
    });

    it("getState() returns current state", async () => {
      await Effect.gen(function* () {
        const Picker = yield* PickerT;

        // Initially null
        const initialState = yield* Picker.getState();
        expect(initialState).toBeNull();

        // After open
        yield* Picker.open(TEST_BLOCK_ID, { x: 50, y: 75 }, 10);
        const openState = yield* Picker.getState();
        expect(openState).toEqual({
          elementId: TEST_BLOCK_ID,
          position: { x: 50, y: 75 },
          from: 10,
          query: "",
        });
      }).pipe(runtime.runPromise);
    });
  });

  describe("Subscription", () => {
    let runtime: ManagedRuntime.ManagedRuntime<PickerT, never>;

    beforeEach(async () => {
      // PickerLive requires TypePickerT, FrameT, AutomergeT dependencies
      const layer = createBasicMockLayer();
      runtime = ManagedRuntime.make(layer);
    });

    afterEach(async () => {
      await runtime.dispose();
    });

    it("subscribe() returns a stream that emits current and future state", async () => {
      await Effect.gen(function* () {
        const Picker = yield* PickerT;

        // Get the stream
        const stream = yield* Picker.subscribe();

        // Take first emission (current state)
        const firstEmission = yield* Stream.runHead(stream);
        expect(Option.getOrNull(firstEmission)).toBeNull(); // Initial state is null

        // Open picker and verify we can get new state via getState
        yield* Picker.open(TEST_BLOCK_ID, { x: 0, y: 0 }, 0);
        const afterOpen = yield* Picker.getState();
        expect(afterOpen).toMatchObject({
          elementId: TEST_BLOCK_ID,
          query: "",
        });

        // Get a new stream and verify it has the updated state
        const stream2 = yield* Picker.subscribe();
        const secondStreamFirst = yield* Stream.runHead(stream2);
        expect(Option.getOrNull(secondStreamFirst)).toMatchObject({
          elementId: TEST_BLOCK_ID,
        });
      }).pipe(runtime.runPromise);
    });
  });

  describe("selectType()", () => {
    let runtime: ManagedRuntime.ManagedRuntime<PickerT | AutomergeT, never>;
    let applyTypeMock: ReturnType<typeof vi.fn>;
    let setSelectionMock: ReturnType<typeof vi.fn>;

    beforeEach(async () => {
      applyTypeMock = vi.fn(() => Effect.succeed(null));
      setSelectionMock = vi.fn(() => Effect.void);

      const MockTypePickerT = Layer.succeed(TypePickerT, {
        getAvailableTypes: () => Effect.succeed([]),
        filterTypes: () => [],
        createType: () => Effect.succeed(TEST_TYPE_ID),
        applyType: applyTypeMock,
      });

      const MockFrameT = Layer.succeed(FrameT, {
        subscribe: () => Effect.fail(new Error("not implemented")),
        getSelection: () => Effect.succeed(Option.none()),
        getAssignedKhoraId: () => Effect.succeed(null),
        setSelection: setSelectionMock,
        setAssignedKhoraId: () => Effect.void,
        setKhoraSelection: () => Effect.void,
        getKhoraSelectionState: () =>
          Effect.succeed({ selectedKhoras: [], anchor: null, focus: null }),
        getMode: () => Effect.succeed({ type: "none" as const }),
        enterKhoraSelection: () => Effect.void,
        enterBlockEditing: () => Effect.void,
        clearFocus: () => Effect.void,
        hasPopup: () => Effect.succeed(false),
        openPopup: () => Effect.void,
        closePopup: () => Effect.void,
        updatePopupQuery: () => Effect.void,
        setActiveView: () => Effect.void,
      } as unknown as Context.Tag.Service<FrameT>);

      const AutomergeLayer = makeAutomergeLive({
        workspaceName: "test-picker-select",
        persist: false,
      });

      const layer = PickerLive.pipe(
        Layer.provideMerge(MockTypePickerT),
        Layer.provideMerge(MockFrameT),
        Layer.provideMerge(AutomergeLayer),
      );

      runtime = ManagedRuntime.make(layer);
    });

    afterEach(async () => {
      await runtime.dispose();
    });

    it("calls TypePickerT.applyType with correct nodeId (parsed from elementId)", async () => {
      await Effect.gen(function* () {
        const Picker = yield* PickerT;
        const Automerge = yield* AutomergeT;

        // Set up Y.Text with content including trigger
        yield* Automerge.setText(TEST_NODE_ID, "Hello @per world");

        // Open picker and set some query
        yield* Picker.open(TEST_BLOCK_ID, { x: 100, y: 200 }, 6);
        yield* Picker.updateQuery("per");

        // Select type
        yield* Picker.selectType(TEST_TYPE_ID);

        // Verify applyType was called with correct node ID
        expect(applyTypeMock).toHaveBeenCalledTimes(1);
        expect(applyTypeMock).toHaveBeenCalledWith(TEST_NODE_ID, TEST_TYPE_ID);
      }).pipe(runtime.runPromise);
    });

    it("deletes trigger text from Automerge (from `from` position to `from + query.length + 1`)", async () => {
      await Effect.gen(function* () {
        const Picker = yield* PickerT;
        const Automerge = yield* AutomergeT;

        // Set up text content including trigger
        yield* Automerge.setText(TEST_NODE_ID, "Hello @per world"); // trigger @ at position 6, query "per"

        // Open picker at position 6 (the @), query will be "per"
        yield* Picker.open(TEST_BLOCK_ID, { x: 100, y: 200 }, 6);
        yield* Picker.updateQuery("per");

        // Select type - should delete "@per" (4 chars: trigger + query)
        yield* Picker.selectType(TEST_TYPE_ID);

        // Verify text content: "@per" deleted
        const text = yield* Automerge.getText(TEST_NODE_ID);
        expect(text).toBe("Hello  world");
      }).pipe(runtime.runPromise);
    });

    it("sets selection back to `from` position via FrameT", async () => {
      await Effect.gen(function* () {
        const Picker = yield* PickerT;
        const Automerge = yield* AutomergeT;

        // Set up Y.Text
        yield* Automerge.setText(TEST_NODE_ID, "Hello @test world");

        // Open picker at position 6
        yield* Picker.open(TEST_BLOCK_ID, { x: 100, y: 200 }, 6);
        yield* Picker.updateQuery("test");

        yield* Picker.selectType(TEST_TYPE_ID);

        // Verify setSelection was called with position 6
        expect(setSelectionMock).toHaveBeenCalledTimes(1);
        const [frameId, selectionOption] = setSelectionMock.mock.calls[0] as [
          Id.Frame,
          Option.Option<Model.ActiveKhoraSelection>,
        ];
        expect(frameId).toBe(TEST_FRAME_ID);

        // Selection should be set to position 6
        const selection = Option.getOrThrow(selectionOption);
        expect(selection.selection.anchor).toBe(6);
        expect(selection.selection.head).toBe(6);
      }).pipe(runtime.runPromise);
    });

    it("closes picker (state becomes null)", async () => {
      await Effect.gen(function* () {
        const Picker = yield* PickerT;
        const Automerge = yield* AutomergeT;

        // Set up Y.Text
        yield* Automerge.setText(TEST_NODE_ID, "Hello @test");

        yield* Picker.open(TEST_BLOCK_ID, { x: 100, y: 200 }, 6);
        yield* Picker.updateQuery("test");

        yield* Picker.selectType(TEST_TYPE_ID);

        const state = yield* Picker.getState();
        expect(state).toBeNull();
      }).pipe(runtime.runPromise);
    });
  });

  describe("createAndSelectType()", () => {
    let runtime: ManagedRuntime.ManagedRuntime<PickerT | AutomergeT, never>;
    let createTypeMock: ReturnType<typeof vi.fn>;
    let applyTypeMock: ReturnType<typeof vi.fn>;
    let setSelectionMock: ReturnType<typeof vi.fn>;

    const NEW_TYPE_ID = Id.Node.make("newly-created-type");

    beforeEach(async () => {
      createTypeMock = vi.fn(() => Effect.succeed(NEW_TYPE_ID));
      applyTypeMock = vi.fn(() => Effect.succeed(null));
      setSelectionMock = vi.fn(() => Effect.void);

      const MockTypePickerT = Layer.succeed(TypePickerT, {
        getAvailableTypes: () => Effect.succeed([]),
        filterTypes: () => [],
        createType: createTypeMock,
        applyType: applyTypeMock,
      });

      const MockFrameT = Layer.succeed(FrameT, {
        subscribe: () => Effect.fail(new Error("not implemented")),
        getSelection: () => Effect.succeed(Option.none()),
        getAssignedKhoraId: () => Effect.succeed(null),
        setSelection: setSelectionMock,
        setAssignedKhoraId: () => Effect.void,
        setKhoraSelection: () => Effect.void,
        getKhoraSelectionState: () =>
          Effect.succeed({ selectedKhoras: [], anchor: null, focus: null }),
        getMode: () => Effect.succeed({ type: "none" as const }),
        enterKhoraSelection: () => Effect.void,
        enterBlockEditing: () => Effect.void,
        clearFocus: () => Effect.void,
        hasPopup: () => Effect.succeed(false),
        openPopup: () => Effect.void,
        closePopup: () => Effect.void,
        updatePopupQuery: () => Effect.void,
        setActiveView: () => Effect.void,
      } as unknown as Context.Tag.Service<FrameT>);

      const AutomergeLayer = makeAutomergeLive({
        workspaceName: "test-picker-create",
        persist: false,
      });

      const layer = PickerLive.pipe(
        Layer.provideMerge(MockTypePickerT),
        Layer.provideMerge(MockFrameT),
        Layer.provideMerge(AutomergeLayer),
      );

      runtime = ManagedRuntime.make(layer);
    });

    afterEach(async () => {
      await runtime.dispose();
    });

    it("creates type via TypePickerT.createType", async () => {
      await Effect.gen(function* () {
        const Picker = yield* PickerT;
        const Automerge = yield* AutomergeT;

        // Set up Y.Text
        yield* Automerge.setText(TEST_NODE_ID, "Hello @NewType");

        yield* Picker.open(TEST_BLOCK_ID, { x: 100, y: 200 }, 6);
        yield* Picker.updateQuery("NewType");

        yield* Picker.createAndSelectType("NewType");

        expect(createTypeMock).toHaveBeenCalledTimes(1);
        expect(createTypeMock).toHaveBeenCalledWith("NewType");
      }).pipe(runtime.runPromise);
    });

    it("applies created type via applyType", async () => {
      await Effect.gen(function* () {
        const Picker = yield* PickerT;
        const Automerge = yield* AutomergeT;

        // Set up Y.Text
        yield* Automerge.setText(TEST_NODE_ID, "Hello @NewType");

        yield* Picker.open(TEST_BLOCK_ID, { x: 100, y: 200 }, 6);
        yield* Picker.updateQuery("NewType");

        yield* Picker.createAndSelectType("NewType");

        // applyType should be called with the newly created type ID
        expect(applyTypeMock).toHaveBeenCalledTimes(1);
        expect(applyTypeMock).toHaveBeenCalledWith(TEST_NODE_ID, NEW_TYPE_ID);
      }).pipe(runtime.runPromise);
    });

    it("deletes trigger text and closes picker", async () => {
      await Effect.gen(function* () {
        const Picker = yield* PickerT;
        const Automerge = yield* AutomergeT;

        // Set up Y.Text
        yield* Automerge.setText(TEST_NODE_ID, "Hello @NewType world");

        yield* Picker.open(TEST_BLOCK_ID, { x: 100, y: 200 }, 6);
        yield* Picker.updateQuery("NewType");

        yield* Picker.createAndSelectType("NewType");

        // Trigger text deleted
        const text = yield* Automerge.getText(TEST_NODE_ID);
        expect(text).toBe("Hello  world");

        // Picker closed
        const state = yield* Picker.getState();
        expect(state).toBeNull();
      }).pipe(runtime.runPromise);
    });

    it("sets selection back to from position", async () => {
      await Effect.gen(function* () {
        const Picker = yield* PickerT;
        const Automerge = yield* AutomergeT;

        // Set up Y.Text
        yield* Automerge.setText(TEST_NODE_ID, "Hello @NewType");

        yield* Picker.open(TEST_BLOCK_ID, { x: 100, y: 200 }, 6);
        yield* Picker.updateQuery("NewType");

        yield* Picker.createAndSelectType("NewType");

        // Verify setSelection was called with position 6
        expect(setSelectionMock).toHaveBeenCalledTimes(1);
        const [frameId, selectionOption] = setSelectionMock.mock.calls[0] as [
          Id.Frame,
          Option.Option<Model.ActiveKhoraSelection>,
        ];
        expect(frameId).toBe(TEST_FRAME_ID);

        const selection = Option.getOrThrow(selectionOption);
        expect(selection.selection.anchor).toBe(6);
        expect(selection.selection.head).toBe(6);
      }).pipe(runtime.runPromise);
    });
  });
});
