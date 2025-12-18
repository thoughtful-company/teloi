import { Context, Effect } from "effect";

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
