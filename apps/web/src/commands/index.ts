import { events } from "@/livestore/schema";
import { Id, System } from "@/schema";
import { addType } from "@/services/domain/Type/addType";
import { TupleT } from "@/services/domain/Tuple";
import { AutomergeT } from "@/services/external/Automerge";
import { StoreT } from "@/services/external/Store";
import { Effect, Option } from "effect";
import { nanoid } from "nanoid";

export interface CommandContext {
  frameId: Id.Frame;
  nodeId: Id.Node;
}

export interface Command {
  id: string;
  label: string;
  action: (
    context: CommandContext,
  ) => Effect.Effect<void, unknown, StoreT | TupleT | AutomergeT>;
}

/**
 * Creates a TableView node and links it to the target node via HAS_VIEW tuple.
 * Sets the new view as the frame's activeViewId.
 */
const addTableViewAction = (ctx: CommandContext) =>
  Effect.gen(function* () {
    const Store = yield* StoreT;
    const Tuple = yield* TupleT;
    const Automerge = yield* AutomergeT;

    const frameDoc = yield* Store.getDocument("frame", ctx.frameId);
    if (Option.isNone(frameDoc)) {
      yield* Effect.logError(
        "[Command.addTableView] Frame document not found",
      ).pipe(Effect.annotateLogs({ frameId: ctx.frameId, nodeId: ctx.nodeId }));
      return;
    }

    const viewNodeId = Id.Node.make(nanoid());
    yield* Store.commit(
      events.nodeCreated({
        timestamp: Date.now(),
        data: { nodeId: viewNodeId },
      }),
    );
    yield* Automerge.setText(viewNodeId, "Table View");
    yield* addType(viewNodeId, System.TABLE_VIEW);

    yield* Tuple.create(System.HAS_VIEW, [ctx.nodeId, viewNodeId]);

    yield* Store.setDocument(
      "frame",
      {
        ...frameDoc.value,
        activeViewId: viewNodeId,
      },
      ctx.frameId,
    );

    yield* Effect.logDebug("[Command.addTableView] Table view created").pipe(
      Effect.annotateLogs({
        frameId: ctx.frameId,
        nodeId: ctx.nodeId,
        viewNodeId,
      }),
    );
  });

/**
 * Resets the frame to show the default page view by clearing activeViewId.
 */
const addPageViewAction = (ctx: CommandContext) =>
  Effect.gen(function* () {
    const Store = yield* StoreT;

    const frameDoc = yield* Store.getDocument("frame", ctx.frameId);
    if (Option.isNone(frameDoc)) {
      yield* Effect.logError(
        "[Command.addPageView] Frame document not found",
      ).pipe(Effect.annotateLogs({ frameId: ctx.frameId, nodeId: ctx.nodeId }));
      return;
    }

    yield* Store.setDocument(
      "frame",
      {
        ...frameDoc.value,
        activeViewId: null,
      },
      ctx.frameId,
    );

    yield* Effect.logDebug("[Command.addPageView] Switched to page view").pipe(
      Effect.annotateLogs({ frameId: ctx.frameId, nodeId: ctx.nodeId }),
    );
  });

export const commands: Command[] = [
  {
    id: "add-table-view",
    label: "Add Table View",
    action: addTableViewAction,
  },
  {
    id: "add-page-view",
    label: "Add Page View",
    action: addPageViewAction,
  },
];
