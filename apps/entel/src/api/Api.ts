import { HttpApi } from "effect/unstable/httpapi";
import { SystemApi } from "./System.ts";
import { WorkspacesApi } from "./Workspaces.ts";

export class Api extends HttpApi.make("entel")
  .add(SystemApi)
  .add(WorkspacesApi) {}
