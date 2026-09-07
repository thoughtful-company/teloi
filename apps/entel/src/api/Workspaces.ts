import { Schema } from "effect";
import {
  HttpApiEndpoint,
  HttpApiGroup,
  HttpApiSchema,
} from "effect/unstable/httpapi";
import { StoreUnavailable } from "./Errors.ts";
import { ShortText } from "./Text.ts";

export const WorkspaceId = Schema.String.pipe(Schema.brand("WorkspaceId"));
export type WorkspaceId = typeof WorkspaceId.Type;

// Branded so that only a decoded or constructed value passes as a name, the
// same guarantee WorkspaceId gives.
export const WorkspaceName = ShortText.pipe(Schema.brand("WorkspaceName"));
export type WorkspaceName = typeof WorkspaceName.Type;

export class Workspace extends Schema.Class<Workspace>("Workspace")({
  id: WorkspaceId,
  name: WorkspaceName,
}) {}

// A struct, not a class, so a client can send a plain object.
export const CreateWorkspace = Schema.Struct({ name: WorkspaceName });

// The workspace named in a path is not in the registry. Raised before any
// store for it is touched, so a request can never make entel open, or create
// on disk, a store the registry did not issue.
export class WorkspaceNotFound extends Schema.TaggedError<WorkspaceNotFound>()(
  "WorkspaceNotFound",
  { workspaceId: WorkspaceId },
  { httpApiStatus: 404 },
) {}

export class WorkspacesApi extends HttpApiGroup.make("workspaces").add(
  HttpApiEndpoint.post("create", "/workspaces", {
    payload: CreateWorkspace,
    success: Workspace.pipe(HttpApiSchema.status(201)),
    error: StoreUnavailable,
  }),
  HttpApiEndpoint.get("list", "/workspaces", {
    success: Schema.Array(Workspace),
    error: StoreUnavailable,
  }),
) {}
