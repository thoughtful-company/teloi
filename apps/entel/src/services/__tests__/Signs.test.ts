import { NodeFileSystem } from "@effect/platform-node";
import { assert, layer } from "@effect/vitest";
import { Context, Effect, FileSystem, Layer } from "effect";
import { SignTitle } from "../../api/Signs.ts";
import { WorkspaceId, WorkspaceName } from "../../api/Workspaces.ts";
import { TempDataDir } from "../../test/DataDir.ts";
import { runAgainst as runServicesAgainst } from "../../test/Services.ts";
import { Objects } from "../Objects.ts";
import { Registry } from "../Registry.ts";
import { ServicesLive } from "../Services.ts";
import { Signs } from "../Signs.ts";
import { Workspaces } from "../Workspaces.ts";
import { WorkspaceStores } from "../WorkspaceStores.ts";

type Run = {
  readonly objects: typeof Objects.Service;
  readonly signs: typeof Signs.Service;
  readonly workspaces: typeof Workspaces.Service;
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
    }),
  );

const titles = (signs: ReadonlyArray<{ readonly title: string }>) =>
  signs.map((sign) => sign.title);

// A sign is only ever made with the object it stands for, so every sign these
// tests read had to be written through Objects first. Individuals, because
// nothing here cares which kind the object is.
const individual = (title: string) =>
  ({ kind: "individual", title: SignTitle.make(title) }) as const;

// Every block here commits, so they run on the real clock. The service polls
// the store until the leader has the event, and under the TestClock that poll
// never ticks.
layer(NodeFileSystem.layer, { excludeTestServices: true })(
  "Signs, on a data directory the test can read",
  (it) => {
    it.effect("keeps signs written by an earlier run of the store", () =>
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        // Scoped to the test, so the directory outlives every run below and is
        // removed once the test ends.
        const dir = yield* fs.makeTempDirectoryScoped({
          prefix: "entel-test-",
        });

        const workspaceId = yield* runAgainst(
          dir,
          ({ objects, signs, workspaces }) =>
            Effect.gen(function* () {
              const workspace = yield* workspaces.create(
                WorkspaceName.make("atlas"),
              );
              const created = yield* objects.create(
                workspace.id,
                individual("Ship"),
              );

              assert.deepStrictEqual(
                (yield* signs.list(workspace.id)).map((sign) => ({ ...sign })),
                [{ ...created.signs[0] }],
              );

              return workspace.id;
            }),
        );

        yield* runAgainst(dir, ({ objects, signs, workspaces }) =>
          Effect.gen(function* () {
            assert.deepStrictEqual(
              (yield* workspaces.list()).map((workspace) => workspace.id),
              [workspaceId],
            );
            assert.deepStrictEqual(titles(yield* signs.list(workspaceId)), [
              "Ship",
            ]);

            yield* objects.create(workspaceId, individual("Voyage"));
          }),
        );

        yield* runAgainst(dir, ({ signs }) =>
          Effect.gen(function* () {
            assert.deepStrictEqual(titles(yield* signs.list(workspaceId)), [
              "Ship",
              "Voyage",
            ]);
          }),
        );
      }),
    );

    it.effect("keeps each workspace's signs in a store of its own", () =>
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const dir = yield* fs.makeTempDirectoryScoped({
          prefix: "entel-test-",
        });

        yield* runAgainst(dir, ({ objects, signs, workspaces }) =>
          Effect.gen(function* () {
            const alpha = yield* workspaces.create(WorkspaceName.make("alpha"));
            const beta = yield* workspaces.create(WorkspaceName.make("beta"));

            yield* objects.create(alpha.id, individual("Ship"));
            yield* objects.create(alpha.id, individual("Voyage"));

            // A workspace store is opened on first use, so beta has no
            // directory yet and its signs cannot have gone anywhere near it.
            const beforeBetaOpened = yield* fs.readDirectory(dir);

            assert.include(beforeBetaOpened, "registry");
            assert.include(beforeBetaOpened, alpha.id);
            assert.notInclude(beforeBetaOpened, beta.id);

            assert.deepStrictEqual(yield* signs.list(beta.id), []);
            assert.deepStrictEqual(titles(yield* signs.list(alpha.id)), [
              "Ship",
              "Voyage",
            ]);

            assert.include(yield* fs.readDirectory(dir), beta.id);

            // An id the registry never issued must not become a directory,
            // whatever else the request does. This is the check that keeps a
            // path parameter from naming a place on disk.
            const unknown = WorkspaceId.make("does-not-exist");
            yield* signs.list(unknown).pipe(Effect.flip);

            assert.notInclude(yield* fs.readDirectory(dir), unknown);
          }),
        );
      }),
    );

    it.effect("reads every workspace's signs after a restart", () =>
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const dir = yield* fs.makeTempDirectoryScoped({
          prefix: "entel-test-",
        });

        const created = yield* runAgainst(dir, ({ objects, workspaces }) =>
          Effect.gen(function* () {
            const lambda = yield* workspaces.create(
              WorkspaceName.make("lambda"),
            );
            const mu = yield* workspaces.create(WorkspaceName.make("mu"));

            yield* objects.create(lambda.id, individual("Ship"));
            yield* objects.create(mu.id, individual("Voyage"));

            return [lambda.id, mu.id];
          }),
        );

        yield* runAgainst(dir, ({ signs }) =>
          Effect.gen(function* () {
            // The first call of the run, so no workspace store has been opened
            // yet. Reading across workspaces has to open them itself, or it
            // answers for the ones a caller happened to touch before.
            const rows = yield* signs.listAll();

            assert.deepStrictEqual(
              rows.map((row) => [row.workspaceId, row.sign.title]),
              [
                [created[0], "Ship"],
                [created[1], "Voyage"],
              ],
            );
          }),
        );
      }),
    );

    it.effect("boots a store again after a failed first open", () =>
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const dir = yield* fs.makeTempDirectoryScoped({
          prefix: "entel-test-",
        });

        yield* runAgainst(dir, ({ signs, workspaces }) =>
          Effect.gen(function* () {
            const workspace = yield* workspaces.create(
              WorkspaceName.make("iota"),
            );
            // A plain file where the store's directory has to go, so the boot
            // fails for a reason that goes away again.
            const inTheWay = `${dir}/${workspace.id}`;
            yield* fs.writeFileString(inTheWay, "");

            const failed = yield* signs.list(workspace.id).pipe(Effect.flip);

            assert.strictEqual(failed._tag, "StoreUnavailable");
            assert.deepStrictEqual(
              failed._tag === "StoreUnavailable"
                ? [failed.store, failed.detail]
                : [],
              [workspace.id, "open"],
            );

            yield* fs.remove(inTheWay);

            // The failed boot must not have been cached, or this stays a 503
            // until restart.
            assert.deepStrictEqual(yield* signs.list(workspace.id), []);
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
})("Signs, against one registry and its workspace stores", (it) => {
  it.effect("a new sign is on the leader before create returns", () =>
    Effect.gen(function* () {
      const objects = yield* Objects;
      const workspaces = yield* Workspaces;
      const workspaceStores = yield* WorkspaceStores;

      const workspace = yield* workspaces.create(WorkspaceName.make("gamma"));
      yield* objects.create(workspace.id, individual("Ship"));

      // commit only applies the event to local state. Returning before the
      // leader has it would let a caller read a sign that a crash one moment
      // later would erase.
      const { store } = yield* workspaceStores.open(workspace.id);

      assert.isTrue(store.syncStatus().isSynced);
    }),
  );

  it.effect("hands back the same store on every later open", () =>
    Effect.gen(function* () {
      const workspaces = yield* Workspaces;
      const workspaceStores = yield* WorkspaceStores;
      const workspace = yield* workspaces.create(WorkspaceName.make("theta"));

      const first = yield* workspaceStores.open(workspace.id);
      const second = yield* workspaceStores.open(workspace.id);

      // A second boot of the same store id would be a second leader on the
      // same files.
      assert.strictEqual(second.store, first.store);
    }),
  );

  it.effect("refuses a workspace the registry never issued", () =>
    Effect.gen(function* () {
      const objects = yield* Objects;
      const signs = yield* Signs;
      const unknown = WorkspaceId.make("does-not-exist");

      const onCreate = yield* objects
        .create(unknown, individual("Ship"))
        .pipe(Effect.flip);
      const onList = yield* signs.list(unknown).pipe(Effect.flip);

      assert.strictEqual(onCreate._tag, "WorkspaceNotFound");
      assert.strictEqual(onList._tag, "WorkspaceNotFound");

      // The id the caller asked for comes back, so an operator can tell which
      // workspace the request named.
      assert.deepStrictEqual(
        [onCreate, onList].map((error) =>
          error._tag === "WorkspaceNotFound" ? error.workspaceId : error._tag,
        ),
        [unknown, unknown],
      );
    }),
  );

  it.effect("creates many signs in one workspace at once", () =>
    Effect.gen(function* () {
      const objects = yield* Objects;
      const signs = yield* Signs;
      const workspaces = yield* Workspaces;
      const workspace = yield* workspaces.create(WorkspaceName.make("delta"));
      const wanted = Array.from({ length: 20 }, (_, index) => `sign-${index}`);

      // Every create waits for the leader on its own. The store hands out one
      // shared queue of sync updates, so a wait that consumed from it would
      // starve the other nineteen and they would time out as 503s.
      const created = yield* Effect.all(
        wanted.map((title) => objects.create(workspace.id, individual(title))),
        { concurrency: "unbounded" },
      );

      assert.deepStrictEqual(
        titles(created.flatMap((object) => object.signs)).sort(),
        [...wanted].sort(),
      );
      assert.deepStrictEqual(
        titles(yield* signs.list(workspace.id)).sort(),
        [...wanted].sort(),
      );
    }),
  );

  it.effect(
    "lists every sign across workspaces, workspaces first then signs",
    () =>
      Effect.gen(function* () {
        const objects = yield* Objects;
        const signs = yield* Signs;
        const workspaces = yield* Workspaces;

        const nu = yield* workspaces.create(WorkspaceName.make("nu"));
        const xi = yield* workspaces.create(WorkspaceName.make("xi"));
        const omicron = yield* workspaces.create(WorkspaceName.make("omicron"));
        const pi = yield* workspaces.create(WorkspaceName.make("pi"));

        // Interleaved on purpose. omicron's and pi's signs are written before
        // nu's second one, so an answer that followed sign creation order
        // alone would put them in the middle.
        const ship = yield* objects.create(nu.id, individual("Ship"));
        const anchor = yield* objects.create(omicron.id, individual("Anchor"));
        const compass = yield* objects.create(pi.id, individual("Compass"));
        const voyage = yield* objects.create(nu.id, individual("Voyage"));

        // The block shares its registry, so the other tests' workspaces are in
        // the answer as well and only these four can be asserted on.
        const mine = new Set<string>([nu.id, xi.id, omicron.id, pi.id]);
        const rows = (yield* signs.listAll()).filter((row) =>
          mine.has(row.workspaceId),
        );

        // WorkspaceSign and Sign are classes, and deepStrictEqual compares
        // prototypes too. xi has no row at all in the expected answer, rather
        // than an empty one or a failure.
        assert.deepStrictEqual(
          rows.map((row) => ({
            workspaceId: row.workspaceId,
            sign: { ...row.sign },
          })),
          [
            { workspaceId: nu.id, sign: { ...ship.signs[0] } },
            { workspaceId: nu.id, sign: { ...voyage.signs[0] } },
            { workspaceId: omicron.id, sign: { ...anchor.signs[0] } },
            { workspaceId: pi.id, sign: { ...compass.signs[0] } },
          ],
        );
      }),
  );

  it.effect("keeps concurrent creates in the workspace they name", () =>
    Effect.gen(function* () {
      const objects = yield* Objects;
      const signs = yield* Signs;
      const workspaces = yield* Workspaces;
      const epsilon = yield* workspaces.create(WorkspaceName.make("epsilon"));
      const zeta = yield* workspaces.create(WorkspaceName.make("zeta"));

      const wanted = (prefix: string) =>
        Array.from({ length: 10 }, (_, index) => `${prefix}-${index}`);

      yield* Effect.all(
        [
          ...wanted("epsilon").map((title) =>
            objects.create(epsilon.id, individual(title)),
          ),
          ...wanted("zeta").map((title) =>
            objects.create(zeta.id, individual(title)),
          ),
        ],
        { concurrency: "unbounded" },
      );

      assert.deepStrictEqual(
        titles(yield* signs.list(epsilon.id)).sort(),
        wanted("epsilon").sort(),
      );
      assert.deepStrictEqual(
        titles(yield* signs.list(zeta.id)).sort(),
        wanted("zeta").sort(),
      );
    }),
  );
});

// Its own block, and its only test, because it shuts a workspace store down.
// RcMap hands the same dead store to every later call against this layer, so
// they would all fail for that reason rather than their own.
layer(ServicesLive.pipe(Layer.provide(TempDataDir)), {
  excludeTestServices: true,
})("Signs, with a workspace store shut down", (it) => {
  it.effect("names the workspace as the store that is unavailable", () =>
    Effect.gen(function* () {
      const objects = yield* Objects;
      const signs = yield* Signs;
      const workspaces = yield* Workspaces;
      const workspaceStores = yield* WorkspaceStores;

      const workspace = yield* workspaces.create(WorkspaceName.make("eta"));
      const { store } = yield* workspaceStores.open(workspace.id);

      yield* store.shutdown();

      const onCreate = yield* objects
        .create(workspace.id, individual("Ship"))
        .pipe(Effect.flip);
      const onList = yield* signs.list(workspace.id).pipe(Effect.flip);

      assert.strictEqual(onCreate._tag, "StoreUnavailable");
      assert.strictEqual(onList._tag, "StoreUnavailable");

      // The registry is fine, so the error has to point at the workspace and
      // not at the one store entel owns itself.
      assert.deepStrictEqual(
        [onCreate, onList].map((error) =>
          error._tag === "StoreUnavailable" ? error.store : error._tag,
        ),
        [workspace.id, workspace.id],
      );

      assert.deepStrictEqual(
        (yield* workspaces.list()).map((listed) => listed.id),
        [workspace.id],
      );
    }),
  );
});

// Its own block, and its only test, for the same reason as the one above: it
// shuts a workspace store down, and RcMap hands that dead store to every later
// call against this layer.
layer(ServicesLive.pipe(Layer.provide(TempDataDir)), {
  excludeTestServices: true,
})("Signs, reading across workspaces with a store shut down", (it) => {
  it.effect("names the workspace whose store is gone", () =>
    Effect.gen(function* () {
      const objects = yield* Objects;
      const signs = yield* Signs;
      const workspaces = yield* Workspaces;
      const workspaceStores = yield* WorkspaceStores;

      const rho = yield* workspaces.create(WorkspaceName.make("rho"));
      const sigma = yield* workspaces.create(WorkspaceName.make("sigma"));

      yield* objects.create(rho.id, individual("Ship"));
      yield* objects.create(sigma.id, individual("Voyage"));

      const { store } = yield* workspaceStores.open(sigma.id);
      yield* store.shutdown();

      const failed = yield* signs.listAll().pipe(Effect.flip);

      // A list with a hole in it would read as a workspace with no signs, so
      // the read fails whole and points at the store that could not answer.
      assert.strictEqual(failed.store, sigma.id);
    }),
  );
});

// Its own block, its only test, because it shuts the registry down and every
// later call against this layer would fail for that reason rather than its own.
layer(ServicesLive.pipe(Layer.provide(TempDataDir)), {
  excludeTestServices: true,
})("Signs, with the registry shut down", (it) => {
  it.effect("names the registry when the workspace check cannot run", () =>
    Effect.gen(function* () {
      const signs = yield* Signs;
      const workspaces = yield* Workspaces;
      const { store } = yield* Registry;

      const workspace = yield* workspaces.create(WorkspaceName.make("kappa"));

      yield* store.shutdown();

      // The workspace's own store is fine, or would be. open has to ask the
      // registry first, and it is the registry that failed.
      const onList = yield* signs.list(workspace.id).pipe(Effect.flip);

      assert.strictEqual(onList._tag, "StoreUnavailable");
      assert.strictEqual(
        onList._tag === "StoreUnavailable" ? onList.store : onList.workspaceId,
        "registry",
      );

      // The read across workspaces starts from the registry too, and this is
      // the one way it fails without a workspace to name.
      const onListAll = yield* signs.listAll().pipe(Effect.flip);

      assert.strictEqual(onListAll.store, "registry");
    }),
  );
});
