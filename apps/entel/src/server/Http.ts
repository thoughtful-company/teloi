import { Layer } from "effect";
import { HttpRouter } from "effect/unstable/http";
import { HttpApiBuilder } from "effect/unstable/httpapi";
import { Api } from "../api/Api.ts";
import { SystemHandlers } from "./System.ts";

// Still needs an HttpServer. main.ts binds a real port, tests use layerTest.
export const HttpLive = HttpRouter.serve(
  HttpApiBuilder.layer(Api).pipe(Layer.provide(SystemHandlers)),
);
