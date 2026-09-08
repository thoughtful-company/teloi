import { assert, layer } from "@effect/vitest";
import { fireEvent } from "@solidjs/testing-library";
import { Effect } from "effect";
import * as Given from "../../test/Given.ts";
import { EntelTest, mount } from "../../test/Theoria.tsx";

// Its own entel, so this block sees a registry nothing has been created in.
// The block below shares one server between its tests and can never be sure
// of that again.
layer(EntelTest, { excludeTestServices: true })(
  "the workspaces page, on an empty entel",
  (it) => {
    it.effect("says there is no workspace yet", () =>
      Effect.gen(function* () {
        const { view } = yield* mount("/");

        yield* Effect.promise(() => view.findByText("No workspaces yet."));
      }),
    );
  },
);

layer(EntelTest, { excludeTestServices: true })("the workspaces page", (it) => {
  it.effect("lists a workspace that was created while it was open", () =>
    Effect.gen(function* () {
      const { client, view } = yield* mount("/");
      yield* Effect.promise(() =>
        view.findByRole("heading", { level: 1, name: "Workspaces" }),
      );

      const harbour = yield* Given.workspace(client, "harbour");

      const link = yield* Effect.promise(() =>
        view.findByRole("link", { name: "harbour" }),
      );
      assert.strictEqual(
        link.getAttribute("href"),
        `/workspaces/${harbour.id}`,
      );
      assert.strictEqual(view.getByText(harbour.id).tagName, "CODE");
    }),
  );

  it.effect("opens a workspace when its link is clicked", () =>
    Effect.gen(function* () {
      const client = yield* Given.entel();
      const atlas = yield* Given.workspace(client, "atlas");

      const { view, history } = yield* mount("/");
      const link = yield* Effect.promise(() =>
        view.findByRole("link", { name: "atlas" }),
      );
      fireEvent.click(link);

      yield* Effect.promise(() =>
        view.findByRole("heading", { level: 1, name: "atlas" }),
      );
      assert.strictEqual(history.get(), `/workspaces/${atlas.id}`);
    }),
  );
});
