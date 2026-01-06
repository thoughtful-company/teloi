import { events } from "@/livestore/schema";
import { Id } from "@/schema";
import { StoreT } from "@/services/external/Store";
import { YjsT } from "@/services/external/Yjs";
import { Effect, Option } from "effect";
import { nanoid } from "nanoid";

/**
 * Bootstrap effect that ensures the app has required initial state.
 * Creates window → pane → buffer → node hierarchy if not present.
 * Returns the fallback nodeId for URL sync (either newly created or existing).
 */
export const bootstrap = Effect.gen(function* () {
  const Store = yield* StoreT;
  const Yjs = yield* YjsT;
  const sessionId = yield* Store.getSessionId();
  const windowId = Id.Window.make(sessionId);

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
  const nodeId = Id.Node.make(nanoid());

  const childId1 = Id.Node.make(nanoid());
  const childId2 = Id.Node.make(nanoid());
  const grandchildId = Id.Node.make(nanoid());

  // Create root node
  yield* Store.commit(
    events.nodeCreated({
      timestamp: Date.now(),
      data: { nodeId },
    }),
  );
  Yjs.getText(nodeId).insert(
    0,
    "Alice was beginning to get very tired of sitting by her sister on the bank, and of having nothing to do.",
  );

  // Create first child
  yield* Store.commit(
    events.nodeCreated({
      timestamp: Date.now(),
      data: {
        nodeId: childId1,
        parentId: nodeId,
        position: "a0",
      },
    }),
  );
  Yjs.getText(childId1).insert(
    0,
    "Once or twice she had peeped into the book her sister was reading.",
  );

  // Create second child
  yield* Store.commit(
    events.nodeCreated({
      timestamp: Date.now(),
      data: {
        nodeId: childId2,
        parentId: nodeId,
        position: "a1",
      },
    }),
  );
  Yjs.getText(childId2).insert(
    0,
    "But it had no pictures or conversations in it.",
  );

  // Create grandchild (nested under first child)
  yield* Store.commit(
    events.nodeCreated({
      timestamp: Date.now(),
      data: {
        nodeId: grandchildId,
        parentId: childId1,
        position: "a0",
      },
    }),
  );
  Yjs.getText(grandchildId).insert(
    0,
    "And what is the use of a book without pictures or conversations?",
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
      selectedBlocks: [],
      blockSelectionAnchor: null,
      blockSelectionFocus: null,
      toggledNodes: [],
      selection: null,
    },
    bufferId,
  );

  yield* Effect.log("Bootstrap complete: created window, pane, buffer, node");

  return Id.Node.make(nodeId);
});
