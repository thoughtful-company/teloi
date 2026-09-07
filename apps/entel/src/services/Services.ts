import { Layer } from "effect";
import { RegistryLive } from "./Registry.ts";
import { Signs, SignsLive } from "./Signs.ts";
import { StoreAdapterLive } from "./StoreAdapter.ts";
import { Workspaces, WorkspacesLive } from "./Workspaces.ts";
import { WorkspaceStores, WorkspaceStoresLive } from "./WorkspaceStores.ts";

// The one service graph. main.ts and the tests build this and differ only in
// where ENTEL_DATA_DIR points. Registry and WorkspaceStores stay visible so a
// test can reach the stores underneath. The type is spelled out for the same
// reason as RegistryLive's.
export const ServicesLive: Layer.Layer<
  Signs | Workspaces | WorkspaceStores | Layer.Success<typeof RegistryLive>,
  Layer.Error<typeof RegistryLive> | Layer.Error<typeof StoreAdapterLive>
> = Layer.mergeAll(SignsLive, WorkspacesLive).pipe(
  Layer.provideMerge(WorkspaceStoresLive),
  Layer.provideMerge(RegistryLive),
  Layer.provide(StoreAdapterLive),
);
