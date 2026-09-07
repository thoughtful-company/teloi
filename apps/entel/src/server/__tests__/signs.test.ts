import { NodeHttpServer } from "@effect/platform-node";
import { assert, layer } from "@effect/vitest";
import { Effect, Layer, Schema } from "effect";
import {
  HttpBody,
  HttpClient,
  HttpClientResponse,
  HttpServer,
} from "effect/unstable/http";
import { HttpApiTest } from "effect/unstable/httpapi";
import { Api } from "../../api/Api.ts";
import { StoreUnavailable } from "../../api/Errors.ts";
import { ModelObject } from "../../api/Objects.ts";
import { SignTitle, WorkspaceSign } from "../../api/Signs.ts";
import {
  Workspace,
  WorkspaceId,
  WorkspaceName,
  WorkspaceNotFound,
} from "../../api/Workspaces.ts";
import { ServicesLive } from "../../services/Services.ts";
import { WorkspaceStores } from "../../services/WorkspaceStores.ts";
import { TempDataDir } from "../../test/DataDir.ts";
import { HttpLive } from "../Http.ts";
import { ObjectsHandlers } from "../Objects.ts";
import { RequestSchemaLive } from "../RequestSchema.ts";
import { SignsHandlers } from "../Signs.ts";
import { WorkspacesHandlers } from "../Workspaces.ts";

// The typed client routes, encodes and decodes exactly as a real server does,
// so this covers the handlers, the schemas and the service without a socket.
// Workspaces comes along because a sign needs a workspace to live in, and
// objects because a sign is only ever written as the name of an object.
const makeClient = HttpApiTest.groups(Api, ["workspaces", "objects", "signs"]);

// One registry and its workspace stores for the whole block, on a temp
// directory that goes away with the layer. Tests therefore see each other's
// workspaces and each one works in a workspace it created itself.
const TestLayer = Layer.mergeAll(
  Layer.mergeAll(WorkspacesHandlers, ObjectsHandlers, SignsHandlers).pipe(
    // Declared on the api, so every handler group requires it, and so does
    // HttpApiTest.groups for the groups this block does not build.
    Layer.provideMerge(RequestSchemaLive),
    Layer.provide(ServicesLive),
    Layer.provide(TempDataDir),
  ),
  HttpServer.layerServices,
);

// The signs endpoints only read, so every sign these tests list had to be
// written through the objects group first. Individuals, because nothing here
// cares which kind the object behind a sign is.
const individual = (title: string) =>
  ({ kind: "individual", title: SignTitle.make(title) }) as const;

// Blocks that create anything run on the real clock. The service polls the
// store until the leader has the event, and under the TestClock that poll
// never ticks.
layer(TestLayer, { excludeTestServices: true })("signs, in memory", (it) => {
  it.effect("list answers with every sign in creation order", () =>
    Effect.gen(function* () {
      const client = yield* makeClient;
      const workspace = yield* client.workspaces.create({
        payload: { name: WorkspaceName.make("beta") },
      });

      const ship = yield* client.objects.create({
        params: { workspaceId: workspace.id },
        payload: individual("Ship"),
      });
      const voyage = yield* client.objects.create({
        params: { workspaceId: workspace.id },
        payload: individual("Voyage"),
      });
      // A second name for the first object, written between no two creates, so
      // the answer follows sign order and not object order.
      const vessel = yield* client.objects.addSign({
        params: { workspaceId: workspace.id, objectId: ship.id },
        payload: { title: SignTitle.make("Vessel") },
      });

      const listed = yield* client.signs.list({
        params: { workspaceId: workspace.id },
      });

      // Sign is a class, and deepStrictEqual compares prototypes too.
      assert.deepStrictEqual(
        listed.map((sign) => ({ ...sign })),
        [{ ...ship.signs[0] }, { ...voyage.signs[0] }, { ...vessel }],
      );
    }),
  );

  it.effect("listAll answers rows tagged with their workspace", () =>
    Effect.gen(function* () {
      const client = yield* makeClient;
      const first = yield* client.workspaces.create({
        payload: { name: WorkspaceName.make("gamma") },
      });
      const second = yield* client.workspaces.create({
        payload: { name: WorkspaceName.make("delta") },
      });

      const ship = yield* client.objects.create({
        params: { workspaceId: first.id },
        payload: individual("Ship"),
      });
      const voyage = yield* client.objects.create({
        params: { workspaceId: second.id },
        payload: individual("Voyage"),
      });

      // The block shares its registry, so the other tests' workspaces come
      // back too and only these two can be asserted on.
      const mine = new Set<string>([first.id, second.id]);
      const rows = (yield* client.signs.listAll()).filter((row) =>
        mine.has(row.workspaceId),
      );

      assert.deepStrictEqual(
        rows.map((row) => ({
          workspaceId: row.workspaceId,
          sign: { ...row.sign },
        })),
        [
          { workspaceId: first.id, sign: { ...ship.signs[0] } },
          { workspaceId: second.id, sign: { ...voyage.signs[0] } },
        ],
      );
    }),
  );

  it.effect(
    "fails with WorkspaceNotFound for a workspace that is not there",
    () =>
      Effect.gen(function* () {
        const client = yield* makeClient;
        const workspaceId = WorkspaceId.make("does-not-exist");

        const onList = yield* client.signs
          .list({ params: { workspaceId } })
          .pipe(Effect.flip);

        assert.strictEqual(onList._tag, "WorkspaceNotFound");
      }),
  );
});

// A raw client over a real socket, because the typed client encodes the payload
// against the same contract schema and so can never send a bad one. This is the
// only place the server's own decoding, and the status it answers with, is seen
// the way a foreign client sees it.
layer(
  HttpLive.pipe(
    Layer.provide(ServicesLive),
    Layer.provide(TempDataDir),
    Layer.provideMerge(NodeHttpServer.layerTest),
  ),
  { excludeTestServices: true },
)("signs, over a socket", (it) => {
  const openWorkspace = (name: string) =>
    Effect.gen(function* () {
      const response = yield* HttpClient.post("/workspaces", {
        body: HttpBody.jsonUnsafe({ name }),
      });
      return yield* HttpClientResponse.schemaBodyJson(Workspace)(response);
    });

  // Titles are checked where they are written, which is the objects group, so
  // the 400s for a bad title live in that group's socket block now.
  it.effect("listAll answers 200 over the socket", () =>
    Effect.gen(function* () {
      const workspace = yield* openWorkspace("epsilon");
      const created = yield* HttpClient.post(
        `/workspaces/${workspace.id}/objects`,
        { body: HttpBody.jsonUnsafe({ kind: "individual", title: "Atlas" }) },
      );
      const object =
        yield* HttpClientResponse.schemaBodyJson(ModelObject)(created);

      const response = yield* HttpClient.get("/signs");

      assert.strictEqual(response.status, 200);

      // Decoded with the contract schema, so this pins the wire shape of the
      // pair. The block shares a registry, so only the row this test wrote
      // can be asserted on.
      const rows = yield* HttpClientResponse.schemaBodyJson(
        Schema.Array(WorkspaceSign),
      )(response);

      assert.deepStrictEqual(
        rows
          .filter((row) => row.workspaceId === workspace.id)
          .map((row) => ({ ...row.sign })),
        [{ ...object.signs[0] }],
      );
    }),
  );

  it.effect("answers 404 for a workspace that is not there", () =>
    Effect.gen(function* () {
      const listed = yield* HttpClient.get("/workspaces/does-not-exist/signs");

      assert.strictEqual(listed.status, 404);

      // Decoded with the contract's error schema, so a 404 from anything other
      // than the declared failure would not pass.
      const error =
        yield* HttpClientResponse.schemaBodyJson(WorkspaceNotFound)(listed);

      assert.strictEqual(error._tag, "WorkspaceNotFound");
      assert.strictEqual(error.workspaceId, "does-not-exist");
    }),
  );
});

// Its own block, its own temp directory and its only test, because it shuts a
// workspace store down. `provideMerge` keeps WorkspaceStores visible so the
// test can reach the store the server is holding, and not a second one.
layer(
  HttpLive.pipe(
    Layer.provideMerge(ServicesLive),
    Layer.provide(TempDataDir),
    Layer.provideMerge(NodeHttpServer.layerTest),
  ),
  { excludeTestServices: true },
)("signs, with the workspace store shut down", (it) => {
  it.effect("answers 503 naming the workspace once its store is gone", () =>
    Effect.gen(function* () {
      const workspaceStores = yield* WorkspaceStores;
      const response = yield* HttpClient.post("/workspaces", {
        body: HttpBody.jsonUnsafe({ name: "epsilon" }),
      });
      const workspace =
        yield* HttpClientResponse.schemaBodyJson(Workspace)(response);
      const { store } = yield* workspaceStores.open(workspace.id);

      yield* store.shutdown();

      const listed = yield* HttpClient.get(`/workspaces/${workspace.id}/signs`);

      assert.strictEqual(listed.status, 503);

      // Decoded with the contract's error schema, so a 503 from anything other
      // than the declared failure would not pass, and the store field has to
      // point at the workspace, not at the registry.
      const error =
        yield* HttpClientResponse.schemaBodyJson(StoreUnavailable)(listed);

      assert.strictEqual(error.store, workspace.id);

      // The read across workspaces reaches the same dead store and fails
      // whole, over the wire as at the service, naming the workspace.
      const listedAll = yield* HttpClient.get("/signs");

      assert.strictEqual(listedAll.status, 503);

      const onListAll =
        yield* HttpClientResponse.schemaBodyJson(StoreUnavailable)(listedAll);

      assert.strictEqual(onListAll.store, workspace.id);
    }),
  );
});
