import { events } from "@/livestore/schema";
import { Id } from "@/schema";
import { AutomergeT } from "@/services/external/Automerge";
import { StoreT } from "@/services/external/Store";
import { Effect, Option } from "effect";
import { nanoid } from "nanoid";

/**
 * Bootstrap effect that ensures the app has required initial state.
 * Creates window → pane → frame → node hierarchy if not present.
 * Returns the fallback nodeId for URL sync (either newly created or existing).
 */
export const bootstrap = Effect.gen(function* () {
  const Store = yield* StoreT;
  const Automerge = yield* AutomergeT;
  const sessionId = yield* Store.getSessionId();
  const windowId = Id.Window.make(sessionId);

  const windowDoc = yield* Store.getDocument("window", windowId);

  // Already initialized - get existing frame's assignedNodeId as fallback
  if (Option.isSome(windowDoc) && windowDoc.value.panes.length > 0) {
    const paneDoc = yield* Store.getDocument("pane", windowDoc.value.panes[0]);
    if (Option.isSome(paneDoc) && paneDoc.value.frames.length > 0) {
      const frameDoc = yield* Store.getDocument(
        "frame",
        paneDoc.value.frames[0],
      );
      if (Option.isSome(frameDoc) && frameDoc.value.assignedNodeId) {
        return Id.Node.make(frameDoc.value.assignedNodeId);
      }
    }
    return undefined;
  }

  const paneId = Id.Pane.make(nanoid());
  const frameId = Id.Frame.make(nanoid());
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
  yield* Automerge.setText(
    nodeId,
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
  yield* Automerge.setText(
    childId1,
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
  yield* Automerge.setText(
    childId2,
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
  yield* Automerge.setText(
    grandchildId,
    "And what is the use of a book without pictures or conversations?",
  );

  // Create window document
  yield* Store.setDocument(
    "window",
    {
      panes: [paneId],
      activeRegion: "stage",
      activeFrameId: frameId,
      blockSelectionAnchor: null,
      blockSelectionFocus: null,
      lastFocusedBlockId: null,
    },
    windowId,
  );

  // Create pane document
  yield* Store.setDocument(
    "pane",
    {
      parent: { id: windowId, type: "window" },
      frames: [frameId],
    },
    paneId,
  );

  // Create frame document - let navigation set assignedNodeId from URL
  yield* Store.setDocument(
    "frame",
    {
      windowId,
      parent: { id: paneId, type: "pane" },
      assignedNodeId: null,
      rootBlockId: null,
      toggledNodes: [],
      activeViewId: null,
      activePart: "body",
      activeBlockId: null,
      selectedBlocks: [],
      blockSelectionAnchor: null,
      blockSelectionFocus: null,
      goalX: null,
      goalLine: null,
      assoc: 0,
      popup: null,
    },
    frameId,
  );

  yield* Effect.log("Bootstrap complete: created window, pane, frame, node");

  return Id.Node.make(nodeId);
});
