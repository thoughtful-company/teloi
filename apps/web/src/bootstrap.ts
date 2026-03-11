import { events } from "@/livestore/schema";
import { Id } from "@/schema";
import { AutomergeT } from "@/services/external/Automerge";
import { StoreT } from "@/services/external/Store";
import { Effect, Option } from "effect";
import { nanoid } from "nanoid";

/**
 * Bootstrap effect that ensures the app has required initial state.
 * Creates world → pane → frame → node hierarchy if not present.
 * Returns the fallback nodeId for URL sync (either newly created or existing).
 */
export const bootstrap = Effect.gen(function* () {
  const Store = yield* StoreT;
  const Automerge = yield* AutomergeT;
  const sessionId = yield* Store.getSessionId();
  const worldId = Id.World.make(sessionId);

  const worldDoc = yield* Store.getDocument("world", worldId);

  // Already initialized - get existing frame's assignedNodeId as fallback
  if (Option.isSome(worldDoc) && worldDoc.value.panes.length > 0) {
    const paneDoc = yield* Store.getDocument("pane", worldDoc.value.panes[0]);
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

  // Create world document
  yield* Store.setDocument(
    "world",
    {
      panes: [paneId],
      activeRegion: "stage",
      activeFrameId: frameId,
    },
    worldId,
  );

  // Create pane document
  yield* Store.setDocument(
    "pane",
    {
      parent: { id: worldId, type: "world" },
      frames: [frameId],
    },
    paneId,
  );

  // Create frame document - let navigation set assignedNodeId from URL
  yield* Store.setDocument(
    "frame",
    {
      worldId,
      parent: { id: paneId, type: "pane" },
      assignedNodeId: null,
      rootKhoraId: null,
      toggledNodes: [],
      activeViewId: null,
      activePart: "khora",
      khoraSelectionAnchor: null,
      khoraSelectionFocus: null,
      selectedKhoras: [],
      popup: null,
    },
    frameId,
  );

  yield* Effect.log("Bootstrap complete: created world, pane, frame, node");

  return Id.Node.make(nodeId);
});
