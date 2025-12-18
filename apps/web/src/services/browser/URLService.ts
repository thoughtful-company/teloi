import { Context, Effect, Layer } from "effect";
import { UnknownException } from "effect/Cause";

export class URLServiceB extends Context.Tag("URLServiceB")<
  URLServiceB,
  {
    /**
     * @returns path including "/"
     */
    getPath: () => Effect.Effect<string, never, never>;
    /**
     *
     * @param path starting with "/"
     */
    setPath: (path: string) => Effect.Effect<void, UnknownException, never>;
  }
>() {}

export const makeURLServiceLive = (window: Window) => {
  if (!window) {
    throw new Error(
      "Cannot construct window layer withought the window object available",
    );
  }

  return Layer.effect(
    URLServiceB,
    Effect.sync(() => {
      const getPath = () => {
        return Effect.succeed(window.location.pathname);
      };

      const setPath = (path: string) => {
        if (window.location.pathname == path) return Effect.void;

        return Effect.try(() => history.pushState({}, "", path));
      };

      return {
        getPath,
        setPath,
      };
    }),
  );
};
