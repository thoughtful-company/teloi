import { nanoid } from "@livestore/livestore";
import { Context, Effect, Layer } from "effect";
import type { StoreUnavailable } from "../api/Errors.ts";
import { ObjectId } from "../api/ObjectId.ts";
import {
  type CreateObject,
  KindMismatch,
  ModelObject,
  type ObjectKind,
  ObjectNotFound,
} from "../api/Objects.ts";
import { Sign, SignId, type SignTitle } from "../api/Signs.ts";
import type { WorkspaceId, WorkspaceNotFound } from "../api/Workspaces.ts";
import { signFromRow } from "./Signs.ts";
import {
  elements,
  events,
  type ObjectCreated,
  objects,
  places,
  signs,
} from "./WorkspaceSchema.ts";
import { type WorkspaceStore, WorkspaceStores } from "./WorkspaceStores.ts";

// The ontological level of a workspace: what exists, of which kind, and how
// those things relate. Signs are made here too, because a sign is always a
// sign of something.
export class Objects extends Context.Service<
  Objects,
  {
    readonly create: (
      workspaceId: WorkspaceId,
      input: CreateObject,
    ) => Effect.Effect<
      ModelObject,
      WorkspaceNotFound | ObjectNotFound | StoreUnavailable
    >;
    readonly list: (
      workspaceId: WorkspaceId,
    ) => Effect.Effect<
      ReadonlyArray<ModelObject>,
      WorkspaceNotFound | StoreUnavailable
    >;
    readonly get: (
      workspaceId: WorkspaceId,
      objectId: ObjectId,
    ) => Effect.Effect<
      ModelObject,
      WorkspaceNotFound | ObjectNotFound | StoreUnavailable
    >;
    readonly addSign: (
      workspaceId: WorkspaceId,
      objectId: ObjectId,
      title: SignTitle,
    ) => Effect.Effect<
      Sign,
      WorkspaceNotFound | ObjectNotFound | StoreUnavailable
    >;
    // Answers the set as it is after the statement, whether or not this call
    // was the one that added the element.
    readonly addElement: (
      workspaceId: WorkspaceId,
      setId: ObjectId,
      elementId: ObjectId,
    ) => Effect.Effect<
      ModelObject,
      WorkspaceNotFound | ObjectNotFound | KindMismatch | StoreUnavailable
    >;
  }
>()("entel/Objects") {}

export const ObjectsLive = Layer.effect(
  Objects,
  Effect.gen(function* () {
    const workspaceStores = yield* WorkspaceStores;

    const create = Effect.fn("Objects.create")(function* (
      workspaceId: WorkspaceId,
      input: CreateObject,
    ) {
      const workspace = yield* workspaceStores.open(workspaceId);
      const placed: ReadonlyArray<ObjectId> =
        input.kind === "tuple" ? input.places : [];
      // A place has to be an object of this workspace before the tuple is
      // committed. The materializer cannot refuse, so the check is here.
      yield* requireAll(workspace, workspaceId, placed);

      const id = ObjectId.make(nanoid());
      const sign = new Sign({
        id: SignId.make(nanoid()),
        objectId: id,
        title: input.title,
      });
      const created: ObjectCreated =
        input.kind === "tuple"
          ? {
              id,
              kind: input.kind,
              places: input.places,
              signId: sign.id,
              title: sign.title,
            }
          : { id, kind: input.kind, signId: sign.id, title: sign.title };
      yield* workspace.commit(events.objectCreated(created)).pipe(
        Effect.andThen(Effect.logInfo("[Objects.create] object created")),
        Effect.annotateLogs({
          workspaceId,
          objectId: id,
          kind: input.kind,
          signId: sign.id,
          title: sign.title,
          places: placed,
        }),
      );
      return new ModelObject({
        id,
        kind: input.kind,
        signs: [sign],
        places: placed,
        elements: [],
      });
    });

    const list = Effect.fn("Objects.list")(function* (
      workspaceId: WorkspaceId,
    ) {
      const workspace = yield* workspaceStores.open(workspaceId);
      const rows = yield* workspace.run("query", () =>
        workspace.store.query(
          objects.select("id", "kind").orderBy("seq", "asc"),
        ),
      );
      const relations = yield* relationsOf(workspace, rows);
      return rows.map((row) => assemble(row, relations));
    });

    const get = Effect.fn("Objects.get")(function* (
      workspaceId: WorkspaceId,
      objectId: ObjectId,
    ) {
      const workspace = yield* workspaceStores.open(workspaceId);
      const row = yield* requireOne(workspace, workspaceId, objectId);
      return assemble(row, yield* relationsOf(workspace, [row]));
    });

    const addSign = Effect.fn("Objects.addSign")(function* (
      workspaceId: WorkspaceId,
      objectId: ObjectId,
      title: SignTitle,
    ) {
      const workspace = yield* workspaceStores.open(workspaceId);
      yield* requireOne(workspace, workspaceId, objectId);
      const sign = new Sign({ id: SignId.make(nanoid()), objectId, title });
      yield* workspace.commit(events.signCreated(sign)).pipe(
        Effect.andThen(Effect.logInfo("[Objects.addSign] sign created")),
        Effect.annotateLogs({
          workspaceId,
          objectId,
          signId: sign.id,
          title,
        }),
      );
      return sign;
    });

    const addElement = Effect.fn("Objects.addElement")(function* (
      workspaceId: WorkspaceId,
      setId: ObjectId,
      elementId: ObjectId,
    ) {
      const workspace = yield* workspaceStores.open(workspaceId);
      const set = yield* requireOne(workspace, workspaceId, setId);
      if (set.kind !== "set" && set.kind !== "tupleSet") {
        return yield* new KindMismatch({
          objectId: setId,
          expected: ["set", "tupleSet"],
          actual: set.kind,
        });
      }
      const element = yield* requireOne(workspace, workspaceId, elementId);
      // A tuple set is a set whose elements are tuples. That is what makes it
      // one, so anything else is refused rather than stored.
      if (set.kind === "tupleSet" && element.kind !== "tuple") {
        return yield* new KindMismatch({
          objectId: elementId,
          expected: ["tuple"],
          actual: element.kind,
        });
      }

      const before = assemble(set, yield* relationsOf(workspace, [set]));
      // Membership is a fact. Stating it again is the same fact, so it costs
      // no event and the set is answered as it already is. Two concurrent
      // first statements can both pass this check; the materializer ignores
      // the second row for the same reason.
      if (before.elements.includes(elementId)) return before;
      yield* workspace
        .commit(events.elementAdded({ setId, elementId }))
        .pipe(
          Effect.andThen(Effect.logInfo("[Objects.addElement] element added")),
          Effect.annotateLogs({ workspaceId, setId, elementId }),
        );
      return assemble(set, yield* relationsOf(workspace, [set]));
    });

    return Objects.of({ create, list, get, addSign, addElement });
  }),
);

// ================================ Internal ===================================

interface ObjectRow {
  readonly id: string;
  readonly kind: ObjectKind;
}

// The object with the id, or ObjectNotFound. Every command that names an
// existing object goes through here, so the 404 is raised the same way
// whether the id came from the path or from a payload.
const requireOne = (
  workspace: WorkspaceStore,
  workspaceId: WorkspaceId,
  objectId: ObjectId,
): Effect.Effect<ObjectRow, ObjectNotFound | StoreUnavailable> =>
  Effect.flatMap(
    workspace.run("query", () =>
      workspace.store.query(
        objects.select("id", "kind").where("id", objectId).first(),
      ),
    ),
    (row) =>
      row === undefined
        ? new ObjectNotFound({ workspaceId, objectId })
        : Effect.succeed(row),
  );

// Fails on the first id, in the order given, that is not an object here. Each
// id in an IN clause is one bound parameter and SQLite refuses a statement
// past its limit, so distinct ids are looked up in bounded batches. A tuple
// that large is not expected, but the payload does not cap places, and a
// 503 for a valid request would be the wrong answer.
const requireAll = (
  workspace: WorkspaceStore,
  workspaceId: WorkspaceId,
  ids: ReadonlyArray<ObjectId>,
): Effect.Effect<void, ObjectNotFound | StoreUnavailable> =>
  Effect.flatMap(
    Effect.forEach(batches([...new Set(ids)], parametersPerQuery), (batch) =>
      workspace.run("query", () =>
        workspace.store.query(objects.select("id").where("id", "IN", batch)),
      ),
    ),
    (found) => {
      const known = new Set<string>(found.flat());
      const missing = ids.find((id) => !known.has(id));
      return missing === undefined
        ? Effect.void
        : new ObjectNotFound({ workspaceId, objectId: missing });
    },
  );

// SQLite's default limit on bound parameters is 32766. Half of it leaves room
// for whatever else a statement binds.
const parametersPerQuery = 16000;

const batches = <A>(
  items: ReadonlyArray<A>,
  size: number,
): ReadonlyArray<ReadonlyArray<A>> => {
  const out: Array<ReadonlyArray<A>> = [];
  for (let i = 0; i < items.length; i += size) {
    out.push(items.slice(i, i + size));
  }
  return out;
};

interface Relations {
  readonly signsBy: ReadonlyMap<string, ReadonlyArray<SignRow>>;
  readonly placesBy: ReadonlyMap<string, ReadonlyArray<PlaceRow>>;
  readonly elementsBy: ReadonlyMap<string, ReadonlyArray<ElementRow>>;
}

interface SignRow {
  readonly id: string;
  readonly objectId: string;
  readonly title: string;
}

interface PlaceRow {
  readonly tupleId: string;
  readonly position: number;
  readonly objectId: string;
}

interface ElementRow {
  readonly setId: string;
  readonly elementId: string;
}

// Everything the three relation tables hold about these objects, one query
// per table rather than one per object. Each id becomes one bound parameter
// of the IN clause, and SQLite refuses a statement past its parameter limit,
// 32766 on current builds, so a list over more objects than that fails as a
// 503 rather than slowing down. Paging is the fix, and a client needs it
// before that anyway.
const relationsOf = (
  workspace: WorkspaceStore,
  rows: ReadonlyArray<ObjectRow>,
): Effect.Effect<Relations, StoreUnavailable> =>
  Effect.map(
    workspace.run("query", () => {
      const ids = rows.map((row) => row.id);
      return [
        workspace.store.query(
          signs
            .select("id", "objectId", "title")
            .where("objectId", "IN", ids)
            .orderBy("seq", "asc"),
        ),
        workspace.store.query(
          places
            .select("tupleId", "position", "objectId")
            .where("tupleId", "IN", ids)
            .orderBy("position", "asc"),
        ),
        workspace.store.query(
          elements
            .select("setId", "elementId")
            .where("setId", "IN", ids)
            .orderBy("seq", "asc"),
        ),
      ] as const;
    }),
    ([signRows, placeRows, elementRows]) => ({
      signsBy: groupBy(signRows, (row) => row.objectId),
      placesBy: groupBy(placeRows, (row) => row.tupleId),
      elementsBy: groupBy(elementRows, (row) => row.setId),
    }),
  );

const assemble = (row: ObjectRow, relations: Relations): ModelObject =>
  new ModelObject({
    id: ObjectId.make(row.id),
    kind: row.kind,
    signs: (relations.signsBy.get(row.id) ?? []).map(signFromRow),
    places: (relations.placesBy.get(row.id) ?? []).map((place) =>
      ObjectId.make(place.objectId),
    ),
    elements: (relations.elementsBy.get(row.id) ?? []).map((element) =>
      ObjectId.make(element.elementId),
    ),
  });

const groupBy = <A>(
  rows: ReadonlyArray<A>,
  key: (row: A) => string,
): Map<string, Array<A>> => {
  const groups = new Map<string, Array<A>>();
  for (const row of rows) {
    const k = key(row);
    const group = groups.get(k);
    if (group === undefined) groups.set(k, [row]);
    else group.push(row);
  }
  return groups;
};
