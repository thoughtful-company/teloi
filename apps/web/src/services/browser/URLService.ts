import { Context, Effect, Layer, Stream } from "effect";
import { UnknownException } from "effect/Cause";

export class URLServiceB extends Context.Tag("URLServiceB")<
  URLServiceB,
  {
    /**
     * @returns path including "/"
     */
    getPath: () => Effect.Effect<string, never, never>;
    /**
     * @param path starting with "/"
     */
    setPath: (path: string) => Effect.Effect<void, UnknownException, never>;
    /**
     * Stream that emits pathname on popstate events (back/forward navigation)
     */
    popstate: () => Effect.Effect<Stream.Stream<string>>;
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

      const popstate = () =>
        Effect.sync(() =>
          Stream.async<string>((emit) => {
            const handler = () => {
              emit.single(window.location.pathname);
            };
            window.addEventListener("popstate", handler);
            return Effect.sync(() =>
              window.removeEventListener("popstate", handler),
            );
          }),
        );

      return {
        getPath,
        setPath,
        popstate,
      };
    }),
  );
};
