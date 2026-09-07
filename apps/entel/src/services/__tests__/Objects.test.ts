import { NodeFileSystem } from "@effect/platform-node";
import { assert, layer } from "@effect/vitest";
import { Context, Effect, FileSystem, Layer } from "effect";
import { ObjectId } from "../../api/ObjectId.ts";
import type { ModelObject } from "../../api/Objects.ts";
import { type Sign, SignTitle } from "../../api/Signs.ts";
import { WorkspaceId, WorkspaceName } from "../../api/Workspaces.ts";
import { TempDataDir } from "../../test/DataDir.ts";
import { runAgainst as runServicesAgainst } from "../../test/Services.ts";
import { Objects } from "../Objects.ts";
import { ServicesLive } from "../Services.ts";
import { Signs } from "../Signs.ts";
import { events } from "../WorkspaceSchema.ts";
import { Workspaces } from "../Workspaces.ts";
import { WorkspaceStores } from "../WorkspaceStores.ts";

type Run = {
  readonly objects: typeof Objects.Service;
  readonly signs: typeof Signs.Service;
  readonly workspaces: typeof Workspaces.Service;
  readonly workspaceStores: typeof WorkspaceStores.Service;
};

const runAgainst = <A, E, R>(
  dir: string,
  use: (run: Run) => Effect.Effect<A, E, R>,
) =>
  runServicesAgainst(dir, (services) =>
    use({
      objects: Context.get(services, Objects),
      signs: Context.get(services, Signs),
      workspaces: Context.get(services, Workspaces),
      workspaceStores: Context.get(services, WorkspaceStores),
    }),
  );

// ModelObject and Sign are classes, and deepStrictEqual compares prototypes
// too, so an expected value written as a plain object needs the same shape on
// both sides.
const shape = (object: ModelObject) => ({
  id: object.id,
  kind: object.kind,
  signs: object.signs.map((sign) => ({ ...sign })),
  places: [...object.places],
  elements: [...object.elements],
});

const plain = (signs: ReadonlyArray<Sign>) =>
  signs.map((sign) => ({ ...sign }));

const titles = (signs: ReadonlyArray<{ readonly title: string }>) =>
  signs.map((sign) => sign.title);

const individual = (title: string) =>
  ({ kind: "individual", title: SignTitle.make(title) }) as const;

// Every block here commits, so they run on the real clock. The service polls
// the store until the leader has the event, and under the TestClock that poll
// never ticks.
layer(NodeFileSystem.layer, { excludeTestServices: true })(
  "Objects, on a data directory the test can read",
  (it) => {
    it.effect("keeps what an earlier run of the store wrote", () =>
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        // Scoped to the test, so the directory outlives every run below and is
        // removed once the test ends.
        const dir = yield* fs.makeTempDirectoryScoped({
          prefix: "entel-test-",
        });

        const written = yield* runAgainst(dir, ({ objects, workspaces }) =>
          Effect.gen(function* () {
            const workspace = yield* workspaces.create(
              WorkspaceName.make("atlas"),
            );

            const ship = yield* objects.create(
              workspace.id,
              individual("Ship"),
            );
            const anchor = yield* objects.create(
              workspace.id,
              individual("Anchor"),
            );
            const bearing = yield* objects.create(workspace.id, {
              kind: "tuple",
              title: SignTitle.make("Bearing"),
              places: [ship.id, anchor.id],
            });
            const fleet = yield* objects.create(workspace.id, {
              kind: "set",
              title: SignTitle.make("Fleet"),
            });

            yield* objects.addSign(
              workspace.id,
              ship.id,
              SignTitle.make("Vessel"),
            );
            yield* objects.addElement(workspace.id, fleet.id, ship.id);

            return {
              workspaceId: workspace.id,
              ship: ship.id,
              anchor: anchor.id,
              bearing: bearing.id,
              fleet: fleet.id,
            };
          }),
        );

        yield* runAgainst(dir, ({ objects, signs, workspaces }) =>
          Effect.gen(function* () {
            assert.deepStrictEqual(
              (yield* workspaces.list()).map((workspace) => workspace.id),
              [written.workspaceId],
            );

            // Signs, places and elements all survive, so the whole shape is
            // read back rather than the ids alone.
            const ship = yield* objects.get(written.workspaceId, written.ship);

            assert.deepStrictEqual(titles(ship.signs), ["Ship", "Vessel"]);

            const bearing = yield* objects.get(
              written.workspaceId,
              written.bearing,
            );

            assert.deepStrictEqual(
              [...bearing.places],
              [written.ship, written.anchor],
            );

            const fleet = yield* objects.get(
              written.workspaceId,
              written.fleet,
            );

            assert.deepStrictEqual([...fleet.elements], [written.ship]);
            assert.deepStrictEqual(
              titles(yield* signs.list(written.workspaceId)),
              ["Ship", "Anchor", "Bearing", "Fleet", "Vessel"],
            );

            yield* objects.addElement(
              written.workspaceId,
              written.fleet,
              written.anchor,
            );
          }),
        );

        yield* runAgainst(dir, ({ objects }) =>
          Effect.gen(function* () {
            const fleet = yield* objects.get(
              written.workspaceId,
              written.fleet,
            );

            assert.deepStrictEqual(
              [...fleet.elements],
              [written.ship, written.anchor],
            );
          }),
        );
      }),
    );

    it.effect(
      "materializes a sign written before objects existed as an individual",
      () =>
        Effect.gen(function* () {
          const fs = yield* FileSystem.FileSystem;
          const dir = yield* fs.makeTempDirectoryScoped({
            prefix: "entel-test-",
          });

          const legacy = ObjectId.make("legacy-sign");

          const workspaceId = yield* runAgainst(
            dir,
            ({ workspaces, workspaceStores }) =>
              Effect.gen(function* () {
                const workspace = yield* workspaces.create(
                  WorkspaceName.make("archaia"),
                );
                const store = yield* workspaceStores.open(workspace.id);

                // A store written before THC-151 has this event in its log and
                // nothing to migrate it, so the schema still has to replay it.
                // Committed here rather than through a service because no
                // service writes the old event any more.
                yield* store.commit(
                  events.signCreatedV1({
                    id: legacy,
                    title: SignTitle.make("Old Ship"),
                  }),
                );

                return workspace.id;
              }),
          );

          // A second run, so the row is read from a store that booted by
          // replaying the log rather than from the state the commit left
          // behind.
          yield* runAgainst(dir, ({ objects, signs }) =>
            Effect.gen(function* () {
              const object = yield* objects.get(workspaceId, legacy);

              // The sign had nothing to refer to, so the replay gives it an
              // individual of its own and reuses the sign's id for it.
              assert.strictEqual(object.kind, "individual");
              assert.strictEqual(object.id, legacy);
              assert.deepStrictEqual(
                object.signs.map((sign) => [
                  sign.id,
                  sign.objectId,
                  sign.title,
                ]),
                [["legacy-sign", "legacy-sign", "Old Ship"]],
              );
              assert.deepStrictEqual([...object.places], []);
              assert.deepStrictEqual([...object.elements], []);

              assert.deepStrictEqual(
                plain(yield* signs.list(workspaceId)),
                plain(object.signs),
              );
            }),
          );
        }),
    );
  },
);

// One registry and one set of workspace stores for the whole block, on a temp
// directory that goes away with the layer. Tests therefore see each other's
// workspaces, so each one works in a workspace it created itself.
layer(ServicesLive.pipe(Layer.provide(TempDataDir)), {
  excludeTestServices: true,
})("Objects, against one registry and its workspace stores", (it) => {
  it.effect("creates an object together with its first sign", () =>
    Effect.gen(function* () {
      const objects = yield* Objects;
      const workspaces = yield* Workspaces;
      const workspace = yield* workspaces.create(WorkspaceName.make("tau"));

      const created = yield* objects.create(workspace.id, individual("Ship"));

      assert.strictEqual(created.kind, "individual");
      assert.isAbove(created.id.length, 0);
      assert.strictEqual(created.signs.length, 1);
      // The sign made with the object refers to it, so nothing in the log ever
      // has a sign for nothing.
      assert.strictEqual(created.signs[0]?.objectId, created.id);
      assert.strictEqual(created.signs[0]?.title, "Ship");
      assert.deepStrictEqual([...created.places], []);
      assert.deepStrictEqual([...created.elements], []);

      assert.deepStrictEqual(
        shape(yield* objects.get(workspace.id, created.id)),
        shape(created),
      );
    }),
  );

  it.effect("keeps a tuple's places in the order they were given", () =>
    Effect.gen(function* () {
      const objects = yield* Objects;
      const workspaces = yield* Workspaces;
      const workspace = yield* workspaces.create(WorkspaceName.make("upsilon"));

      const ship = yield* objects.create(workspace.id, individual("Ship"));
      const anchor = yield* objects.create(workspace.id, individual("Anchor"));

      const bearing = yield* objects.create(workspace.id, {
        kind: "tuple",
        title: SignTitle.make("Bearing"),
        places: [anchor.id, ship.id],
      });

      assert.strictEqual(bearing.kind, "tuple");
      // Anchor before Ship, the order the caller gave, not the order the two
      // objects were created in.
      assert.deepStrictEqual([...bearing.places], [anchor.id, ship.id]);
      assert.deepStrictEqual(
        [...(yield* objects.get(workspace.id, bearing.id)).places],
        [anchor.id, ship.id],
      );
    }),
  );

  it.effect(
    "refuses a tuple whose place names an object that is not there",
    () =>
      Effect.gen(function* () {
        const objects = yield* Objects;
        const workspaces = yield* Workspaces;
        const workspace = yield* workspaces.create(WorkspaceName.make("phi"));

        const ship = yield* objects.create(workspace.id, individual("Ship"));
        const unknown = ObjectId.make("does-not-exist");
        const before = (yield* objects.list(workspace.id)).map(shape);

        const failed = yield* objects
          .create(workspace.id, {
            kind: "tuple",
            title: SignTitle.make("Bearing"),
            places: [ship.id, unknown],
          })
          .pipe(Effect.flip);

        assert.strictEqual(failed._tag, "ObjectNotFound");
        assert.deepStrictEqual(
          failed._tag === "ObjectNotFound"
            ? [failed.workspaceId, failed.objectId]
            : [],
          [workspace.id, unknown],
        );

        // The object and its first sign are one event, so a rejected tuple has
        // to leave neither behind.
        assert.deepStrictEqual(
          (yield* objects.list(workspace.id)).map(shape),
          before,
        );
      }),
  );

  it.effect("carries several signs for one object in creation order", () =>
    Effect.gen(function* () {
      const objects = yield* Objects;
      const signs = yield* Signs;
      const workspaces = yield* Workspaces;
      const workspace = yield* workspaces.create(WorkspaceName.make("chi"));

      const ship = yield* objects.create(workspace.id, individual("Ship"));
      const vessel = yield* objects.addSign(
        workspace.id,
        ship.id,
        SignTitle.make("Vessel"),
      );

      assert.strictEqual(vessel.objectId, ship.id);
      assert.notStrictEqual(vessel.id, ship.signs[0]?.id);

      const read = yield* objects.get(workspace.id, ship.id);

      assert.deepStrictEqual(
        read.signs.map((sign) => ({ ...sign })),
        plain([...ship.signs, vessel]),
      );
      // The semantic level answers the same two signs, so a second name is a
      // sign like any other and not something only the object read knows.
      assert.deepStrictEqual(
        (yield* signs.list(workspace.id)).map((sign) => ({ ...sign })),
        plain([...ship.signs, vessel]),
      );
    }),
  );

  it.effect("refuses a further sign for an object that is not there", () =>
    Effect.gen(function* () {
      const objects = yield* Objects;
      const workspaces = yield* Workspaces;
      const workspace = yield* workspaces.create(WorkspaceName.make("psi"));
      const unknown = ObjectId.make("does-not-exist");

      const failed = yield* objects
        .addSign(workspace.id, unknown, SignTitle.make("Vessel"))
        .pipe(Effect.flip);

      assert.strictEqual(failed._tag, "ObjectNotFound");
      assert.deepStrictEqual(
        failed._tag === "ObjectNotFound"
          ? [failed.workspaceId, failed.objectId]
          : [],
        [workspace.id, unknown],
      );
    }),
  );

  it.effect("answers a set's elements in the order they were added", () =>
    Effect.gen(function* () {
      const objects = yield* Objects;
      const workspaces = yield* Workspaces;
      const workspace = yield* workspaces.create(WorkspaceName.make("omega"));

      const fleet = yield* objects.create(workspace.id, {
        kind: "set",
        title: SignTitle.make("Fleet"),
      });
      const ship = yield* objects.create(workspace.id, individual("Ship"));
      const anchor = yield* objects.create(workspace.id, individual("Anchor"));

      assert.deepStrictEqual(
        [
          ...(yield* objects.addElement(workspace.id, fleet.id, ship.id))
            .elements,
        ],
        [ship.id],
      );
      assert.deepStrictEqual(
        [
          ...(yield* objects.addElement(workspace.id, fleet.id, anchor.id))
            .elements,
        ],
        [ship.id, anchor.id],
      );
      assert.deepStrictEqual(
        [...(yield* objects.get(workspace.id, fleet.id)).elements],
        [ship.id, anchor.id],
      );
    }),
  );

  it.effect("takes the same membership twice as one fact", () =>
    Effect.gen(function* () {
      const objects = yield* Objects;
      const workspaces = yield* Workspaces;
      const workspace = yield* workspaces.create(WorkspaceName.make("alpha"));

      const fleet = yield* objects.create(workspace.id, {
        kind: "set",
        title: SignTitle.make("Fleet"),
      });
      const ship = yield* objects.create(workspace.id, individual("Ship"));

      const first = yield* objects.addElement(workspace.id, fleet.id, ship.id);
      const again = yield* objects.addElement(workspace.id, fleet.id, ship.id);

      assert.deepStrictEqual([...again.elements], [...first.elements]);
      assert.deepStrictEqual(
        [...(yield* objects.get(workspace.id, fleet.id)).elements],
        [ship.id],
      );
    }),
  );

  it.effect(
    "keeps one membership when the same statement is committed twice",
    () =>
      Effect.gen(function* () {
        const objects = yield* Objects;
        const workspaces = yield* Workspaces;
        const workspaceStores = yield* WorkspaceStores;
        const workspace = yield* workspaces.create(WorkspaceName.make("kappa"));

        const fleet = yield* objects.create(workspace.id, {
          kind: "set",
          title: SignTitle.make("Fleet"),
        });
        const ship = yield* objects.create(workspace.id, individual("Ship"));

        // Two requests can both pass the service's check before either commits,
        // so the log can hold the pair twice however careful the service is.
        // Committed directly because the service never produces that log itself.
        const store = yield* workspaceStores.open(workspace.id);
        const stated = events.elementAdded({
          setId: fleet.id,
          elementId: ship.id,
        });

        yield* store.commit(stated);
        yield* store.commit(stated);

        assert.deepStrictEqual(
          [...(yield* objects.get(workspace.id, fleet.id)).elements],
          [ship.id],
        );

        // Without the materializer ignoring the second insert it would fail, and
        // a failed materializer takes the whole store down.
        const anchor = yield* objects.create(
          workspace.id,
          individual("Anchor"),
        );

        assert.strictEqual(anchor.signs[0]?.title, "Anchor");
      }),
  );

  it.effect("commits nothing for a membership already stated", () =>
    Effect.gen(function* () {
      const objects = yield* Objects;
      const workspaces = yield* Workspaces;
      const workspaceStores = yield* WorkspaceStores;
      const workspace = yield* workspaces.create(WorkspaceName.make("mu"));

      const fleet = yield* objects.create(workspace.id, {
        kind: "set",
        title: SignTitle.make("Fleet"),
      });
      const ship = yield* objects.create(workspace.id, individual("Ship"));

      const first = yield* objects.addElement(workspace.id, fleet.id, ship.id);
      const { store } = yield* workspaceStores.open(workspace.id);
      const head = store.syncStatus().localHead;

      const again = yield* objects.addElement(workspace.id, fleet.id, ship.id);

      // The log is the audit trail, and a repeated statement is the same fact,
      // so it must answer without writing anything down.
      assert.deepStrictEqual(store.syncStatus().localHead, head);
      assert.deepStrictEqual([...again.elements], [...first.elements]);
    }),
  );

  it.effect("refuses an element that is not there", () =>
    Effect.gen(function* () {
      const objects = yield* Objects;
      const workspaces = yield* Workspaces;
      const workspace = yield* workspaces.create(WorkspaceName.make("beta"));

      const fleet = yield* objects.create(workspace.id, {
        kind: "set",
        title: SignTitle.make("Fleet"),
      });
      const ship = yield* objects.create(workspace.id, individual("Ship"));
      yield* objects.addElement(workspace.id, fleet.id, ship.id);

      const unknown = ObjectId.make("does-not-exist");
      const failed = yield* objects
        .addElement(workspace.id, fleet.id, unknown)
        .pipe(Effect.flip);

      assert.strictEqual(failed._tag, "ObjectNotFound");
      assert.deepStrictEqual(
        failed._tag === "ObjectNotFound"
          ? [failed.workspaceId, failed.objectId]
          : [],
        [workspace.id, unknown],
      );

      assert.deepStrictEqual(
        [...(yield* objects.get(workspace.id, fleet.id)).elements],
        [ship.id],
      );
    }),
  );

  it.effect("refuses elements on an individual and on a tuple", () =>
    Effect.gen(function* () {
      const objects = yield* Objects;
      const workspaces = yield* Workspaces;
      const workspace = yield* workspaces.create(WorkspaceName.make("gamma"));

      const ship = yield* objects.create(workspace.id, individual("Ship"));
      const anchor = yield* objects.create(workspace.id, individual("Anchor"));
      const bearing = yield* objects.create(workspace.id, {
        kind: "tuple",
        title: SignTitle.make("Bearing"),
        places: [ship.id, anchor.id],
      });

      const onIndividual = yield* objects
        .addElement(workspace.id, ship.id, anchor.id)
        .pipe(Effect.flip);
      const onTuple = yield* objects
        .addElement(workspace.id, bearing.id, anchor.id)
        .pipe(Effect.flip);

      assert.strictEqual(onIndividual._tag, "KindMismatch");
      assert.strictEqual(onTuple._tag, "KindMismatch");

      // The object named is the one asked to hold elements, and both kinds are
      // reported, so the caller can see which side of the request to fix.
      assert.deepStrictEqual(
        onIndividual._tag === "KindMismatch"
          ? {
              objectId: onIndividual.objectId,
              expected: [...onIndividual.expected],
              actual: onIndividual.actual,
            }
          : undefined,
        {
          objectId: ship.id,
          expected: ["set", "tupleSet"],
          actual: "individual",
        },
      );
      assert.deepStrictEqual(
        onTuple._tag === "KindMismatch"
          ? {
              objectId: onTuple.objectId,
              expected: [...onTuple.expected],
              actual: onTuple.actual,
            }
          : undefined,
        {
          objectId: bearing.id,
          expected: ["set", "tupleSet"],
          actual: "tuple",
        },
      );

      assert.deepStrictEqual(
        [...(yield* objects.get(workspace.id, ship.id)).elements],
        [],
      );
    }),
  );

  it.effect("lets a tuple set hold tuples and nothing else", () =>
    Effect.gen(function* () {
      const objects = yield* Objects;
      const workspaces = yield* Workspaces;
      const workspace = yield* workspaces.create(WorkspaceName.make("delta"));

      const ship = yield* objects.create(workspace.id, individual("Ship"));
      const anchor = yield* objects.create(workspace.id, individual("Anchor"));
      const bearing = yield* objects.create(workspace.id, {
        kind: "tuple",
        title: SignTitle.make("Bearing"),
        places: [ship.id, anchor.id],
      });
      const bearings = yield* objects.create(workspace.id, {
        kind: "tupleSet",
        title: SignTitle.make("Bearings"),
      });

      assert.deepStrictEqual(
        [
          ...(yield* objects.addElement(workspace.id, bearings.id, bearing.id))
            .elements,
        ],
        [bearing.id],
      );

      const failed = yield* objects
        .addElement(workspace.id, bearings.id, ship.id)
        .pipe(Effect.flip);

      assert.strictEqual(failed._tag, "KindMismatch");
      // Here it is the element that is the wrong kind, so the error names the
      // element and not the set it was offered to.
      assert.deepStrictEqual(
        failed._tag === "KindMismatch"
          ? {
              objectId: failed.objectId,
              expected: [...failed.expected],
              actual: failed.actual,
            }
          : undefined,
        { objectId: ship.id, expected: ["tuple"], actual: "individual" },
      );

      assert.deepStrictEqual(
        [...(yield* objects.get(workspace.id, bearings.id)).elements],
        [bearing.id],
      );
    }),
  );

  it.effect("lists objects in creation order, each with its own rows", () =>
    Effect.gen(function* () {
      const objects = yield* Objects;
      const workspaces = yield* Workspaces;
      const workspace = yield* workspaces.create(WorkspaceName.make("epsilon"));

      const fleet = yield* objects.create(workspace.id, {
        kind: "set",
        title: SignTitle.make("Fleet"),
      });
      const ship = yield* objects.create(workspace.id, individual("Ship"));
      const anchor = yield* objects.create(workspace.id, individual("Anchor"));
      const bearing = yield* objects.create(workspace.id, {
        kind: "tuple",
        title: SignTitle.make("Bearing"),
        places: [ship.id, anchor.id],
      });
      const compass = yield* objects.create(
        workspace.id,
        individual("Compass"),
      );
      const needle = yield* objects.addSign(
        workspace.id,
        compass.id,
        SignTitle.make("Needle"),
      );

      yield* objects.addElement(workspace.id, fleet.id, ship.id);
      yield* objects.addElement(workspace.id, fleet.id, anchor.id);

      // Fleet gained its elements last but was created first, so an answer
      // ordered by anything the later events wrote would not look like this.
      assert.deepStrictEqual((yield* objects.list(workspace.id)).map(shape), [
        {
          id: fleet.id,
          kind: "set",
          signs: plain(fleet.signs),
          places: [],
          elements: [ship.id, anchor.id],
        },
        {
          id: ship.id,
          kind: "individual",
          signs: plain(ship.signs),
          places: [],
          elements: [],
        },
        {
          id: anchor.id,
          kind: "individual",
          signs: plain(anchor.signs),
          places: [],
          elements: [],
        },
        {
          id: bearing.id,
          kind: "tuple",
          signs: plain(bearing.signs),
          places: [ship.id, anchor.id],
          elements: [],
        },
        {
          id: compass.id,
          kind: "individual",
          signs: plain([...compass.signs, needle]),
          places: [],
          elements: [],
        },
      ]);
    }),
  );

  it.effect("fails with ObjectNotFound for an object that is not there", () =>
    Effect.gen(function* () {
      const objects = yield* Objects;
      const workspaces = yield* Workspaces;
      const workspace = yield* workspaces.create(WorkspaceName.make("zeta"));
      const unknown = ObjectId.make("does-not-exist");

      const failed = yield* objects
        .get(workspace.id, unknown)
        .pipe(Effect.flip);

      assert.strictEqual(failed._tag, "ObjectNotFound");
      assert.deepStrictEqual(
        failed._tag === "ObjectNotFound"
          ? [failed.workspaceId, failed.objectId]
          : [],
        [workspace.id, unknown],
      );
    }),
  );

  it.effect("refuses a workspace the registry never issued", () =>
    Effect.gen(function* () {
      const objects = yield* Objects;
      const unknown = WorkspaceId.make("does-not-exist");

      const onCreate = yield* objects
        .create(unknown, individual("Ship"))
        .pipe(Effect.flip);
      const onList = yield* objects.list(unknown).pipe(Effect.flip);
      const onGet = yield* objects
        .get(unknown, ObjectId.make("does-not-exist"))
        .pipe(Effect.flip);

      assert.deepStrictEqual(
        [onCreate, onList, onGet].map((error) => error._tag),
        ["WorkspaceNotFound", "WorkspaceNotFound", "WorkspaceNotFound"],
      );
      // The workspace is missing, not the object, so the id the caller asked
      // for comes back as a workspace id.
      assert.deepStrictEqual(
        [onCreate, onList, onGet].map((error) =>
          error._tag === "WorkspaceNotFound" ? error.workspaceId : error._tag,
        ),
        [unknown, unknown, unknown],
      );
    }),
  );

  it.effect("does not see an object from another workspace", () =>
    Effect.gen(function* () {
      const objects = yield* Objects;
      const workspaces = yield* Workspaces;
      const eta = yield* workspaces.create(WorkspaceName.make("eta"));
      const theta = yield* workspaces.create(WorkspaceName.make("theta"));

      const ship = yield* objects.create(eta.id, individual("Ship"));

      // A bare object id says nothing about which workspace it is in, so one
      // from elsewhere is simply not found here.
      const onGet = yield* objects.get(theta.id, ship.id).pipe(Effect.flip);

      assert.strictEqual(onGet._tag, "ObjectNotFound");
      assert.deepStrictEqual(
        onGet._tag === "ObjectNotFound"
          ? [onGet.workspaceId, onGet.objectId]
          : [],
        [theta.id, ship.id],
      );

      const asPlace = yield* objects
        .create(theta.id, {
          kind: "tuple",
          title: SignTitle.make("Bearing"),
          places: [ship.id],
        })
        .pipe(Effect.flip);

      assert.strictEqual(asPlace._tag, "ObjectNotFound");
      assert.deepStrictEqual(
        asPlace._tag === "ObjectNotFound"
          ? [asPlace.workspaceId, asPlace.objectId]
          : [],
        [theta.id, ship.id],
      );

      assert.deepStrictEqual(yield* objects.list(theta.id), []);
    }),
  );
});

// Its own block, and its only test, because it shuts a workspace store down.
// RcMap hands the same dead store to every later call against this layer, so
// they would all fail for that reason rather than their own.
layer(ServicesLive.pipe(Layer.provide(TempDataDir)), {
  excludeTestServices: true,
})("Objects, with a workspace store shut down", (it) => {
  it.effect("names the workspace as the store that is unavailable", () =>
    Effect.gen(function* () {
      const objects = yield* Objects;
      const workspaces = yield* Workspaces;
      const workspaceStores = yield* WorkspaceStores;

      const workspace = yield* workspaces.create(WorkspaceName.make("iota"));
      const { store } = yield* workspaceStores.open(workspace.id);

      yield* store.shutdown();

      // Made-up ids, because every read that would tell an id apart from a
      // made-up one goes through the store that is gone.
      const someObject = ObjectId.make("some-object");
      const onCreate = yield* objects
        .create(workspace.id, individual("Ship"))
        .pipe(Effect.flip);
      const onGet = yield* objects
        .get(workspace.id, someObject)
        .pipe(Effect.flip);
      const onAddElement = yield* objects
        .addElement(workspace.id, someObject, ObjectId.make("some-element"))
        .pipe(Effect.flip);

      assert.deepStrictEqual(
        [onCreate, onGet, onAddElement].map((error) => error._tag),
        ["StoreUnavailable", "StoreUnavailable", "StoreUnavailable"],
      );

      // The registry is fine, so the error has to point at the workspace and
      // not at the one store entel owns itself.
      assert.deepStrictEqual(
        [onCreate, onGet, onAddElement].map((error) =>
          error._tag === "StoreUnavailable" ? error.store : error._tag,
        ),
        [workspace.id, workspace.id, workspace.id],
      );
    }),
  );
});
