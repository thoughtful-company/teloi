import { Schema } from "effect";
import { HttpApiEndpoint, HttpApiGroup } from "effect/unstable/httpapi";
import { StoreUnavailable } from "./Errors.ts";
import { ObjectId } from "./ObjectId.ts";
import { ShortText } from "./Text.ts";
import { WorkspaceId, WorkspaceNotFound } from "./Workspaces.ts";

export const SignId = Schema.String.pipe(Schema.brand("SignId"));
export type SignId = typeof SignId.Type;

// A title only names the object the sign stands for. It is a token, not a
// description, so the same rule as a workspace name is enough for it.
export const SignTitle = ShortText.pipe(Schema.brand("SignTitle"));
export type SignTitle = typeof SignTitle.Type;

// The semantic level. A sign refers to exactly one object and has one title;
// a second name for the same object is a second sign. Signs are made through
// the objects group, since a sign for nothing is not a thing.
export class Sign extends Schema.Class<Sign>("Sign")({
  id: SignId,
  objectId: ObjectId,
  title: SignTitle,
}) {}

// A sign seen from outside its workspace. The pair of workspace id and sign
// is how one workspace refers into another, so a read that spans workspaces
// answers in that shape.
export class WorkspaceSign extends Schema.Class<WorkspaceSign>("WorkspaceSign")(
  {
    workspaceId: WorkspaceId,
    sign: Sign,
  },
) {}

export class SignsApi extends HttpApiGroup.make("signs").add(
  HttpApiEndpoint.get("list", "/workspaces/:workspaceId/signs", {
    params: { workspaceId: WorkspaceId },
    success: Schema.Array(Sign),
    error: [WorkspaceNotFound, StoreUnavailable],
  }),
  // Every sign in every workspace, in workspace creation order and then sign
  // creation order. One store failing fails the whole read, naming a store
  // that failed, rather than answering a list with a hole in it.
  HttpApiEndpoint.get("listAll", "/signs", {
    success: Schema.Array(WorkspaceSign),
    error: StoreUnavailable,
  }),
) {}
