import { NodeHttpServer, NodeRuntime } from "@effect/platform-node";
import { Config, Effect, Layer } from "effect";
import { createServer } from "node:http";
import { LoggingLive, reportFailure } from "./Logging.ts";
import { HttpLive } from "./server/Http.ts";
import { ServicesLive } from "./services/Services.ts";

const ServerLive = HttpLive.pipe(
  Layer.provide(ServicesLive),
  Layer.provide(
    NodeHttpServer.layerConfig(createServer, {
      // Loopback by default. Nothing in entel is authenticated yet, so a
      // laptop on a shared network must not serve it unless asked to.
      host: Config.string("ENTEL_HOST").pipe(Config.withDefault("127.0.0.1")),
      port: Config.port("ENTEL_PORT").pipe(Config.withDefault(3900)),
    }),
  ),
);

// The failure hook sits inside the logging layer, so a bad ENTEL_PORT is
// reported in the configured format. runMain turns SIGINT and SIGTERM into an
// interrupt, so the server closes and finalizers run instead of the process
// dying mid-request.
NodeRuntime.runMain(
  Layer.launch(ServerLive).pipe(
    Effect.tapCause(reportFailure),
    Effect.provide(LoggingLive),
  ),
);
