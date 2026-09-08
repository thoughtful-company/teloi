import { assert, layer } from "@effect/vitest";
import { Effect, Layer } from "effect";
import {
  HttpBody,
  HttpClient,
  HttpClientRequest,
  HttpClientResponse,
  HttpServer,
} from "effect/unstable/http";
import { HttpApiTest } from "effect/unstable/httpapi";
import { Api } from "../../api/Api.ts";
import { StoreUnavailable } from "../../api/Errors.ts";
import { ObjectId } from "../../api/ObjectId.ts";
import {
  KindMismatch,
  ModelObject,
  ObjectNotFound,
} from "../../api/Objects.ts";
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
import { issuePaths, rejection } from "../../test/Rejection.ts";
import { EntelTest } from "../../test/Server.ts";
import { ObjectsHandlers } from "../Objects.ts";
import { RequestSchemaLive } from "../RequestSchema.ts";
import { SignsHandlers } from "../Signs.ts";
import { WorkspacesHandlers } from "../Workspaces.ts";

// The typed client routes, encodes and decodes exactly as a real server does,
// so this covers the handlers, the schemas and the service without a socket.
// Workspaces comes along because an object needs a workspace to live in, and
// signs because a second name for an object has to show up there too.
const makeClient = HttpApiTest.groups(Api, ["workspaces", "objects", "signs"]);

// One registry and its workspace stores for the whole block, on a temp
// directory that goes away with the layer. Tests therefore see each other's
// workspaces and each one works in a workspace it created itself.
const TestLayer = Layer.mergeAll(
  Layer.mergeAll(WorkspacesHandlers, ObjectsHandlers, SignsHandlers).pipe(
    // Declared on the api, so every handler group requires it. provideMerge
    // rather than provide, because HttpApiTest.groups builds routes for the
    // groups this block leaves out and needs the middleware in context too.
    Layer.provideMerge(RequestSchemaLive),
    Layer.provide(ServicesLive),
    Layer.provide(TempDataDir),
  ),
  HttpServer.layerServices,
);

// Blocks that create anything run on the real clock. The service polls the
// store until the leader has the event, and under the TestClock that poll
// never ticks.
layer(TestLayer, { excludeTestServices: true })("objects, in memory", (it) => {
  it.effect("create answers with the object and its first sign", () =>
    Effect.gen(function* () {
      const client = yield* makeClient;
      const workspace = yield* client.workspaces.create({
        payload: { name: WorkspaceName.make("atlas") },
      });

      const created = yield* client.objects.create({
        params: { workspaceId: workspace.id },
        payload: { kind: "individual", title: SignTitle.make("Ship") },
      });

      assert.strictEqual(created.kind, "individual");
      assert.isAbove(created.id.length, 0);
      assert.strictEqual(created.signs.length, 1);
      assert.strictEqual(created.signs[0]?.objectId, created.id);
      assert.strictEqual(created.signs[0]?.title, "Ship");
      assert.deepStrictEqual([...created.places], []);
      assert.deepStrictEqual([...created.elements], []);
    }),
  );

  it.effect("get answers the object the path names", () =>
    Effect.gen(function* () {
      const client = yield* makeClient;
      const workspace = yield* client.workspaces.create({
        payload: { name: WorkspaceName.make("beta") },
      });
      const created = yield* client.objects.create({
        params: { workspaceId: workspace.id },
        payload: { kind: "individual", title: SignTitle.make("Ship") },
      });

      const read = yield* client.objects.get({
        params: { workspaceId: workspace.id, objectId: created.id },
      });

      // ModelObject is a class, and deepStrictEqual compares prototypes too.
      assert.deepStrictEqual({ ...read }, { ...created });
    }),
  );

  it.effect("list answers every object in creation order", () =>
    Effect.gen(function* () {
      const client = yield* makeClient;
      const workspace = yield* client.workspaces.create({
        payload: { name: WorkspaceName.make("gamma") },
      });

      const ship = yield* client.objects.create({
        params: { workspaceId: workspace.id },
        payload: { kind: "individual", title: SignTitle.make("Ship") },
      });
      const anchor = yield* client.objects.create({
        params: { workspaceId: workspace.id },
        payload: { kind: "individual", title: SignTitle.make("Anchor") },
      });
      const bearing = yield* client.objects.create({
        params: { workspaceId: workspace.id },
        payload: {
          kind: "tuple",
          title: SignTitle.make("Bearing"),
          places: [ship.id, anchor.id],
        },
      });

      const listed = yield* client.objects.list({
        params: { workspaceId: workspace.id },
      });

      assert.deepStrictEqual(
        listed.map((object) => ({ ...object })),
        [{ ...ship }, { ...anchor }, { ...bearing }],
      );
    }),
  );

  it.effect("addSign answers a second sign for the same object", () =>
    Effect.gen(function* () {
      const client = yield* makeClient;
      const workspace = yield* client.workspaces.create({
        payload: { name: WorkspaceName.make("delta") },
      });
      const ship = yield* client.objects.create({
        params: { workspaceId: workspace.id },
        payload: { kind: "individual", title: SignTitle.make("Ship") },
      });

      const vessel = yield* client.objects.addSign({
        params: { workspaceId: workspace.id, objectId: ship.id },
        payload: { title: SignTitle.make("Vessel") },
      });

      assert.strictEqual(vessel.objectId, ship.id);

      const read = yield* client.objects.get({
        params: { workspaceId: workspace.id, objectId: ship.id },
      });

      assert.deepStrictEqual(
        read.signs.map((sign) => ({ ...sign })),
        [{ ...ship.signs[0] }, { ...vessel }],
      );
      // The signs group answers the same two, so a name added through an
      // object is a sign like any other.
      assert.deepStrictEqual(
        (yield* client.signs.list({
          params: { workspaceId: workspace.id },
        })).map((sign) => ({ ...sign })),
        [{ ...ship.signs[0] }, { ...vessel }],
      );
    }),
  );

  it.effect("addElement answers the set's elements in add order", () =>
    Effect.gen(function* () {
      const client = yield* makeClient;
      const workspace = yield* client.workspaces.create({
        payload: { name: WorkspaceName.make("epsilon") },
      });
      const fleet = yield* client.objects.create({
        params: { workspaceId: workspace.id },
        payload: { kind: "set", title: SignTitle.make("Fleet") },
      });
      const ship = yield* client.objects.create({
        params: { workspaceId: workspace.id },
        payload: { kind: "individual", title: SignTitle.make("Ship") },
      });
      const anchor = yield* client.objects.create({
        params: { workspaceId: workspace.id },
        payload: { kind: "individual", title: SignTitle.make("Anchor") },
      });

      const afterShip = yield* client.objects.addElement({
        params: { workspaceId: workspace.id, objectId: fleet.id },
        payload: { elementId: ship.id },
      });
      const afterAnchor = yield* client.objects.addElement({
        params: { workspaceId: workspace.id, objectId: fleet.id },
        payload: { elementId: anchor.id },
      });

      assert.deepStrictEqual([...afterShip.elements], [ship.id]);
      assert.deepStrictEqual([...afterAnchor.elements], [ship.id, anchor.id]);

      const read = yield* client.objects.get({
        params: { workspaceId: workspace.id, objectId: fleet.id },
      });

      assert.deepStrictEqual([...read.elements], [ship.id, anchor.id]);
    }),
  );

  it.effect("fails with ObjectNotFound for an object that is not there", () =>
    Effect.gen(function* () {
      const client = yield* makeClient;
      const workspace = yield* client.workspaces.create({
        payload: { name: WorkspaceName.make("zeta") },
      });
      const fleet = yield* client.objects.create({
        params: { workspaceId: workspace.id },
        payload: { kind: "set", title: SignTitle.make("Fleet") },
      });
      const unknown = ObjectId.make("does-not-exist");

      const onGet = yield* client.objects
        .get({ params: { workspaceId: workspace.id, objectId: unknown } })
        .pipe(Effect.flip);
      const onAddSign = yield* client.objects
        .addSign({
          params: { workspaceId: workspace.id, objectId: unknown },
          payload: { title: SignTitle.make("Vessel") },
        })
        .pipe(Effect.flip);
      // The element is what is missing here, so the error names the element
      // and not the set the path points at.
      const onAddElement = yield* client.objects
        .addElement({
          params: { workspaceId: workspace.id, objectId: fleet.id },
          payload: { elementId: unknown },
        })
        .pipe(Effect.flip);

      assert.deepStrictEqual(
        [onGet, onAddSign, onAddElement].map((error) => error._tag),
        ["ObjectNotFound", "ObjectNotFound", "ObjectNotFound"],
      );
      assert.deepStrictEqual(
        [onGet, onAddSign, onAddElement].map((error) =>
          error._tag === "ObjectNotFound"
            ? [error.workspaceId, error.objectId]
            : [error._tag],
        ),
        [
          [workspace.id, unknown],
          [workspace.id, unknown],
          [workspace.id, unknown],
        ],
      );
    }),
  );

  it.effect("fails with KindMismatch for an element on an individual", () =>
    Effect.gen(function* () {
      const client = yield* makeClient;
      const workspace = yield* client.workspaces.create({
        payload: { name: WorkspaceName.make("eta") },
      });
      const ship = yield* client.objects.create({
        params: { workspaceId: workspace.id },
        payload: { kind: "individual", title: SignTitle.make("Ship") },
      });
      const anchor = yield* client.objects.create({
        params: { workspaceId: workspace.id },
        payload: { kind: "individual", title: SignTitle.make("Anchor") },
      });

      const failed = yield* client.objects
        .addElement({
          params: { workspaceId: workspace.id, objectId: ship.id },
          payload: { elementId: anchor.id },
        })
        .pipe(Effect.flip);

      assert.strictEqual(failed._tag, "KindMismatch");
      assert.deepStrictEqual(
        failed._tag === "KindMismatch"
          ? {
              objectId: failed.objectId,
              expected: [...failed.expected],
              actual: failed.actual,
            }
          : undefined,
        {
          objectId: ship.id,
          expected: ["set", "tupleSet"],
          actual: "individual",
        },
      );
    }),
  );

  it.effect(
    "fails with WorkspaceNotFound for a workspace that is not there",
    () =>
      Effect.gen(function* () {
        const client = yield* makeClient;
        const workspaceId = WorkspaceId.make("does-not-exist");

        const onCreate = yield* client.objects
          .create({
            params: { workspaceId },
            payload: { kind: "individual", title: SignTitle.make("Ship") },
          })
          .pipe(Effect.flip);
        const onList = yield* client.objects
          .list({ params: { workspaceId } })
          .pipe(Effect.flip);
        const onGet = yield* client.objects
          .get({
            params: { workspaceId, objectId: ObjectId.make("does-not-exist") },
          })
          .pipe(Effect.flip);

        assert.deepStrictEqual(
          [onCreate, onList, onGet].map((error) => error._tag),
          ["WorkspaceNotFound", "WorkspaceNotFound", "WorkspaceNotFound"],
        );
      }),
  );
});

// A raw client over a real socket, because the typed client encodes the payload
// against the same contract schema and so can never send a bad one. This is the
// only place the server's own decoding, and the status it answers with, is seen
// the way a foreign client sees it.
// Both socket blocks below, each call building its own server and temp
// directory. excludeTestServices because the commit path polls on the real
// clock, see CLAUDE.md.
const overSocket = layer(EntelTest, { excludeTestServices: true });

overSocket("objects, over a socket", (it) => {
  const openWorkspace = (name: string) =>
    Effect.gen(function* () {
      const response = yield* HttpClient.post("/workspaces", {
        body: HttpBody.jsonUnsafe({ name }),
      });
      return yield* HttpClientResponse.schemaBodyJson(Workspace)(response);
    });

  const createObject = (workspaceId: string, payload: unknown) =>
    HttpClient.post(`/workspaces/${workspaceId}/objects`, {
      body: HttpBody.jsonUnsafe(payload),
    });

  it.effect("create answers 201 over the socket", () =>
    Effect.gen(function* () {
      const workspace = yield* openWorkspace("atlas");

      const response = yield* createObject(workspace.id, {
        kind: "individual",
        title: "Ship",
      });

      assert.strictEqual(response.status, 201);

      // Decoded with the contract schema, so this pins the wire shape and not
      // just the fields read below.
      const created =
        yield* HttpClientResponse.schemaBodyJson(ModelObject)(response);

      assert.strictEqual(created.kind, "individual");
      assert.strictEqual(created.signs[0]?.title, "Ship");
      assert.strictEqual(created.signs[0]?.objectId, created.id);
    }),
  );

  it.effect("addSign answers 201 over the socket", () =>
    Effect.gen(function* () {
      const workspace = yield* openWorkspace("beta");
      const created = yield* createObject(workspace.id, {
        kind: "individual",
        title: "Ship",
      });
      const ship =
        yield* HttpClientResponse.schemaBodyJson(ModelObject)(created);

      const response = yield* HttpClient.post(
        `/workspaces/${workspace.id}/objects/${ship.id}/signs`,
        { body: HttpBody.jsonUnsafe({ title: "Vessel" }) },
      );

      assert.strictEqual(response.status, 201);

      const sign = yield* HttpClientResponse.schemaBodyJson(Sign)(response);

      assert.strictEqual(sign.title, "Vessel");
      assert.strictEqual(sign.objectId, ship.id);
    }),
  );

  // AddSign is its own payload schema, not the one create uses, so the title
  // rule has to be pinned at this boundary too. Without this the rule could be
  // lost here while every create test stayed green.
  it.effect("addSign rejects a bad title with 400 over the socket", () =>
    Effect.gen(function* () {
      const workspace = yield* openWorkspace("nu");
      const ship = yield* HttpClientResponse.schemaBodyJson(ModelObject)(
        yield* createObject(workspace.id, {
          kind: "individual",
          title: "Ship",
        }),
      );

      const response = yield* HttpClient.post(
        `/workspaces/${workspace.id}/objects/${ship.id}/signs`,
        { body: HttpBody.jsonUnsafe({ title: " Vessel " }) },
      );

      assert.strictEqual(response.status, 400);

      const rejected = yield* rejection(response);

      assert.strictEqual(rejected.part, "Payload");
      // The field that broke the rule is named, so a client can point at it.
      assert.deepInclude(issuePaths(rejected), ["title"]);
    }),
  );

  it.effect("addElement answers 200 with the set", () =>
    Effect.gen(function* () {
      const workspace = yield* openWorkspace("gamma");
      const fleet = yield* HttpClientResponse.schemaBodyJson(ModelObject)(
        yield* createObject(workspace.id, { kind: "set", title: "Fleet" }),
      );
      const ship = yield* HttpClientResponse.schemaBodyJson(ModelObject)(
        yield* createObject(workspace.id, {
          kind: "individual",
          title: "Ship",
        }),
      );

      const response = yield* HttpClient.post(
        `/workspaces/${workspace.id}/objects/${fleet.id}/elements`,
        { body: HttpBody.jsonUnsafe({ elementId: ship.id }) },
      );

      // Membership changes a set that was already there, so the answer is
      // the set itself and not a new resource.
      assert.strictEqual(response.status, 200);

      const set =
        yield* HttpClientResponse.schemaBodyJson(ModelObject)(response);

      assert.strictEqual(set.id, fleet.id);
      assert.deepStrictEqual([...set.elements], [ship.id]);
    }),
  );

  it.effect("rejects an empty title with 400 over the socket", () =>
    Effect.gen(function* () {
      const workspace = yield* openWorkspace("delta");

      const response = yield* createObject(workspace.id, {
        kind: "individual",
        title: "",
      });

      assert.strictEqual(response.status, 400);

      const rejected = yield* rejection(response);

      assert.strictEqual(rejected.part, "Payload");
      assert.deepInclude(issuePaths(rejected), ["title"]);
    }),
  );

  it.effect("rejects a title over 200 characters with 400", () =>
    Effect.gen(function* () {
      const workspace = yield* openWorkspace("epsilon");

      const response = yield* createObject(workspace.id, {
        kind: "individual",
        title: "a".repeat(201),
      });

      assert.strictEqual(response.status, 400);

      const rejected = yield* rejection(response);

      assert.strictEqual(rejected.part, "Payload");
      assert.deepInclude(issuePaths(rejected), ["title"]);
    }),
  );

  // Surrounding whitespace would go into the event log, which nothing trims
  // after the fact.
  it.effect("rejects a title with surrounding whitespace with 400", () =>
    Effect.gen(function* () {
      const workspace = yield* openWorkspace("zeta");

      const response = yield* createObject(workspace.id, {
        kind: "individual",
        title: " Ship ",
      });

      assert.strictEqual(response.status, 400);

      const rejected = yield* rejection(response);

      assert.strictEqual(rejected.part, "Payload");
      assert.deepInclude(issuePaths(rejected), ["title"]);
    }),
  );

  // A tuple is its places, so one without them is not a tuple and the payload
  // schema is where that is settled, before any service runs.
  it.effect("rejects a tuple with no places with 400", () =>
    Effect.gen(function* () {
      const workspace = yield* openWorkspace("eta");

      const missing = yield* createObject(workspace.id, {
        kind: "tuple",
        title: "Bearing",
      });
      const empty = yield* createObject(workspace.id, {
        kind: "tuple",
        title: "Bearing",
        places: [],
      });

      assert.strictEqual(missing.status, 400);
      assert.strictEqual(empty.status, 400);

      // A union rejects as a whole, so the leaves it reports are the
      // formatter's business; that it reports any at all is not.
      for (const response of [missing, empty]) {
        const rejected = yield* rejection(response);

        assert.strictEqual(rejected.part, "Payload");
        assert.isNotEmpty(rejected.issues);
      }
    }),
  );

  // Only a tuple has places. Any other kind sent with them is a request the
  // caller has misunderstood, and answering 201 would drop the places without
  // saying so.
  it.effect("rejects places on a kind that is not a tuple with 400", () =>
    Effect.gen(function* () {
      const workspace = yield* openWorkspace("theta");
      const ship = yield* HttpClientResponse.schemaBodyJson(ModelObject)(
        yield* createObject(workspace.id, {
          kind: "individual",
          title: "Ship",
        }),
      );

      const response = yield* createObject(workspace.id, {
        kind: "set",
        title: "Fleet",
        places: [ship.id],
      });

      assert.strictEqual(response.status, 400);

      const rejected = yield* rejection(response);

      assert.strictEqual(rejected.part, "Payload");
      assert.isNotEmpty(rejected.issues);
    }),
  );

  it.effect("rejects a kind that is not one of the four with 400", () =>
    Effect.gen(function* () {
      const workspace = yield* openWorkspace("iota");

      const response = yield* createObject(workspace.id, {
        kind: "relationship",
        title: "Ship",
      });

      assert.strictEqual(response.status, 400);

      const rejected = yield* rejection(response);

      assert.strictEqual(rejected.part, "Payload");
      assert.isNotEmpty(rejected.issues);
    }),
  );

  // A body that is not JSON fails in the framework's parser, before any
  // payload schema runs, so none of the schema tests above reach this path.
  // The guide promises the same shape here, with an empty path because nothing
  // parsed far enough to name a field.
  it.effect("answers 400 with an empty path for a body that is not JSON", () =>
    Effect.gen(function* () {
      const workspace = yield* openWorkspace("rho");

      const response = yield* HttpClient.post(
        `/workspaces/${workspace.id}/objects`,
        { body: HttpBody.text("{not json", "application/json") },
      );

      assert.strictEqual(response.status, 400);

      const rejected = yield* rejection(response);

      assert.strictEqual(rejected.part, "Payload");
      assert.deepInclude(issuePaths(rejected), []);
    }),
  );

  it.effect("answers 404 for an object that is not there", () =>
    Effect.gen(function* () {
      const workspace = yield* openWorkspace("kappa");

      const read = yield* HttpClient.get(
        `/workspaces/${workspace.id}/objects/does-not-exist`,
      );

      assert.strictEqual(read.status, 404);

      // Decoded with the contract's error schema, so a 404 from anything other
      // than the declared failure would not pass.
      const error =
        yield* HttpClientResponse.schemaBodyJson(ObjectNotFound)(read);

      assert.strictEqual(error.workspaceId, workspace.id);
      assert.strictEqual(error.objectId, "does-not-exist");

      // The same failure reached through a place rather than a path.
      const asPlace = yield* createObject(workspace.id, {
        kind: "tuple",
        title: "Bearing",
        places: ["does-not-exist"],
      });

      assert.strictEqual(asPlace.status, 404);

      const onPlace =
        yield* HttpClientResponse.schemaBodyJson(ObjectNotFound)(asPlace);

      assert.strictEqual(onPlace.objectId, "does-not-exist");
    }),
  );

  it.effect("answers 409 for an element on an individual", () =>
    Effect.gen(function* () {
      const workspace = yield* openWorkspace("lambda");
      const ship = yield* HttpClientResponse.schemaBodyJson(ModelObject)(
        yield* createObject(workspace.id, {
          kind: "individual",
          title: "Ship",
        }),
      );
      const anchor = yield* HttpClientResponse.schemaBodyJson(ModelObject)(
        yield* createObject(workspace.id, {
          kind: "individual",
          title: "Anchor",
        }),
      );

      const response = yield* HttpClient.post(
        `/workspaces/${workspace.id}/objects/${ship.id}/elements`,
        { body: HttpBody.jsonUnsafe({ elementId: anchor.id }) },
      );

      assert.strictEqual(response.status, 409);

      const error =
        yield* HttpClientResponse.schemaBodyJson(KindMismatch)(response);

      assert.strictEqual(error.objectId, ship.id);
      assert.deepStrictEqual([...error.expected], ["set", "tupleSet"]);
      assert.strictEqual(error.actual, "individual");
    }),
  );

  // Effect v4 decodes with onExcessProperty "ignore", and HttpApiBuilder gives
  // no place to change it, so a key the payload schema does not declare is
  // dropped and the request succeeds. The agent guide tells a reader that a
  // misspelled key is a silent omission rather than an error, and this is the
  // test that keeps that sentence true, or fails loudly on an rc bump that
  // changes it.
  it.effect("drops a payload key the schema does not declare", () =>
    Effect.gen(function* () {
      const workspace = yield* openWorkspace("omicron");

      const response = yield* createObject(workspace.id, {
        kind: "set",
        title: "Fleet",
        elements: ["anything"],
      });

      assert.strictEqual(response.status, 201);

      const created =
        yield* HttpClientResponse.schemaBodyJson(ModelObject)(response);

      // Membership is stated on its own endpoint, so a set named with elements
      // is created empty and the caller is not told the key went nowhere.
      assert.deepStrictEqual([...created.elements], []);
    }),
  );

  // The guide tells an agent it may post JSON without a content type. That is
  // the framework's default and nothing else pins it, so an rc bump could turn
  // it into a 415 while every other test kept passing.
  it.effect("reads a body with no content type as JSON", () =>
    Effect.gen(function* () {
      const workspace = yield* openWorkspace("pi");

      // The header is written into the request by setBody, from the body's own
      // content type, so it can only be taken off again afterwards.
      const request = HttpClientRequest.post(
        `/workspaces/${workspace.id}/objects`,
      ).pipe(
        HttpClientRequest.bodyText(
          JSON.stringify({ kind: "individual", title: "Ship" }),
        ),
        HttpClientRequest.removeHeader("content-type"),
      );

      const response = yield* HttpClient.execute(request);

      assert.strictEqual(response.status, 201);

      const created =
        yield* HttpClientResponse.schemaBodyJson(ModelObject)(response);

      assert.strictEqual(created.signs[0]?.title, "Ship");
    }),
  );

  it.effect("answers 404 for a workspace that is not there", () =>
    Effect.gen(function* () {
      const created = yield* createObject("does-not-exist", {
        kind: "individual",
        title: "Ship",
      });
      const listed = yield* HttpClient.get(
        "/workspaces/does-not-exist/objects",
      );

      assert.strictEqual(created.status, 404);
      assert.strictEqual(listed.status, 404);

      // Both 404s are declared, so the tag says which one this is and a
      // missing workspace is not read as a missing object.
      const error =
        yield* HttpClientResponse.schemaBodyJson(WorkspaceNotFound)(created);

      assert.strictEqual(error._tag, "WorkspaceNotFound");
      assert.strictEqual(error.workspaceId, "does-not-exist");
    }),
  );
});

// Its own block, its own temp directory and its only test, because it shuts a
// workspace store down. EntelTest keeps WorkspaceStores visible so the test
// can reach the store the server is holding, and not a second one.
overSocket("objects, with the workspace store shut down", (it) => {
  it.effect("answers 503 naming the workspace once its store is gone", () =>
    Effect.gen(function* () {
      const workspaceStores = yield* WorkspaceStores;
      const response = yield* HttpClient.post("/workspaces", {
        body: HttpBody.jsonUnsafe({ name: "mu" }),
      });
      const workspace =
        yield* HttpClientResponse.schemaBodyJson(Workspace)(response);
      const { store } = yield* workspaceStores.open(workspace.id);

      yield* store.shutdown();

      const created = yield* HttpClient.post(
        `/workspaces/${workspace.id}/objects`,
        { body: HttpBody.jsonUnsafe({ kind: "individual", title: "Ship" }) },
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
