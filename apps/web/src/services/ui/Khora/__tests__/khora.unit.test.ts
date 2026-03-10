import { Id } from "@/schema";
import { AutomergeT } from "@/services/external/Automerge";
import { StoreT } from "@/services/external/Store";
import { expandOneLevel } from "@/services/ui/Khora/expand";
import { materialize } from "@/services/ui/Khora/materialize";
import { NodeT } from "@/services/domain/Node";
import * as Given from "@/test-utils/bdd/given";
import { setupUnitTest, type UnitRuntime } from "@/test-utils/unit/setup";
import { Effect, Option } from "effect";
import { beforeEach, describe, expect, it } from "vitest";

// ================================ Internal ==================================

/** Write block as collapsed directly to StoreT */
const SET_BLOCK_COLLAPSED = (khoraId: Id.Khora) =>
  Effect.gen(function* () {
    const Store = yield* StoreT;
    yield* Store.setDocument(
      "khora",
      {
        isExpanded: false,
        activeViewId: null,
        ghostChildId: null,
        ghostParentId: null,
      },
      khoraId,
    );
  });

/** Read block doc from StoreT */
const GET_BLOCK_DOC = (frameId: Id.Frame, nodeId: Id.Node) =>
  Effect.gen(function* () {
    const Store = yield* StoreT;
    const khoraId = Id.makeFrameKhoraId(frameId, nodeId);
    return yield* Store.getDocument("khora", khoraId);
  });

// ============================================================================

describe("expandOneLevel — ghost block creation", () => {
  let runtime: UnitRuntime;
  let cleanup: (() => Promise<void>) | undefined;

  beforeEach(async () => {
    await cleanup?.();
    const setup = await setupUnitTest();
    runtime = setup.runtime;
    cleanup = setup.cleanup;
  });

  it("creates ghost when expanding a childless block", async () => {
    await Effect.gen(function* () {
      const { frameId, childNodeIds } = yield* Given.A_FRAME_WITH_CHILDREN(
        "Root",
        [{ text: "A" }],
      );
      const [nodeA] = childNodeIds;

      // Collapse A first
      const blockA = Id.makeFrameKhoraId(frameId, nodeA);
      yield* SET_BLOCK_COLLAPSED(blockA);

      // Expand A (childless) — should create ghost
      const result = yield* expandOneLevel(frameId, nodeA);
      expect(result.expanded).toBe(true);

      // A's block doc should have ghostChildId set
      const docA = yield* GET_BLOCK_DOC(frameId, nodeA);
      expect(Option.isSome(docA)).toBe(true);
      const blockDocA = Option.getOrThrow(docA);
      expect(blockDocA.ghostChildId).not.toBeNull();

      // Ghost's block doc should have ghostParentId pointing back to A
      const ghostNodeId = blockDocA.ghostChildId!;
      const docGhost = yield* GET_BLOCK_DOC(frameId, ghostNodeId as Id.Node);
      expect(Option.isSome(docGhost)).toBe(true);
      expect(Option.getOrThrow(docGhost).ghostParentId).toBe(nodeA);
    }).pipe(runtime.runPromise);
  });

  it("does NOT create ghost when expanding a block with children", async () => {
    await Effect.gen(function* () {
      const { frameId, childNodeIds } = yield* Given.A_FRAME_WITH_CHILDREN(
        "Root",
        [{ text: "A" }],
      );
      const [nodeA] = childNodeIds;

      // Give A a real child
      yield* Given.INSERT_NODE_WITH_TEXT({
        parentId: nodeA,
        insert: "after",
        text: "A1",
      });

      // Collapse A, then expand
      const blockA = Id.makeFrameKhoraId(frameId, nodeA);
      yield* SET_BLOCK_COLLAPSED(blockA);
      yield* expandOneLevel(frameId, nodeA);

      // A's block doc should NOT have ghostChildId
      const docA = yield* GET_BLOCK_DOC(frameId, nodeA);
      expect(Option.isSome(docA)).toBe(true);
      expect(Option.getOrThrow(docA).ghostChildId).toBeNull();
    }).pipe(runtime.runPromise);
  });

  it("initializes empty Automerge text for ghost", async () => {
    await Effect.gen(function* () {
      const { frameId, childNodeIds } = yield* Given.A_FRAME_WITH_CHILDREN(
        "Root",
        [{ text: "A" }],
      );
      const [nodeA] = childNodeIds;

      // Collapse A, then expand (childless → creates ghost)
      const blockA = Id.makeFrameKhoraId(frameId, nodeA);
      yield* SET_BLOCK_COLLAPSED(blockA);
      yield* expandOneLevel(frameId, nodeA);

      // Read ghostChildId — must exist
      const docA = yield* GET_BLOCK_DOC(frameId, nodeA);
      const blockDocA = Option.getOrThrow(docA);
      expect(blockDocA.ghostChildId).not.toBeNull();
      const ghostNodeId = blockDocA.ghostChildId! as Id.Node;

      // Ghost's Automerge text should be initialized as empty string
      const Automerge = yield* AutomergeT;
      const text = yield* Automerge.getText(ghostNodeId);
      expect(text).toBe("");
    }).pipe(runtime.runPromise);
  });

  it("creates ghost when expanding an already-expanded childless block", async () => {
    await Effect.gen(function* () {
      const { frameId, childNodeIds } = yield* Given.A_FRAME_WITH_CHILDREN(
        "Root",
        [{ text: "A" }],
      );
      const [nodeA] = childNodeIds;

      // A is expanded by default (no block doc = expanded)
      const result = yield* expandOneLevel(frameId, nodeA);
      expect(result.expanded).toBe(true);

      const docA = yield* GET_BLOCK_DOC(frameId, nodeA);
      expect(Option.isSome(docA)).toBe(true);
      expect(Option.getOrThrow(docA).ghostChildId).not.toBeNull();
    }).pipe(runtime.runPromise);
  });

  it("does nothing when ghost already exists", async () => {
    await Effect.gen(function* () {
      const { frameId, childNodeIds } = yield* Given.A_FRAME_WITH_CHILDREN(
        "Root",
        [{ text: "A" }],
      );
      const [nodeA] = childNodeIds;

      // First expand creates ghost
      yield* expandOneLevel(frameId, nodeA);
      const docA = yield* GET_BLOCK_DOC(frameId, nodeA);
      const ghostId = Option.getOrThrow(docA).ghostChildId;

      // Second expand should return false (ghost already exists)
      const result = yield* expandOneLevel(frameId, nodeA);
      expect(result.expanded).toBe(false);

      // Ghost should be the same one
      const docA2 = yield* GET_BLOCK_DOC(frameId, nodeA);
      expect(Option.getOrThrow(docA2).ghostChildId).toBe(ghostId);
    }).pipe(runtime.runPromise);
  });
});

describe("materialize — ghost to real node", () => {
  let runtime: UnitRuntime;
  let cleanup: (() => Promise<void>) | undefined;

  beforeEach(async () => {
    await cleanup?.();
    const setup = await setupUnitTest();
    runtime = setup.runtime;
    cleanup = setup.cleanup;
  });

  it("creates LiveStore node and clears ghost fields", async () => {
    await Effect.gen(function* () {
      const { frameId, childNodeIds } = yield* Given.A_FRAME_WITH_CHILDREN(
        "Root",
        [{ text: "A" }],
      );
      const [nodeA] = childNodeIds;

      const blockA = Id.makeFrameKhoraId(frameId, nodeA);
      yield* SET_BLOCK_COLLAPSED(blockA);
      const { ghostNodeId } = yield* expandOneLevel(frameId, nodeA);
      expect(ghostNodeId).not.toBeNull();

      const Automerge = yield* AutomergeT;
      yield* Automerge.setText(ghostNodeId!, "hello");

      yield* materialize({
        ghostNodeId: ghostNodeId!,
        parentNodeId: nodeA,
        frameId,
      });

      const Node = yield* NodeT;
      const children = yield* Node.getNodeChildren(nodeA);
      expect(children).toContain(ghostNodeId);

      const docA = yield* GET_BLOCK_DOC(frameId, nodeA);
      expect(Option.getOrThrow(docA).ghostChildId).toBeNull();

      const docGhost = yield* GET_BLOCK_DOC(frameId, ghostNodeId! as Id.Node);
      expect(Option.getOrThrow(docGhost).ghostParentId).toBeNull();

      const text = yield* Automerge.getText(ghostNodeId!);
      expect(text).toBe("hello");
    }).pipe(runtime.runPromise);
  });
});
