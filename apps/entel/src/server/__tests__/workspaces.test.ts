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
import { Workspace, WorkspaceName } from "../../api/Workspaces.ts";
import { Registry } from "../../services/Registry.ts";
import { ServicesLive } from "../../services/Services.ts";
import { TempDataDir } from "../../test/DataDir.ts";
import { HttpLive } from "../Http.ts";
import { WorkspacesHandlers } from "../Workspaces.ts";

// The typed client routes, encodes and decodes exactly as a real server does,
// so this covers the handlers, the schemas and the service without a socket.
const makeClient = HttpApiTest.groups(Api, ["workspaces"]);

// One store for the whole block, on a temp directory that goes away with the
// layer. Tests therefore see each other's workspaces and must not assume the
// registry starts empty.
const TestLayer = Layer.mergeAll(
  WorkspacesHandlers.pipe(
    Layer.provide(ServicesLive),
    Layer.provide(TempDataDir),
  ),
  HttpServer.layerServices,
);

// Blocks that create a workspace run on the real clock. The service polls the
// store until the leader has the event, and under the TestClock that poll
// never ticks.
layer(TestLayer, { excludeTestServices: true })(
  "workspaces, in memory",
  (it) => {
    it.effect("create answers with the stored workspace", () =>
      Effect.gen(function* () {
        const client = yield* makeClient;

        const created = yield* client.workspaces.create({
          payload: { name: WorkspaceName.make("atlas") },
        });

        assert.strictEqual(created.name, "atlas");
        assert.isAbove(created.id.length, 0);
      }),
    );

    it.effect("list answers with every workspace in creation order", () =>
      Effect.gen(function* () {
        const client = yield* makeClient;
        const before = yield* client.workspaces.list();

        const alpha = yield* client.workspaces.create({
          payload: { name: WorkspaceName.make("alpha") },
        });
        const beta = yield* client.workspaces.create({
          payload: { name: WorkspaceName.make("beta") },
        });

        const after = yield* client.workspaces.list();

        // Workspace is a class, and deepStrictEqual compares prototypes too.
        assert.deepStrictEqual(
          after.map((workspace) => ({ ...workspace })),
          [
            ...before.map((workspace) => ({ ...workspace })),
            { ...alpha },
            { ...beta },
          ],
        );
      }),
    );
  },
);

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
)("workspaces, over a socket", (it) => {
  it.effect("create answers 201 over the socket", () =>
    Effect.gen(function* () {
      const response = yield* HttpClient.post("/workspaces", {
        body: HttpBody.jsonUnsafe({ name: "epsilon" }),
      });

      assert.strictEqual(response.status, 201);

      // Decoded with the contract schema, so this pins the wire shape and not
      // just the two fields read below.
      const created =
        yield* HttpClientResponse.schemaBodyJson(Workspace)(response);

      assert.strictEqual(created.name, "epsilon");
      assert.isAbove(created.id.length, 0);
    }),
  );

  it.effect("rejects an empty name with 400 over the socket", () =>
    Effect.gen(function* () {
      const response = yield* HttpClient.post("/workspaces", {
        body: HttpBody.jsonUnsafe({ name: "" }),
      });

      assert.strictEqual(response.status, 400);
    }),
  );

  it.effect("rejects a name over 200 characters with 400", () =>
    Effect.gen(function* () {
      const response = yield* HttpClient.post("/workspaces", {
        body: HttpBody.jsonUnsafe({ name: "e".repeat(201) }),
      });

      assert.strictEqual(response.status, 400);
    }),
  );

  // Surrounding whitespace would go into the event log, which nothing trims
  // after the fact.
  it.effect("rejects a name with surrounding whitespace with 400", () =>
    Effect.gen(function* () {
      const response = yield* HttpClient.post("/workspaces", {
        body: HttpBody.jsonUnsafe({ name: " atlas " }),
      });

      assert.strictEqual(response.status, 400);
    }),
  );
});

// Its own block, its own temp directory and its only test, because it shuts the
// store down and every later request against this layer would fail for that
// reason rather than its own. `provideMerge` keeps Registry visible so the test
// can reach the store the server is holding, and not a second one.
layer(
  HttpLive.pipe(
    Layer.provideMerge(ServicesLive),
    Layer.provide(TempDataDir),
    Layer.provideMerge(NodeHttpServer.layerTest),
  ),
  { excludeTestServices: true },
)("workspaces, with the store shut down", (it) => {
  it.effect("answers 503 once the registry is gone", () =>
    Effect.gen(function* () {
      const { store } = yield* Registry;

      yield* store.shutdown();

      const created = yield* HttpClient.post("/workspaces", {
        body: HttpBody.jsonUnsafe({ name: "zeta" }),
      });
      const listed = yield* HttpClient.get("/workspaces");

      assert.strictEqual(created.status, 503);
      assert.strictEqual(listed.status, 503);

      // Decoded with the contract's error schema, so a 503 from anything other
      // than the declared failure would not pass.
      const error =
        yield* HttpClientResponse.schemaBodyJson(StoreUnavailable)(created);

      assert.strictEqual(error._tag, "StoreUnavailable");
      assert.strictEqual(error.store, "registry");
    }),
  );
});
