import type {
  ModelObject,
  ObjectId,
  ObjectKind,
  Workspace,
  WorkspaceId,
} from "@teloi/entel/api";

// The four kinds in the order the pages show them, individuals first because a
// model starts with things, relations last because they are built from them.
export const kinds: ReadonlyArray<ObjectKind> = [
  "individual",
  "set",
  "tuple",
  "tupleSet",
];

export const kindLabel: Record<ObjectKind, string> = {
  individual: "Individual",
  set: "Set",
  tuple: "Tuple",
  tupleSet: "Tuple set",
};

export const kindPlural: Record<ObjectKind, string> = {
  individual: "Individuals",
  set: "Sets",
  tuple: "Tuples",
  tupleSet: "Tuple sets",
};

// The id stands in until the list that carries the name has answered, or
// when the id in the path names no workspace at all.
export const workspaceName = (
  workspaces: ReadonlyArray<Workspace>,
  id: WorkspaceId,
): string => workspaces.find((w) => w.id === id)?.name ?? id;

// The first sign names the object on every page, because it is the one made
// with the object and the one an agent used first. The contract does not
// promise a sign, so the id stands in for a nameless object rather than a
// blank heading.
export const titleOf = (object: ModelObject): string =>
  object.signs[0]?.title ?? object.id;

export const byKind = (
  objects: ReadonlyArray<ModelObject>,
): Record<ObjectKind, ReadonlyArray<ModelObject>> => ({
  individual: objects.filter((object) => object.kind === "individual"),
  set: objects.filter((object) => object.kind === "set"),
  tuple: objects.filter((object) => object.kind === "tuple"),
  tupleSet: objects.filter((object) => object.kind === "tupleSet"),
});

// Where an object is a place, with the 1-based position a person would say.
export interface PlaceOf {
  readonly tuple: ModelObject;
  readonly position: number;
}

export interface AppearsIn {
  readonly asPlace: ReadonlyArray<PlaceOf>;
  readonly asElement: ReadonlyArray<ModelObject>;
}

// The reverse relations, read off the other objects, since entel stores a
// tuple's places and a set's elements on the tuple and the set. A tuple that
// holds the object in two places is listed once per place.
export const appearsIn = (
  objects: ReadonlyArray<ModelObject>,
  id: ObjectId,
): AppearsIn => ({
  asPlace: objects.flatMap((tuple) =>
    tuple.places.flatMap((place, index) =>
      place === id ? [{ tuple, position: index + 1 }] : [],
    ),
  ),
  asElement: objects.filter((set) => set.elements.includes(id)),
});
