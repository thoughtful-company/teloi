import "@/index.css";
import EditorBuffer from "@/ui/EditorBuffer";
import { Effect } from "effect";
import { describe, it } from "vitest";
import { Given, Then, render, runtime } from "./bdd";

describe("EditorBuffer", () => {
  it("renders block with node text content", async () => {
    await Effect.gen(function* () {
      const textContent = "Hello, this is a test block";
      const { bufferId } = yield* Given.A_BUFFER_WITH_TEXT(textContent);

      render(() => <EditorBuffer bufferId={bufferId} />);

      yield* Then.TEXT_IS_VISIBLE(textContent);
    }).pipe(runtime.runPromise);
  });
});
