import {
  type ObjectId,
  type PlacelessKind,
  SignTitle,
  WorkspaceName,
  type WorkspaceId,
} from "@teloi/entel/api";
import { Effect } from "effect";
import type { HttpClient } from "effect/unstable/http";
import { makeClient, type EntelClient } from "../client.ts";

// A client on the entel the block started, for a test that models before it
// mounts. It is the same server the mounted app reads from, so what is built
// here is what the page shows.
export const entel = (): Effect.Effect<
  EntelClient,
  never,
  HttpClient.HttpClient
> => makeClient();

export const workspace = Effect.fn("Given.workspace")(function* (
  client: EntelClient,
  name: string,
) {
  return yield* client.workspaces.create({
    payload: { name: WorkspaceName.make(name) },
  });
});

export const individual = Effect.fn("Given.individual")(function* (
  client: EntelClient,
  workspaceId: WorkspaceId,
  title: string,
) {
  return yield* placeless(client, workspaceId, "individual", title);
});

export const set = Effect.fn("Given.set")(function* (
  client: EntelClient,
  workspaceId: WorkspaceId,
  title: string,
) {
  return yield* placeless(client, workspaceId, "set", title);
});

export const tupleSet = Effect.fn("Given.tupleSet")(function* (
  client: EntelClient,
  workspaceId: WorkspaceId,
  title: string,
) {
  return yield* placeless(client, workspaceId, "tupleSet", title);
});

// The places are the tuple, so they are given here and never change. The type
// is the contract's own non-empty array, so a tuple with no place does not
// compile rather than failing against the server.
export const tuple = Effect.fn("Given.tuple")(function* (
  client: EntelClient,
  workspaceId: WorkspaceId,
  title: string,
  places: readonly [ObjectId, ...ObjectId[]],
) {
  return yield* client.objects.create({
    params: { workspaceId },
    payload: { kind: "tuple", title: SignTitle.make(title), places },
  });
});

export const element = Effect.fn("Given.element")(function* (
  client: EntelClient,
  workspaceId: WorkspaceId,
  setId: ObjectId,
  elementId: ObjectId,
) {
  return yield* client.objects.addElement({
    params: { workspaceId, objectId: setId },
    payload: { elementId },
  });
});

export const sign = Effect.fn("Given.sign")(function* (
  client: EntelClient,
  workspaceId: WorkspaceId,
  objectId: ObjectId,
  title: string,
) {
  return yield* client.objects.addSign({
    params: { workspaceId, objectId },
    payload: { title: SignTitle.make(title) },
  });
});

// ================================ Internal ===================================

// The three kinds without places are one payload shape, and a test names the
// kind through the helper above so it reads as the model it builds.
const placeless = (
  client: EntelClient,
  workspaceId: WorkspaceId,
  kind: PlacelessKind,
  title: string,
) =>
  client.objects.create({
    params: { workspaceId },
    payload: { kind, title: SignTitle.make(title) },
  });
