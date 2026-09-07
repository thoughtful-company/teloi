import { Schema } from "effect";
import {
  HttpApiEndpoint,
  HttpApiGroup,
  HttpApiSchema,
} from "effect/unstable/httpapi";
import { StoreUnavailable } from "./Errors.ts";
import { ShortText } from "./Text.ts";
import { WorkspaceId, WorkspaceNotFound } from "./Workspaces.ts";

export const SignId = Schema.String.pipe(Schema.brand("SignId"));
export type SignId = typeof SignId.Type;

// A title only names the object the sign stands for. It is a token, not a
// description, so the same rule as a workspace name is enough for it.
export const SignTitle = ShortText.pipe(Schema.brand("SignTitle"));
export type SignTitle = typeof SignTitle.Type;

export class Sign extends Schema.Class<Sign>("Sign")({
  id: SignId,
  title: SignTitle,
}) {}

// A struct, not a class, so a client can send a plain object.
export const CreateSign = Schema.Struct({ title: SignTitle });

export class SignsApi extends HttpApiGroup.make("signs").add(
  HttpApiEndpoint.post("create", "/workspaces/:workspaceId/signs", {
    params: { workspaceId: WorkspaceId },
    payload: CreateSign,
    success: Sign.pipe(HttpApiSchema.status(201)),
    error: [WorkspaceNotFound, StoreUnavailable],
  }),
  HttpApiEndpoint.get("list", "/workspaces/:workspaceId/signs", {
    params: { workspaceId: WorkspaceId },
    success: Schema.Array(Sign),
    error: [WorkspaceNotFound, StoreUnavailable],
  }),
) {}
