import { Schema } from "effect";
import { HttpApiEndpoint, HttpApiGroup } from "effect/unstable/httpapi";

export class Health extends Schema.Class<Health>("Health")({
  status: Schema.Literal("ok"),
}) {}

// topLevel puts health() on the client root instead of client.system.health().
export class SystemApi extends HttpApiGroup.make("system", {
  topLevel: true,
}).add(HttpApiEndpoint.get("health", "/health", { success: Health })) {}
