import { NodeHttpServer } from "@effect/platform-node";
import { Layer } from "effect";
import { HttpLive } from "../server/Http.ts";
import { ServicesLive } from "../services/Services.ts";
import { TempDataDir } from "./DataDir.ts";

export { Registry } from "../services/Registry.ts";
export { WorkspaceStores } from "../services/WorkspaceStores.ts";

// The whole server, real stores in a temp directory, on an ephemeral port,
// with an HttpClient already pointed at it. One layer so a test here, or in a
// package that consumes the contract, starts entel with one import and talks
// to it the way a foreign client does. The services stay visible, so a test
// can reach the store the server is holding and shut it down, which is the
// only way to make entel fail on purpose. The stores leave with the layer.
// The type is spelled out for the same reason as ServicesLive's.
export const EntelTest: Layer.Layer<
  | Layer.Success<typeof NodeHttpServer.layerTest>
  | Layer.Success<typeof ServicesLive>,
  | Layer.Error<typeof NodeHttpServer.layerTest>
  | Layer.Error<typeof ServicesLive>
  | Layer.Error<typeof TempDataDir>
> = HttpLive.pipe(
  Layer.provideMerge(ServicesLive),
  Layer.provide(TempDataDir),
  Layer.provideMerge(NodeHttpServer.layerTest),
);
