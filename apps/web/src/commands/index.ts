import { events } from "@/livestore/schema";
import { Id, System } from "@/schema";
import { addType } from "@/services/domain/Type/addType";
import { TupleT } from "@/services/domain/Tuple";
import { AutomergeT } from "@/services/external/Automerge";
import { StoreT } from "@/services/external/Store";
import { getKhoraDocById } from "@/services/ui/Khora/getKhoraDoc";
import { Effect } from "effect";
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
 * Sets the new view as the root khora's activeViewId.
 */
const addTableViewAction = (ctx: CommandContext) =>
  Effect.gen(function* () {
    const Store = yield* StoreT;
    const Tuple = yield* TupleT;
    const Automerge = yield* AutomergeT;

    const rootKhoraId = Id.makeFrameKhoraId(ctx.frameId, ctx.nodeId);
    const rootKhoraDoc = yield* getKhoraDocById(rootKhoraId);

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
      "khora",
      { ...rootKhoraDoc, activeViewId: viewNodeId },
      rootKhoraId,
    );

    yield* Effect.logDebug("[Command.addTableView] Table view created").pipe(
      Effect.annotateLogs({
        frameId: ctx.frameId,
        nodeId: ctx.nodeId,
        rootKhoraId,
        viewNodeId,
      }),
    );
  });

/** Clears any explicit view selection on the root khora. */
const addPageViewAction = (ctx: CommandContext) =>
  Effect.gen(function* () {
    const Store = yield* StoreT;

    const rootKhoraId = Id.makeFrameKhoraId(ctx.frameId, ctx.nodeId);
    const rootKhoraDoc = yield* getKhoraDocById(rootKhoraId);

    yield* Store.setDocument(
      "khora",
      { ...rootKhoraDoc, activeViewId: null },
      rootKhoraId,
    );

    yield* Effect.logDebug("[Command.addPageView] Switched to page view").pipe(
      Effect.annotateLogs({
        frameId: ctx.frameId,
        nodeId: ctx.nodeId,
        rootKhoraId,
      }),
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
