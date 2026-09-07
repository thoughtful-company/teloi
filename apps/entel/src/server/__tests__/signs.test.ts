import { NodeHttpServer } from "@effect/platform-node";
import { assert, layer } from "@effect/vitest";
import { Effect, Layer } from "effect";
import {
  HttpBody,
  HttpClient,
  HttpClientResponse,
  HttpServer,
} from "effect/unstable/http";
import { HttpApiTest } from "effect/unstable/httpapi";
import { Api } from "../../api/Api.ts";
import { StoreUnavailable } from "../../api/Errors.ts";
import { Sign, SignTitle } from "../../api/Signs.ts";
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
import { SignsHandlers } from "../Signs.ts";
import { WorkspacesHandlers } from "../Workspaces.ts";

// The typed client routes, encodes and decodes exactly as a real server does,
// so this covers the handlers, the schemas and the service without a socket.
// Workspaces comes along because a sign needs a workspace to live in.
const makeClient = HttpApiTest.groups(Api, ["workspaces", "signs"]);

// One registry and its workspace stores for the whole block, on a temp
// directory that goes away with the layer. Tests therefore see each other's
// workspaces and each one works in a workspace it created itself.
const TestLayer = Layer.mergeAll(
  Layer.mergeAll(WorkspacesHandlers, SignsHandlers).pipe(
    Layer.provide(ServicesLive),
    Layer.provide(TempDataDir),
  ),
  HttpServer.layerServices,
);

// Blocks that create anything run on the real clock. The service polls the
// store until the leader has the event, and under the TestClock that poll
// never ticks.
layer(TestLayer, { excludeTestServices: true })("signs, in memory", (it) => {
  it.effect("create answers with the stored sign", () =>
    Effect.gen(function* () {
      const client = yield* makeClient;
      const workspace = yield* client.workspaces.create({
        payload: { name: WorkspaceName.make("atlas") },
      });

      const created = yield* client.signs.create({
        params: { workspaceId: workspace.id },
        payload: { title: SignTitle.make("Atlas") },
      });

      assert.strictEqual(created.title, "Atlas");
      assert.isAbove(created.id.length, 0);
    }),
  );

  it.effect("list answers with every sign in creation order", () =>
    Effect.gen(function* () {
      const client = yield* makeClient;
      const workspace = yield* client.workspaces.create({
        payload: { name: WorkspaceName.make("beta") },
      });

      const ship = yield* client.signs.create({
        params: { workspaceId: workspace.id },
        payload: { title: SignTitle.make("Ship") },
      });
      const voyage = yield* client.signs.create({
        params: { workspaceId: workspace.id },
        payload: { title: SignTitle.make("Voyage") },
      });

      const listed = yield* client.signs.list({
        params: { workspaceId: workspace.id },
      });

      // Sign is a class, and deepStrictEqual compares prototypes too.
      assert.deepStrictEqual(
        listed.map((sign) => ({ ...sign })),
        [{ ...ship }, { ...voyage }],
      );
    }),
  );

  it.effect(
    "fails with WorkspaceNotFound for a workspace that is not there",
    () =>
      Effect.gen(function* () {
        const client = yield* makeClient;
        const workspaceId = WorkspaceId.make("does-not-exist");

        const onCreate = yield* client.signs
          .create({
            params: { workspaceId },
            payload: { title: SignTitle.make("Atlas") },
          })
          .pipe(Effect.flip);
        const onList = yield* client.signs
          .list({ params: { workspaceId } })
          .pipe(Effect.flip);

        assert.strictEqual(onCreate._tag, "WorkspaceNotFound");
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

  it.effect("create answers 201 over the socket", () =>
    Effect.gen(function* () {
      const workspace = yield* openWorkspace("atlas");

      const response = yield* HttpClient.post(
        `/workspaces/${workspace.id}/signs`,
        { body: HttpBody.jsonUnsafe({ title: "Atlas" }) },
      );

      assert.strictEqual(response.status, 201);

      // Decoded with the contract schema, so this pins the wire shape and not
      // just the two fields read below.
      const created = yield* HttpClientResponse.schemaBodyJson(Sign)(response);

      assert.strictEqual(created.title, "Atlas");
      assert.isAbove(created.id.length, 0);
    }),
  );

  it.effect("rejects an empty title with 400 over the socket", () =>
    Effect.gen(function* () {
      const workspace = yield* openWorkspace("beta");

      const response = yield* HttpClient.post(
        `/workspaces/${workspace.id}/signs`,
        { body: HttpBody.jsonUnsafe({ title: "" }) },
      );

      assert.strictEqual(response.status, 400);
    }),
  );

  it.effect("rejects a title over 200 characters with 400", () =>
    Effect.gen(function* () {
      const workspace = yield* openWorkspace("gamma");

      const response = yield* HttpClient.post(
        `/workspaces/${workspace.id}/signs`,
        { body: HttpBody.jsonUnsafe({ title: "a".repeat(201) }) },
      );

      assert.strictEqual(response.status, 400);
    }),
  );

  // Surrounding whitespace would go into the event log, which nothing trims
  // after the fact.
  it.effect("rejects a title with surrounding whitespace with 400", () =>
    Effect.gen(function* () {
      const workspace = yield* openWorkspace("delta");

      const response = yield* HttpClient.post(
        `/workspaces/${workspace.id}/signs`,
        { body: HttpBody.jsonUnsafe({ title: " Atlas " }) },
      );

      assert.strictEqual(response.status, 400);
    }),
  );

  it.effect("answers 404 for a workspace that is not there", () =>
    Effect.gen(function* () {
      const created = yield* HttpClient.post(
        "/workspaces/does-not-exist/signs",
        { body: HttpBody.jsonUnsafe({ title: "Atlas" }) },
      );
      const listed = yield* HttpClient.get("/workspaces/does-not-exist/signs");

      assert.strictEqual(created.status, 404);
      assert.strictEqual(listed.status, 404);

      // Decoded with the contract's error schema, so a 404 from anything other
      // than the declared failure would not pass.
      const error =
        yield* HttpClientResponse.schemaBodyJson(WorkspaceNotFound)(created);

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

      const created = yield* HttpClient.post(
        `/workspaces/${workspace.id}/signs`,
        { body: HttpBody.jsonUnsafe({ title: "Atlas" }) },
      );

      assert.strictEqual(created.status, 503);

      // Decoded with the contract's error schema, so a 503 from anything other
      // than the declared failure would not pass, and the store field has to
      // point at the workspace, not at the registry.
      const error =
        yield* HttpClientResponse.schemaBodyJson(StoreUnavailable)(created);

      assert.strictEqual(error.store, workspace.id);
    }),
  );
});
