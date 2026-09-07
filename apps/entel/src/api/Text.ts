import { Schema } from "effect";

// The one rule for every short piece of text a caller names something with.
// Trimmed and bounded because the value goes into an event log that nothing
// removes from. Names and titles brand it separately so one cannot pass as the
// other.
export const ShortText = Schema.NonEmptyString.check(
  Schema.isTrimmed(),
  Schema.isMaxLength(200),
);
