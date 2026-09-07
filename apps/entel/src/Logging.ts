import {
  Cause,
  Config,
  Effect,
  Layer,
  Logger,
  References,
  Runtime,
} from "effect";

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

// runMain logs an unhandled failure with the default logger, which knows
// nothing about ENTEL_LOG_FORMAT or ENTEL_LOG_LEVEL. Log it here, under the
// configured logger, and mark it reported so runMain stays quiet. Interrupts
// are how the process is asked to stop, not failures.
export const reportFailure = <E>(cause: Cause.Cause<E>) =>
  Cause.hasInterruptsOnly(cause)
    ? Effect.void
    : Effect.logError("entel stopped", cause).pipe(
        Effect.andThen(Effect.sync(() => markReported(Cause.squash(cause)))),
      );

// ================================ Internal ===================================

const markReported = (error: unknown) => {
  if (typeof error === "object" && error !== null) {
    Object.defineProperty(error, Runtime.errorReported, { value: false });
  }
};
