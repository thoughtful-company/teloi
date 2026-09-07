import { Layer } from "effect";
import { HttpRouter } from "effect/unstable/http";
import { HttpApiBuilder } from "effect/unstable/httpapi";
import { Api } from "../api/Api.ts";
import { SignsHandlers } from "./Signs.ts";
import { SystemHandlers } from "./System.ts";
import { WorkspacesHandlers } from "./Workspaces.ts";

// Still needs an HttpServer and the services the handlers use. main.ts binds
// a real port and the real stores, tests use layerTest and a temp data dir.
export const HttpLive = HttpRouter.serve(
  HttpApiBuilder.layer(Api).pipe(
    Layer.provide(
      Layer.mergeAll(SystemHandlers, WorkspacesHandlers, SignsHandlers),
    ),
  ),
);
