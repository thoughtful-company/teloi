import { Layer } from "effect";
import { RegistryLive } from "./Registry.ts";
import { Workspaces, WorkspacesLive } from "./Workspaces.ts";

// The one service graph. main.ts and the tests build this and differ only in
// where ENTEL_DATA_DIR points. Registry stays visible so a test can reach the
// store underneath. The type is spelled out for the same reason as
// RegistryLive's.
export const ServicesLive: Layer.Layer<
  Workspaces | Layer.Success<typeof RegistryLive>,
  Layer.Error<typeof RegistryLive>
> = WorkspacesLive.pipe(Layer.provideMerge(RegistryLive));
