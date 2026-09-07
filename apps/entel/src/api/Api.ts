import { HttpApi } from "effect/unstable/httpapi";
import { RequestSchema } from "./Errors.ts";
import { ObjectsApi } from "./Objects.ts";
import { SignsApi } from "./Signs.ts";
import { SystemApi } from "./System.ts";
import { WorkspacesApi } from "./Workspaces.ts";

export class Api extends HttpApi.make("entel")
  .add(SystemApi)
  .add(WorkspacesApi)
  .add(ObjectsApi)
  .add(SignsApi)
  // After every group, because middleware applies to the endpoints the api
  // has at that point.
  .middleware(RequestSchema) {}
