import "@/index.css";
import { Id } from "@/schema";
import { NavigationT } from "@/services/ui/Navigation";
import { StoreT } from "@/services/external/Store";
import { Effect, Option } from "effect";
import { describe, it, beforeEach, expect } from "vitest";
import { Given, runtime } from "./bdd";

describe("Navigation", () => {
  beforeEach(() => {
    // Reset URL to root before each test
    history.replaceState({}, "", "/");
  });

  describe("syncUrlToModel", () => {
    it("sets buffer assignedNodeId from valid nodeId in URL", async () => {
      await Effect.gen(function* () {
        // Given: A full hierarchy (window → pane → buffer → node)
        const { bufferId, nodeId } = yield* Given.A_FULL_HIERARCHY_WITH_TEXT(
          "Test content",
        );

        // And: URL contains that nodeId
        history.replaceState({}, "", `/workspace/${nodeId}`);

        // When: syncUrlToModel runs
        const Navigation = yield* NavigationT;
        yield* Navigation.syncUrlToModel();

        // Then: Buffer's assignedNodeId matches the URL
        const Store = yield* StoreT;
        const bufferDoc = yield* Store.getDocument("buffer", bufferId);
        const buffer = Option.getOrThrow(bufferDoc);
        expect(buffer.assignedNodeId).toBe(nodeId);
      }).pipe(runtime.runPromise);
    });

    it("sets buffer assignedNodeId to null for invalid nodeId in URL", async () => {
      await Effect.gen(function* () {
        // Given: A full hierarchy
        const { bufferId } = yield* Given.A_FULL_HIERARCHY_WITH_TEXT(
          "Test content",
        );

        // And: URL contains a non-existent nodeId
        history.replaceState({}, "", "/workspace/non-existent-node-id");

        // When: syncUrlToModel runs (no fallback provided)
        const Navigation = yield* NavigationT;
        yield* Navigation.syncUrlToModel();

        // Then: Buffer's assignedNodeId is null (node doesn't exist)
        const Store = yield* StoreT;
        const bufferDoc = yield* Store.getDocument("buffer", bufferId);
        const buffer = Option.getOrThrow(bufferDoc);
        expect(buffer.assignedNodeId).toBeNull();
      }).pipe(runtime.runPromise);
    });

    it("uses fallback nodeId when URL is empty", async () => {
      await Effect.gen(function* () {
        // Given: A full hierarchy
        const { bufferId, nodeId } = yield* Given.A_FULL_HIERARCHY_WITH_TEXT(
          "Test content",
        );

        // And: URL is just root (no nodeId)
        history.replaceState({}, "", "/");

        // When: syncUrlToModel runs with fallback
        const Navigation = yield* NavigationT;
        yield* Navigation.syncUrlToModel(nodeId);

        // Then: Buffer's assignedNodeId is set to fallback
        const Store = yield* StoreT;
        const bufferDoc = yield* Store.getDocument("buffer", bufferId);
        const buffer = Option.getOrThrow(bufferDoc);
        expect(buffer.assignedNodeId).toBe(nodeId);

        // And: URL is updated to include the nodeId
        expect(window.location.pathname).toBe(`/workspace/${nodeId}`);
      }).pipe(runtime.runPromise);
    });

    it("uses fallback when URL has /workspace/ but no nodeId", async () => {
      await Effect.gen(function* () {
        // Given: A full hierarchy
        const { bufferId, nodeId } = yield* Given.A_FULL_HIERARCHY_WITH_TEXT(
          "Test content",
        );

        // And: URL is /workspace/ without a nodeId
        history.replaceState({}, "", "/workspace/");

        // When: syncUrlToModel runs with fallback
        const Navigation = yield* NavigationT;
        yield* Navigation.syncUrlToModel(nodeId);

        // Then: Buffer's assignedNodeId is set to fallback
        const Store = yield* StoreT;
        const bufferDoc = yield* Store.getDocument("buffer", bufferId);
        const buffer = Option.getOrThrow(bufferDoc);
        expect(buffer.assignedNodeId).toBe(nodeId);
      }).pipe(runtime.runPromise);
    });
  });

  describe("navigateTo", () => {
    it("updates buffer assignedNodeId and URL", async () => {
      await Effect.gen(function* () {
        // Given: A full hierarchy
        const { bufferId, nodeId } = yield* Given.A_FULL_HIERARCHY_WITH_TEXT(
          "Test content",
        );

        // And: Initial URL is root
        history.replaceState({}, "", "/");

        // When: navigateTo is called with the nodeId
        const Navigation = yield* NavigationT;
        yield* Navigation.navigateTo(nodeId);

        // Then: Buffer's assignedNodeId is updated
        const Store = yield* StoreT;
        const bufferDoc = yield* Store.getDocument("buffer", bufferId);
        const buffer = Option.getOrThrow(bufferDoc);
        expect(buffer.assignedNodeId).toBe(nodeId);

        // And: URL is updated
        expect(window.location.pathname).toBe(`/workspace/${nodeId}`);
      }).pipe(runtime.runPromise);
    });

    it("navigateTo(null) clears buffer and sets URL to /workspace", async () => {
      await Effect.gen(function* () {
        // Given: A full hierarchy with node assigned via navigateTo
        const { bufferId, nodeId } = yield* Given.A_FULL_HIERARCHY_WITH_TEXT(
          "Test content",
        );
        const Navigation = yield* NavigationT;
        yield* Navigation.navigateTo(nodeId);

        // When: navigateTo is called with null
        yield* Navigation.navigateTo(null);

        // Then: Buffer's assignedNodeId is null
        const Store = yield* StoreT;
        const bufferDoc = yield* Store.getDocument("buffer", bufferId);
        const buffer = Option.getOrThrow(bufferDoc);
        expect(buffer.assignedNodeId).toBeNull();

        // And: URL is /workspace
        expect(window.location.pathname).toBe("/workspace");
      }).pipe(runtime.runPromise);
    });

    it("navigateTo with invalid nodeId sets assignedNodeId to null", async () => {
      await Effect.gen(function* () {
        // Given: A full hierarchy
        const { bufferId } = yield* Given.A_FULL_HIERARCHY_WITH_TEXT(
          "Test content",
        );

        // When: navigateTo is called with a non-existent nodeId
        const Navigation = yield* NavigationT;
        const fakeNodeId = Id.Node.make("non-existent-node");
        yield* Navigation.navigateTo(fakeNodeId);

        // Then: Buffer's assignedNodeId is null (node doesn't exist)
        const Store = yield* StoreT;
        const bufferDoc = yield* Store.getDocument("buffer", bufferId);
        const buffer = Option.getOrThrow(bufferDoc);
        expect(buffer.assignedNodeId).toBeNull();
      }).pipe(runtime.runPromise);
    });
  });
});
