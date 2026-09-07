import { NodeFileSystem } from "@effect/platform-node";
import { assert, layer } from "@effect/vitest";
import { Context, Effect, FileSystem, Layer } from "effect";
import { WorkspaceName } from "../../api/Workspaces.ts";
import { configLayerFor, TempDataDir } from "../../test/DataDir.ts";
import { Registry } from "../Registry.ts";
import { ServicesLive } from "../Services.ts";
import { Workspaces } from "../Workspaces.ts";

// One run of the service against a data directory. Building and releasing the
// layer per run opens and closes the store, so the next run has to read what
// the previous one wrote rather than answer from memory.
const runAgainst = <A, E, R>(
  dir: string,
  use: (workspaces: typeof Workspaces.Service) => Effect.Effect<A, E, R>,
) =>
  Effect.scoped(
    Effect.flatMap(
      Layer.build(ServicesLive.pipe(Layer.provide(configLayerFor(dir)))),
      (context) => use(Context.get(context, Workspaces)),
    ),
  );

// Every block here creates workspaces, so they run on the real clock. The
// service polls the store until the leader has the event, and under the
// TestClock that poll never ticks.
layer(NodeFileSystem.layer, { excludeTestServices: true })(
  "Workspaces, across restarts",
  (it) => {
    it.effect("keeps workspaces written by an earlier run of the store", () =>
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        // Scoped to the test, so the directory outlives every run below and is
        // removed once the test ends.
        const dir = yield* fs.makeTempDirectoryScoped({
          prefix: "entel-test-",
        });

        const alpha = yield* runAgainst(dir, (workspaces) =>
          Effect.gen(function* () {
            const created = yield* workspaces.create(
              WorkspaceName.make("alpha"),
            );
            const listed = yield* workspaces.list();

            assert.deepStrictEqual(
              listed.map((workspace) => ({ ...workspace })),
              [{ ...created }],
            );

            return created;
          }),
        );

        const beta = yield* runAgainst(dir, (workspaces) =>
          Effect.gen(function* () {
            const reopened = yield* workspaces.list();

            assert.deepStrictEqual(
              reopened.map((workspace) => ({ ...workspace })),
              [{ ...alpha }],
            );

            const created = yield* workspaces.create(
              WorkspaceName.make("beta"),
            );

            assert.deepStrictEqual(
              (yield* workspaces.list()).map((workspace) => ({ ...workspace })),
              [{ ...alpha }, { ...created }],
            );

            return created;
          }),
        );

        yield* runAgainst(dir, (workspaces) =>
          Effect.gen(function* () {
            const listed = yield* workspaces.list();

            assert.deepStrictEqual(
              listed.map((workspace) => ({ ...workspace })),
              [{ ...alpha }, { ...beta }],
            );
          }),
        );
      }),
    );
  },
);

// One store for the whole block, on a temp directory that goes away with the
// layer. Tests therefore see each other's workspaces and must not assume the
// registry starts empty.
layer(ServicesLive.pipe(Layer.provide(TempDataDir)), {
  excludeTestServices: true,
})("Workspaces, against one store", (it) => {
  it.effect("create returns only once the event reached the leader", () =>
    Effect.gen(function* () {
      const workspaces = yield* Workspaces;

      yield* workspaces.create(WorkspaceName.make("gamma"));

      // commit only applies the event to local state. Returning before the
      // leader has it would let a caller read a workspace that a crash one
      // moment later would erase.
      const { store } = yield* Registry;

      assert.isTrue(store.syncStatus().isSynced);
    }),
  );

  it.effect("creates many workspaces at once", () =>
    Effect.gen(function* () {
      const workspaces = yield* Workspaces;
      const names = Array.from(
        { length: 20 },
        (_, index) => `parallel-${index}`,
      );

      // Every create waits for the leader on its own. The store hands out one
      // shared queue of sync updates, so a wait that consumed from it would
      // starve the other nineteen and they would time out as 503s.
      const created = yield* Effect.all(
        names.map((name) => workspaces.create(WorkspaceName.make(name))),
        { concurrency: "unbounded" },
      );

      assert.deepStrictEqual(
        created.map((workspace) => workspace.name).sort(),
        [...names].sort(),
      );

      const listed = new Set(
        (yield* workspaces.list()).map((workspace) => workspace.name),
      );

      assert.isTrue(
        names.every((name) => listed.has(WorkspaceName.make(name))),
      );
    }),
  );
});

// Its own block, and its only test, because it shuts the store down and every
// later call against this layer would fail for that reason rather than its own.
layer(ServicesLive.pipe(Layer.provide(TempDataDir)), {
  excludeTestServices: true,
})("Workspaces, with the store shut down", (it) => {
  it.effect("reports the registry as unavailable once the store is gone", () =>
    Effect.gen(function* () {
      const workspaces = yield* Workspaces;
      const { store } = yield* Registry;

      yield* store.shutdown();

      const onList = yield* workspaces.list().pipe(Effect.flip);
      const onCreate = yield* workspaces
        .create(WorkspaceName.make("delta"))
        .pipe(Effect.flip);

      assert.strictEqual(onList._tag, "RegistryUnavailable");
      assert.strictEqual(onCreate._tag, "RegistryUnavailable");
    }),
  );
});
