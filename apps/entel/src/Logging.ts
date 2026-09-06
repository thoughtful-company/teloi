import { Config, Effect, Layer, Logger, References } from "effect";

export const LoggingLive = Layer.unwrap(
  Effect.gen(function* () {
    const format = yield* Config.literals(
      ["pretty", "json"],
      "ENTEL_LOG_FORMAT",
    ).pipe(Config.withDefault("pretty"));
    const level = yield* Config.logLevel("ENTEL_LOG_LEVEL").pipe(
      Config.withDefault("Info"),
    );
    return Logger.layer([
      format === "json" ? Logger.consoleJson : Logger.defaultLogger,
    ]).pipe(
      Layer.provideMerge(Layer.succeed(References.MinimumLogLevel, level)),
    );
  }),
);
