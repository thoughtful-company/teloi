import { Schema } from "effect";

// In its own file because a sign refers to an object and an object carries its
// signs, so Signs.ts and Objects.ts each import the other's type, and one of
// them would be undefined at module load if the id lived in either.
export const ObjectId = Schema.String.pipe(Schema.brand("ObjectId"));
export type ObjectId = typeof ObjectId.Type;
