import { Layer } from "effect";
import { HttpRouter } from "effect/unstable/http";
import { HttpApiBuilder } from "effect/unstable/httpapi";
import { Api } from "../api/Api.ts";
import { ObjectsHandlers } from "./Objects.ts";
import { RequestSchemaLive } from "./RequestSchema.ts";
import { SignsHandlers } from "./Signs.ts";
import { SystemHandlers } from "./System.ts";
import { WorkspacesHandlers } from "./Workspaces.ts";

// Every handler group, under the request-schema middleware declared on the
// api, which is why each group's layer requires it. Still needs an HttpServer
// and the services the handlers use. main.ts binds a real port and the real
// stores, tests use layerTest and a temp data dir.
export const HttpLive = HttpRouter.serve(
  HttpApiBuilder.layer(Api, { openapiPath: "/openapi.json" }).pipe(
    Layer.provide(
      Layer.mergeAll(
        SystemHandlers,
        WorkspacesHandlers,
        ObjectsHandlers,
        SignsHandlers,
      ).pipe(Layer.provide(RequestSchemaLive)),
    ),
  ),
);
