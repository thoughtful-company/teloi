import { Layer, Logger, LogLevel, ManagedRuntime, pipe } from "effect";

const getLoggerLayer = (): Layer.Layer<never> => {
  const env = process.env.NODE_ENV;
  const logFormat = process.env.LOG_FORMAT;

  if (logFormat === "json") {
    return Logger.json;
  }

  if (logFormat === "structured") {
    return Logger.structured;
  }

  if (env === "production") {
    return Logger.json;
  }

  // Pretty logger for development
  return Logger.pretty;
};

const BrowserLayer = pipe(
  Logger.minimumLogLevel(LogLevel.Trace),
  Layer.provideMerge(getLoggerLayer()),
);

type EnvOf<L> = L extends Layer.Layer<infer R, unknown, unknown> ? R : never;

export type BrowserRequirements = EnvOf<typeof BrowserLayer>;

export const runtime = ManagedRuntime.make(BrowserLayer);

export type BrowserRuntime = typeof runtime;
