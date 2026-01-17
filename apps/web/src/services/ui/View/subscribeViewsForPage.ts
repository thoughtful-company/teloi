import { Id, System } from "@/schema";
import { TupleT } from "@/services/domain/Tuple";
import { Effect, Stream } from "effect";

/**
 * Subscribe to views for a page.
 * Emits whenever HAS_VIEW tuples change for the given page.
 */
export const subscribeViewsForPage = (pageId: Id.Node) =>
  Effect.gen(function* () {
    const Tuple = yield* TupleT;

    // Subscribe to HAS_VIEW tuples where position 0 = pageId
    const hasViewStream = yield* Tuple.subscribeByPosition(
      System.HAS_VIEW,
      0,
      pageId,
    );

    // Map tuple changes to view IDs
    return Stream.map(hasViewStream, (tuples) =>
      tuples.map((tuple) => tuple.members[1] as Id.Node),
    );
  });
