import { NodeHttpServer } from "@effect/platform-node";
import { assert, layer } from "@effect/vitest";
import { Effect, Layer } from "effect";
import { HttpClient, HttpServer } from "effect/unstable/http";
import { HttpApiTest } from "effect/unstable/httpapi";
import { Api } from "../../api/Api.ts";
import { ServicesLive } from "../../services/Services.ts";
import { TempDataDir } from "../../test/DataDir.ts";
import { HttpLive } from "../Http.ts";
import { SystemHandlers } from "../System.ts";

// The typed client routes, encodes and decodes exactly as a real server does,
// so this covers the handler and the schema without paying for a socket.
const makeClient = HttpApiTest.groups(Api, ["system"]);

// `HttpServer.layerServices` supplies the platform services (HttpPlatform,
// Path, FileSystem, Etag) that the HTTP pipeline resolves while building routes.
layer(Layer.mergeAll(SystemHandlers, HttpServer.layerServices))(
  "health, in memory",
  (it) => {
    it.effect("reports ok through the typed client", () =>
      Effect.gen(function* () {
        const client = yield* makeClient;

        // `system` is a top-level group, so its endpoints sit on the client root.
        const health = yield* client.health();

        // Health is a class, and deepStrictEqual compares prototypes too.
        assert.deepStrictEqual({ ...health }, { status: "ok" });
      }),
    );
  },
);

// `NodeHttpServer.layerTest` binds an ephemeral port and provides an HttpClient
// already pointed at it, so this exercises the real Node wiring end to end.
// HttpLive carries every handler, so the registry comes along even though
// /health never touches it.
layer(
  HttpLive.pipe(
    Layer.provide(ServicesLive),
    Layer.provide(TempDataDir),
    Layer.provideMerge(NodeHttpServer.layerTest),
  ),
)("health, over a socket", (it) => {
  it.effect("serves GET /health", () =>
    Effect.gen(function* () {
      const response = yield* HttpClient.get("/health");

      assert.strictEqual(response.status, 200);
      assert.deepStrictEqual(yield* response.json, { status: "ok" });
    }),
  );
});
