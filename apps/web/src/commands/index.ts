import { events } from "@/livestore/schema";
import { Id } from "@/schema";
import { TupleT } from "@/services/domain/Tuple";
import { StoreT } from "@/services/external/Store";
import { YjsT } from "@/services/external/Yjs";
import { Effect, Option } from "effect";
import { nanoid } from "nanoid";

/** Well-known tuple type for linking nodes to views */
const HAS_VIEW_TUPLE_TYPE = "sys:tuple-type:has-view" as Id.Node;

export interface CommandContext {
  bufferId: Id.Buffer;
  nodeId: Id.Node;
}

export interface Command {
  id: string;
  label: string;
  action: (context: CommandContext) => Effect.Effect<void, unknown, StoreT | TupleT | YjsT>;
}

/**
 * Creates a TableView node and links it to the target node via HAS_VIEW tuple.
 * Sets the new view as the buffer's activeViewId.
 */
const addTableViewAction = (ctx: CommandContext) =>
  Effect.gen(function* () {
    const Store = yield* StoreT;
    const Tuple = yield* TupleT;
    const Yjs = yield* YjsT;

    const viewNodeId = Id.Node.make(nanoid());
    yield* Store.commit(
      events.nodeCreated({
        timestamp: Date.now(),
        data: { nodeId: viewNodeId },
      }),
    );
    Yjs.getText(viewNodeId).insert(0, "Table View");

    yield* Tuple.create(HAS_VIEW_TUPLE_TYPE, [ctx.nodeId, viewNodeId]);

    const bufferDoc = yield* Store.getDocument("buffer", ctx.bufferId);
    if (Option.isNone(bufferDoc)) return;

    yield* Store.setDocument(
      "buffer",
      {
        ...bufferDoc.value,
        activeViewId: viewNodeId,
      },
      ctx.bufferId,
    );
  });

/**
 * Resets the buffer to show the default page view by clearing activeViewId.
 */
const addPageViewAction = (ctx: CommandContext) =>
  Effect.gen(function* () {
    const Store = yield* StoreT;

    const bufferDoc = yield* Store.getDocument("buffer", ctx.bufferId);
    if (Option.isNone(bufferDoc)) return;

    yield* Store.setDocument(
      "buffer",
      {
        ...bufferDoc.value,
        activeViewId: null,
      },
      ctx.bufferId,
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
