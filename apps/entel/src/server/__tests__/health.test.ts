import { NodeHttpServer } from "@effect/platform-node";
import { assert, layer } from "@effect/vitest";
import { Effect, Layer, Schema } from "effect";
import {
  HttpClient,
  HttpClientResponse,
  HttpServer,
} from "effect/unstable/http";
import { HttpApiTest } from "effect/unstable/httpapi";
import { Api } from "../../api/Api.ts";
import { ServicesLive } from "../../services/Services.ts";
import { TempDataDir } from "../../test/DataDir.ts";
import { HttpLive } from "../Http.ts";
import { SystemHandlers } from "../System.ts";

// The typed client routes, encodes and decodes exactly as a real server does,
// so this covers the handler and the schema without paying for a socket.
const makeClient = HttpApiTest.groups(Api, ["system"]);

// Only as much of the document as the test below is about. Paths stay unknown
// so that a path without a POST, which is most of them, still decodes.
const OpenApiDocument = Schema.Struct({
  paths: Schema.Record(Schema.String, Schema.Unknown),
});

// One member of the create payload's union, down to the rules the test reads.
// `places` stays a bare record because the two members describe it in
// different shapes, a refusal on one side and an array on the other.
const CreateObjectMember = Schema.Struct({
  properties: Schema.Struct({
    kind: Schema.Struct({ enum: Schema.Array(Schema.String) }),
    places: Schema.Record(Schema.String, Schema.Unknown),
  }),
  required: Schema.Array(Schema.String),
});

// The one path the test reads, and only down to the payload's own schema.
const CreateObjectsPath = Schema.Struct({
  post: Schema.Struct({
    requestBody: Schema.Struct({
      content: Schema.Struct({
        "application/json": Schema.Struct({
          schema: Schema.Struct({ anyOf: Schema.Array(CreateObjectMember) }),
        }),
      }),
    }),
  }),
});

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
// nothing in this block touches it. What the block covers is the server
// itself, the routes it answers on before any workspace exists.
layer(
  HttpLive.pipe(
    Layer.provide(ServicesLive),
    Layer.provide(TempDataDir),
    Layer.provideMerge(NodeHttpServer.layerTest),
  ),
)("server, over a socket", (it) => {
  it.effect("serves GET /health", () =>
    Effect.gen(function* () {
      const response = yield* HttpClient.get("/health");

      assert.strictEqual(response.status, 200);
      assert.deepStrictEqual(yield* response.json, { status: "ok" });
    }),
  );

  // An agent reads this document to learn the API, so entel has to serve it,
  // and the create payload has to arrive as the union it is. Collapsed into a
  // single shape it would tell the agent that a set takes places and that a
  // tuple does not need them, which is the opposite of what the server
  // accepts. So the two rules that carry that are read out of the document
  // itself: the placeless member refuses places, the tuple member demands at
  // least one.
  it.effect("serves the OpenAPI document at GET /openapi.json", () =>
    Effect.gen(function* () {
      const response = yield* HttpClient.get("/openapi.json");

      // Asserted before the body is decoded, so a document that is not served
      // at all fails on the status rather than on its shape.
      assert.strictEqual(response.status, 200);

      const document =
        yield* HttpClientResponse.schemaBodyJson(OpenApiDocument)(response);
      const path = "/workspaces/{workspaceId}/objects";

      assert.include(Object.keys(document.paths), path);

      const created = yield* Schema.decodeUnknownEffect(CreateObjectsPath)(
        document.paths[path],
      );
      const members =
        created.post.requestBody.content["application/json"].schema.anyOf;

      assert.strictEqual(members.length, 2);

      // Found by the kinds they cover, so which member the generator emits
      // first is not part of what this pins.
      const [placeless] = members.filter((member) =>
        member.properties.kind.enum.includes("set"),
      );
      const [tuple] = members.filter((member) =>
        member.properties.kind.enum.includes("tuple"),
      );

      assert.deepStrictEqual(placeless?.properties.kind.enum, [
        "individual",
        "set",
        "tupleSet",
      ]);
      // An empty `not` is how JSON Schema says no value is allowed here, which
      // is what makes places on a set a 400 rather than a silently dropped key.
      // Nothing here reads `additionalProperties`, although the generator emits
      // false for every Struct. The server does not honour it: Effect v4
      // decodes with onExcessProperty "ignore" and HttpApiBuilder offers no way
      // to change that, so an unknown key is dropped and the request answered
      // 201. A test must not pin a promise the document makes and the server
      // does not keep.
      assert.deepStrictEqual(placeless?.properties.places, { not: {} });

      assert.deepStrictEqual(tuple?.properties.kind.enum, ["tuple"]);
      assert.isTrue(tuple?.required.includes("places"));
      assert.strictEqual(tuple?.properties.places["minItems"], 1);
    }),
  );
});
