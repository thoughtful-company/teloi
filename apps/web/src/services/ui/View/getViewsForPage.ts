import { Id, System } from "@/schema";
import { TupleT } from "@/services/domain/Tuple";
import { Effect } from "effect";

/**
 * Get all views for a page via HAS_VIEW tuples.
 * Returns the view node IDs (position 1) where the page (position 0) matches.
 */
export const getViewsForPage = (pageId: Id.Node) =>
  Effect.gen(function* () {
    const Tuple = yield* TupleT;

    // HAS_VIEW schema: (page, view) - position 0 is page
    const tuples = yield* Tuple.findByPosition(System.HAS_VIEW, 0, pageId);

    // Extract view node IDs from position 1
    return tuples.map((tuple) => tuple.members[1] as Id.Node);
  });
