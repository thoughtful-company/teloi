import { Schema } from "effect";
import {
  HttpApiEndpoint,
  HttpApiGroup,
  HttpApiSchema,
} from "effect/unstable/httpapi";

export const WorkspaceId = Schema.String.pipe(Schema.brand("WorkspaceId"));
export type WorkspaceId = typeof WorkspaceId.Type;

// Trimmed and bounded because a name goes into the event log, which nothing
// removes from. Branded so that only a decoded or constructed value passes as
// a name, the same guarantee WorkspaceId gives.
export const WorkspaceName = Schema.NonEmptyString.check(
  Schema.isTrimmed(),
  Schema.isMaxLength(200),
).pipe(Schema.brand("WorkspaceName"));
export type WorkspaceName = typeof WorkspaceName.Type;

export class Workspace extends Schema.Class<Workspace>("Workspace")({
  id: WorkspaceId,
  name: WorkspaceName,
}) {}

// A struct, not a class, so a client can send a plain object.
export const CreateWorkspace = Schema.Struct({ name: WorkspaceName });

// The registry store is not answering. With detail "commit", "query" or
// "syncStatus" the store has shut down and every request fails until entel
// restarts. With detail "persist" the commit went through but the leader did
// not confirm it in time; the workspace may exist, so list before retrying.
export class RegistryUnavailable extends Schema.TaggedError<RegistryUnavailable>()(
  "RegistryUnavailable",
  { detail: Schema.String },
  { httpApiStatus: 503 },
) {}

export class WorkspacesApi extends HttpApiGroup.make("workspaces").add(
  HttpApiEndpoint.post("create", "/workspaces", {
    payload: CreateWorkspace,
    success: Workspace.pipe(HttpApiSchema.status(201)),
    error: RegistryUnavailable,
  }),
  HttpApiEndpoint.get("list", "/workspaces", {
    success: Schema.Array(Workspace),
    error: RegistryUnavailable,
  }),
) {}
