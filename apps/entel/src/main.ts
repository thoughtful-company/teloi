import { NodeHttpServer, NodeRuntime } from "@effect/platform-node";
import { Config, Layer } from "effect";
import { createServer } from "node:http";
import { LoggingLive } from "./Logging.ts";
import { HttpLive } from "./server/Http.ts";

const ServerLive = HttpLive.pipe(
  Layer.provide(
    NodeHttpServer.layerConfig(createServer, {
      // Loopback by default. Nothing in entel is authenticated yet, so a
      // laptop on a shared network must not serve it unless asked to.
      host: Config.string("ENTEL_HOST").pipe(Config.withDefault("127.0.0.1")),
      port: Config.port("ENTEL_PORT").pipe(Config.withDefault(3900)),
    }),
  ),
  Layer.provide(LoggingLive),
);

// runMain turns SIGINT and SIGTERM into an interrupt, so the server closes
// and finalizers run instead of the process dying mid-request.
NodeRuntime.runMain(Layer.launch(ServerLive));
