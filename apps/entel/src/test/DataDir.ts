import { NodeFileSystem } from "@effect/platform-node";
import {
  ConfigProvider,
  Effect,
  FileSystem,
  Layer,
  type PlatformError,
} from "effect";

// Overrides ENTEL_DATA_DIR and nothing else. StoreAdapter reads the key
// through Effect Config and every store goes through it, so this is the only
// seam a test needs to move all stores off the default folder. asPrimary puts
// this provider in front of the environment instead of replacing it, so other
// ENTEL_ keys keep working.
export const configLayerFor = (dir: string): Layer.Layer<never> =>
  ConfigProvider.layerAdd(ConfigProvider.fromUnknown({ ENTEL_DATA_DIR: dir }), {
    asPrimary: true,
  });

// The directory is created in the layer's own scope, so it is removed when the
// layer is torn down. That ties the store files to the lifetime of the layer
// that opened them and keeps cleanup out of afterEach.
export const TempDataDir: Layer.Layer<never, PlatformError.PlatformError> =
  Layer.unwrap(
    FileSystem.FileSystem.pipe(
      Effect.flatMap((fs) =>
        fs.makeTempDirectoryScoped({ prefix: "entel-test-" }),
      ),
      Effect.map(configLayerFor),
    ),
  ).pipe(Layer.provide(NodeFileSystem.layer));
