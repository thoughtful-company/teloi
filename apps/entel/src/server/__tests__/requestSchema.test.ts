import { NodeHttpServer } from "@effect/platform-node";
import { assert, layer } from "@effect/vitest";
import { Effect, Layer, Schema } from "effect";
import { HttpClient, HttpRouter } from "effect/unstable/http";
import {
  HttpApi,
  HttpApiBuilder,
  HttpApiEndpoint,
  HttpApiGroup,
} from "effect/unstable/httpapi";
import { RequestSchema } from "../../api/Errors.ts";
import { RequestSchemaLive } from "../RequestSchema.ts";

// A real api and a real handler, not a stand-in for entel's. Every endpoint on
// the Api answers a value its own schema accepts, so no request a client can
// send reaches the middleware's "Body" branch. Reaching it needs an endpoint
// whose answer its schema refuses, which is the bug the branch exists for.
//
// The refusal has to happen while encoding the response. A check is what does
// that: it leaves the Type side plain `number`, so the handler below compiles
// while the value it returns fails the rule on the way out.
const Positive = Schema.Struct({
  n: Schema.Number.check(Schema.isGreaterThan(0)),
});

class BrokenApi extends HttpApi.make("broken")
  .add(
    HttpApiGroup.make("broken", { topLevel: true }).add(
      HttpApiEndpoint.get("count", "/count", { success: Positive }),
    ),
  )
  // Declared the way src/api/Api.ts declares it, after the group, so this api
  // runs the same middleware under test rather than a copy of it.
  .middleware(RequestSchema) {}

const BrokenHandlers = HttpApiBuilder.group(BrokenApi, "broken", (handlers) =>
  handlers.handleAll({ count: () => Effect.succeed({ n: -1 }) }),
);

const BrokenLive = HttpRouter.serve(
  HttpApiBuilder.layer(BrokenApi).pipe(
    Layer.provide(BrokenHandlers.pipe(Layer.provide(RequestSchemaLive))),
  ),
);

layer(BrokenLive.pipe(Layer.provideMerge(NodeHttpServer.layerTest)))(
  "RequestSchema, with a response that fails its own schema",
  (it) => {
    it.effect("answers an empty 500", () =>
      Effect.gen(function* () {
        const response = yield* HttpClient.get("/count");

        // The caller sent nothing wrong, so blaming them with a 400 would send
        // them looking in the wrong place. The reason goes to the log instead:
        // a body here would either leak the server's internals or claim to be
        // a RequestRejected, which every other 400 in the contract is.
        assert.strictEqual(response.status, 500);
        assert.strictEqual(yield* response.text, "");
      }),
    );
  },
);
