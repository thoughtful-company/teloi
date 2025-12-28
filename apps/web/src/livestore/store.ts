import { makePersistedAdapter } from "@livestore/adapter-web";
import LiveStoreSharedWorker from "@livestore/adapter-web/shared-worker?sharedworker";
import { getStore } from "@livestore/solid";
import { Store } from "@livestore/livestore";
import { Accessor } from "solid-js";
import { schema } from "./schema";
import LiveStoreWorker from "./livestore.worker?worker";

const adapterFactory = makePersistedAdapter({
  storage: { type: "opfs" },
  worker: LiveStoreWorker,
  sharedWorker: LiveStoreSharedWorker,
});

export const store: Accessor<Store<typeof schema> | undefined> = await getStore<
  typeof schema
>({
  adapter: adapterFactory,
  schema,
  storeId: "default",
});
