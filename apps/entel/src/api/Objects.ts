import { Schema } from "effect";
import {
  HttpApiEndpoint,
  HttpApiGroup,
  HttpApiSchema,
} from "effect/unstable/httpapi";
import { StoreUnavailable } from "./Errors.ts";
import { ObjectId } from "./ObjectId.ts";
import { Sign, SignTitle } from "./Signs.ts";
import { WorkspaceId, WorkspaceNotFound } from "./Workspaces.ts";

// The four kinds of object in BORO's constructivist ontology, and the only
// ontological commitment entel makes. Whole-part and extents in space and time
// come later and do not add kinds. The kinds without places are one literal
// set, used by every payload that splits on "tuple or not", so a fifth kind
// has to be placed on one side of that split before anything compiles.
export const PlacelessKind = Schema.Literals(["individual", "set", "tupleSet"]);
export type PlacelessKind = typeof PlacelessKind.Type;

export const ObjectKind = Schema.Literals([...PlacelessKind.literals, "tuple"]);
export type ObjectKind = typeof ObjectKind.Type;

// An object with everything the workspace knows about it. `places` is empty
// unless the kind is tuple, `elements` unless it is set or tupleSet. One shape
// for the list and the single read, so a client has one decoder. Named
// ModelObject because Object is the global.
export class ModelObject extends Schema.Class<ModelObject>("ModelObject")({
  id: ObjectId,
  kind: ObjectKind,
  signs: Schema.Array(Sign),
  places: Schema.Array(ObjectId),
  elements: Schema.Array(ObjectId),
}) {}

// A tuple is its places, so they are given at creation and only a tuple takes
// them. The union puts that rule in the payload schema: a caller that sends
// places with another kind, or a tuple without them, gets the 400 the schema
// answers with and nothing reaches a service. A Struct drops keys it does not
// declare, so the first member has to name places and refuse every value, or
// a set sent with places would be created and the places lost without a word.
export const CreateObject = Schema.Union([
  Schema.Struct({
    kind: PlacelessKind,
    title: SignTitle,
    places: Schema.optionalKey(Schema.Never),
  }),
  Schema.Struct({
    kind: Schema.Literal("tuple"),
    title: SignTitle,
    places: Schema.NonEmptyArray(ObjectId),
  }),
]);
export type CreateObject = typeof CreateObject.Type;

export const AddSign = Schema.Struct({ title: SignTitle });
export const AddElement = Schema.Struct({ elementId: ObjectId });

// The object named in a path, a place or an element is not in this workspace.
// A reference into another workspace is a pair of workspace id and object id
// and is not what these endpoints take, so a bare id from elsewhere is simply
// not found here.
export class ObjectNotFound extends Schema.TaggedError<ObjectNotFound>()(
  "ObjectNotFound",
  { workspaceId: WorkspaceId, objectId: ObjectId },
  { httpApiStatus: 404 },
) {}

// The object exists but is the wrong kind for what was asked: elements added
// to an individual or a tuple, or a non-tuple put into a tuple set. Both kinds
// are named so the caller can see which side of the request to fix.
export class KindMismatch extends Schema.TaggedError<KindMismatch>()(
  "KindMismatch",
  {
    objectId: ObjectId,
    expected: Schema.Array(ObjectKind),
    actual: ObjectKind,
  },
  { httpApiStatus: 409 },
) {}

export class ObjectsApi extends HttpApiGroup.make("objects").add(
  // Creates the object and its first sign in one event. An object without a
  // sign cannot be made, because in practice nobody names nothing.
  HttpApiEndpoint.post("create", "/workspaces/:workspaceId/objects", {
    params: { workspaceId: WorkspaceId },
    payload: CreateObject,
    success: ModelObject.pipe(HttpApiSchema.status(201)),
    error: [WorkspaceNotFound, ObjectNotFound, StoreUnavailable],
  }),
  HttpApiEndpoint.get("list", "/workspaces/:workspaceId/objects", {
    params: { workspaceId: WorkspaceId },
    success: Schema.Array(ModelObject),
    error: [WorkspaceNotFound, StoreUnavailable],
  }),
  HttpApiEndpoint.get("get", "/workspaces/:workspaceId/objects/:objectId", {
    params: { workspaceId: WorkspaceId, objectId: ObjectId },
    success: ModelObject,
    error: [WorkspaceNotFound, ObjectNotFound, StoreUnavailable],
  }),
  // A further name for an object that exists.
  HttpApiEndpoint.post(
    "addSign",
    "/workspaces/:workspaceId/objects/:objectId/signs",
    {
      params: { workspaceId: WorkspaceId, objectId: ObjectId },
      payload: AddSign,
      success: Sign.pipe(HttpApiSchema.status(201)),
      error: [WorkspaceNotFound, ObjectNotFound, StoreUnavailable],
    },
  ),
  // Membership is a fact about the set, so it is stated on the set's path and
  // the set is what comes back. Stating it twice is the same fact: the second
  // call commits nothing and answers the same set. That is also why this is a
  // 200 and not a 201; the answer is the set as it is, whether or not this
  // call was the one that changed it.
  HttpApiEndpoint.post(
    "addElement",
    "/workspaces/:workspaceId/objects/:objectId/elements",
    {
      params: { workspaceId: WorkspaceId, objectId: ObjectId },
      payload: AddElement,
      success: ModelObject,
      error: [
        WorkspaceNotFound,
        ObjectNotFound,
        KindMismatch,
        StoreUnavailable,
      ],
    },
  ),
) {}
