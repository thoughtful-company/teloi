import { Context, Effect, Layer, type Scope } from "effect";
import { ServicesLive } from "../services/Services.ts";
import { configLayerFor } from "./DataDir.ts";

// One run of the services against a data directory. Building and releasing the
// layer per run opens and closes the registry and every workspace store, so
// the next run has to read what the previous one wrote rather than answer from
// memory. A restart test calls this once per "process". The type is spelled
// out for the same reason as ServicesLive's.
export const runAgainst = <A, E, R>(
  dir: string,
  use: (
    services: Context.Context<Layer.Success<typeof ServicesLive>>,
  ) => Effect.Effect<A, E, R>,
): Effect.Effect<
  A,
  E | Layer.Error<typeof ServicesLive>,
  Exclude<R, Scope.Scope>
> =>
  Effect.scoped(
    Effect.flatMap(
      Layer.build(ServicesLive.pipe(Layer.provide(configLayerFor(dir)))),
      use,
    ),
  );
