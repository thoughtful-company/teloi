import { events } from "@/livestore/schema";
import { Id } from "@/schema";
import { StoreT } from "@/services/external/Store";
import { Effect, Option } from "effect";
import { nanoid } from "nanoid";

/**
 * Bootstrap effect that ensures the app has required initial state.
 * Creates window → pane → buffer → node hierarchy if not present.
 */
export const bootstrap = Effect.gen(function* () {
  const Store = yield* StoreT;
  const windowId = Id.Window.make(yield* Store.getSessionId());

  const windowDoc = yield* Store.getDocument("window", windowId);

  // Already initialized
  if (Option.isSome(windowDoc) && windowDoc.value.panes.length > 0) {
    return;
  }

  const paneId = Id.Pane.make(nanoid());
  const bufferId = Id.Buffer.make(nanoid());
  const nodeId = nanoid();

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

  // Create buffer document
  yield* Store.setDocument(
    "buffer",
    {
      windowId,
      parent: { id: paneId, type: "pane" },
      assignedNodeId: nodeId,
      selectedNodes: [],
      toggledNodes: [],
    },
    bufferId,
  );

  yield* Effect.log("Bootstrap complete: created window, pane, buffer, node");
});
