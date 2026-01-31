import { Context, Effect, Stream } from "effect";

/**
 * A higher-order function that binds a `Context` to an effectful function.
 *
 * It takes a function that returns an `Effect` with some requirements (`S`),
 * and returns a new function that takes a `Context` and returns a final
 * function where those requirements have been provided.
 *
 * @param f The effectful function to which the context will be provided.
 * @template A The arguments of the original function `f`.
 * @template R The success type of the `Effect` returned by `f`.
 * @template E The error type of the `Effect` returned by `f`.
 * @template S The services required by the `Effect` returned by `f`.
 */
export const withContext =
  <A extends unknown[], R, E, S>(f: (...args: A) => Effect.Effect<R, E, S>) =>
  /**
   * @param context The `Context` containing the services to provide.
   * @template S2 The specific services provided by the `context`. Must be a subtype of `S`.
   */
  <S2>(context: Context.Context<S2>) =>
  /**
   * The new function that takes the original arguments but returns an `Effect`
   * with the provided services removed from its requirements.
   */
  (...args: A): Effect.Effect<R, E, Exclude<S, S2>> =>
    f(...args).pipe(Effect.provide(context));

/**
 * Returns an Effect that resolves after N animation frames.
 * Commonly used with n=2 ("double RAF") to wait for CodeMirror
 * to sync its internal selection to the browser's native selection.
 */
export const waitFrames = (n: number): Effect.Effect<void> =>
  Effect.async<void>((resume) => {
    let remaining = n;
    const tick = () => {
      if (--remaining <= 0) resume(Effect.void);
      else requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });

/** Double RAF — waits two animation frames before resolving. */
export const doubleRaf = waitFrames(2);

/**
 * Delays each stream emission by N animation frames.
 *
 * Useful for timing coordination when one stream needs to "settle"
 * before another stream's emissions are acted upon.
 */
export const delayByFrames =
  (n: number) =>
  <A, E, R>(stream: Stream.Stream<A, E, R>): Stream.Stream<A, E, R> =>
    stream.pipe(
      Stream.mapEffect((value) => waitFrames(n).pipe(Effect.as(value))),
    );

/**
 * Delays each stream emission by a microtask (queueMicrotask).
 * Smallest possible delay - runs after current sync code completes.
 */
export const delayByMicrotask = <A, E, R>(
  stream: Stream.Stream<A, E, R>,
): Stream.Stream<A, E, R> =>
  stream.pipe(
    Stream.mapEffect((value) =>
      Effect.async<A>((resume) => {
        queueMicrotask(() => resume(Effect.succeed(value)));
      }),
    ),
  );

/**
 * Delays each stream emission by setTimeout(0).
 * Runs at end of macrotask queue (~4ms minimum in browsers).
 */
export const delayByTimeout = <A, E, R>(
  stream: Stream.Stream<A, E, R>,
): Stream.Stream<A, E, R> =>
  stream.pipe(
    Stream.mapEffect((value) =>
      Effect.async<A>((resume) => {
        setTimeout(() => resume(Effect.succeed(value)), 0);
      }),
    ),
  );
