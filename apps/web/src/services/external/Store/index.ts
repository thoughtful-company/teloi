import { deepEqual } from "@/attest/deep-equal";
import {
  BrandedId,
  ClientDocumentModel,
  EventFactory,
  TeloiSchema,
  documentEvents,
  tables,
} from "@/livestore/schema";
import { Model } from "@/schema/model";
import { LiveQueryDef, Store, queryDb } from "@livestore/livestore";
import { Context, Data, Effect, Layer, Option, Stream, pipe } from "effect";

export class TeloiStoreT extends Context.Tag("Context.Teloi")<
  TeloiStoreT,
  TeloiStore
>() {}

export type TeloiStore = Store<TeloiSchema>;
type QueryFn = TeloiStore["query"];
// eslint-disable-next-line @typescript-eslint/no-unused-vars
declare const _query: QueryFn;
type QueryParams<TResult> = Parameters<typeof _query<TResult>>;

export class LiveStoreError extends Data.TaggedError("LiveStoreError")<{
  cause: unknown;
}> {}

// todo move queryDb function and tables property to StoreT
export class StoreT extends Context.Tag("StoreT")<
  StoreT,
  {
    getSessionId: () => Effect.Effect<string, never, never>;
    /**
     * Replaces the entire existing document of the given type and id with the provided value.
     * If the value is identical to the existing value, no update is triggered.
     *
     * @param docType The document type to update
     * @param value The new document value, which will completely overwrite the previous one.
     * @param id Optional document id. If omitted, the default id is applied.
     */
    setDocument: <K extends Model.DocumentName>(
      docType: K,
      value: ClientDocumentModel<K>,
      id?: BrandedId<K>,
    ) => Effect.Effect<void, LiveStoreError>;
    getDocument: <K extends Model.DocumentName>(
      docType: K,
      id?: BrandedId<K>,
    ) => Effect.Effect<
      Option.Option<NonNullable<ClientDocumentModel<K>>>,
      never,
      never
    >;
    query: <TResult>(...args: QueryParams<TResult>) => Effect.Effect<TResult>;
    subscribeStream: <TResult>(
      query$: LiveQueryDef<TResult>,
      options?:
        | {
            label?: string;
            skipInitialRun?: boolean;
          }
        | undefined,
    ) => Effect.Effect<Stream.Stream<TResult>, LiveStoreError>;
    commit: (event: unknown) => Effect.Effect<void>;
  }
>() {}

export const getStoreLayer = (
  store: TeloiStore | Effect.Effect<TeloiStore>,
) => {
  return Layer.effect(
    StoreT,
    Effect.gen(function* () {
      const Store = Effect.isEffect(store) ? yield* store : store;

      const getSessionId = () => Effect.succeed(Store.clientSession.sessionId);

      function setDocument<K extends Model.DocumentName>(
        docType: K,
        value: ClientDocumentModel<K>,
        id?: BrandedId<K>,
      ): Effect.Effect<void, LiveStoreError> {
        const setDocumentEffect = Effect.try({
          try: () => {
            const event = (documentEvents[docType] as EventFactory<K>)(
              value,
              id,
            );
            return Store.commit(event);
          },
          catch: (err) => new LiveStoreError({ cause: err }),
        });

        return pipe(
          getDocument(docType, id),
          Effect.map((doc) =>
            Option.filter(doc, (doc) => deepEqual(doc, value)),
          ),
          Effect.flatMap((doc) =>
            Option.isSome(doc) ? Effect.void : setDocumentEffect,
          ),
        );
      }

      function getDocument<K extends Model.DocumentName>(
        docType: K,
        id?: BrandedId<K>,
      ) {
        // @ts-expect-error get expects a unique symbol, because of document table definitions
        const builder = tables[docType].get(id);
        //todo wrap in try to make store errors more intelligeble
        const document = Store.query(
          queryDb(builder as never),
        ) as ClientDocumentModel<K>;

        return Effect.succeed(Option.fromNullable(document));
      }

      const query: <TResult>(
        ...args: QueryParams<TResult>
      ) => Effect.Effect<TResult> = (query) => {
        try {
          var result = Store.query(query);
        } catch (e) {
          console.error("Store query unsuccessful", query, e);
          throw new Error("Store query unsuccessful", { cause: e });
        }
        return Effect.succeed(result);
      };

      const subscribeStream = <TResult>(
        query$: LiveQueryDef<TResult>,
        options?:
          | {
              label?: string;
              skipInitialRun?: boolean;
            }
          | undefined,
      ): Effect.Effect<Stream.Stream<TResult>, LiveStoreError> => {
        return Effect.try({
          try: () => Store.subscribeStream(query$, options),
          catch: (err) => new LiveStoreError({ cause: err }),
        });
      };

      const commit = (event: unknown) => Effect.sync(() => Store.commit(event));

      return {
        setDocument,
        getDocument,
        getSessionId,
        query,
        subscribeStream,
        commit,
      };
    }),
  );
};
