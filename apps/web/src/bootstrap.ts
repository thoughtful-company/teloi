import { events } from "@/livestore/schema";
import { Id } from "@/schema";
import { StoreT } from "@/services/external/Store";
import { Effect, Option } from "effect";
import { nanoid } from "nanoid";

/**
 * Bootstrap effect that ensures the app has required initial state.
 * Creates window → pane → buffer → node hierarchy if not present.
 * Returns the fallback nodeId for URL sync (either newly created or existing).
 */
export const bootstrap = Effect.gen(function* () {
  const Store = yield* StoreT;
  const windowId = Id.Window.make(yield* Store.getSessionId());

  const windowDoc = yield* Store.getDocument("window", windowId);

  // Already initialized - get existing buffer's assignedNodeId as fallback
  if (Option.isSome(windowDoc) && windowDoc.value.panes.length > 0) {
    const paneDoc = yield* Store.getDocument("pane", windowDoc.value.panes[0]);
    if (Option.isSome(paneDoc) && paneDoc.value.buffers.length > 0) {
      const bufferDoc = yield* Store.getDocument(
        "buffer",
        paneDoc.value.buffers[0],
      );
      if (Option.isSome(bufferDoc) && bufferDoc.value.assignedNodeId) {
        return Id.Node.make(bufferDoc.value.assignedNodeId);
      }
    }
    return undefined;
  }

  const paneId = Id.Pane.make(nanoid());
  const bufferId = Id.Buffer.make(nanoid());
  const nodeId = nanoid();

  const childId1 = nanoid();
  const childId2 = nanoid();
  const grandchildId = nanoid();

  // Create root node with initial content
  yield* Store.commit(
    events.nodeCreated({
      timestamp: Date.now(),
      data: {
        nodeId,
        textContent:
          "Alice was beginning to get very tired of sitting by her sister on the bank, and of having nothing to do.",
      },
    }),
  );

  // Create first child
  yield* Store.commit(
    events.nodeCreated({
      timestamp: Date.now(),
      data: {
        nodeId: childId1,
        textContent: "Once or twice she had peeped into the book her sister was reading.",
        parentId: nodeId,
        position: "a0",
      },
    }),
  );

  // Create second child
  yield* Store.commit(
    events.nodeCreated({
      timestamp: Date.now(),
      data: {
        nodeId: childId2,
        textContent: "But it had no pictures or conversations in it.",
        parentId: nodeId,
        position: "a1",
      },
    }),
  );

  // Create grandchild (nested under first child)
  yield* Store.commit(
    events.nodeCreated({
      timestamp: Date.now(),
      data: {
        nodeId: grandchildId,
        textContent: "And what is the use of a book without pictures or conversations?",
        parentId: childId1,
        position: "a0",
      },
    }),
  );

  // Create window document
  yield* Store.setDocument(
    "window",
    {
      panes: [paneId],
      activeElement: null,
    },
    windowId,
  );

  // Create pane document
  yield* Store.setDocument(
    "pane",
    {
      parent: { id: windowId, type: "window" },
      buffers: [bufferId],
    },
    paneId,
  );

  // Create buffer document - let navigation set assignedNodeId from URL
  yield* Store.setDocument(
    "buffer",
    {
      windowId,
      parent: { id: paneId, type: "pane" },
      assignedNodeId: null,
      selectedNodes: [],
      toggledNodes: [],
      selection: null,
    },
    bufferId,
  );

  yield* Effect.log("Bootstrap complete: created window, pane, buffer, node");

  return Id.Node.make(nodeId);
});
