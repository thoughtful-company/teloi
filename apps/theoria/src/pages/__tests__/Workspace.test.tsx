import { assert, layer } from "@effect/vitest";
import { fireEvent, within } from "@solidjs/testing-library";
import { WorkspaceId } from "@teloi/entel/api";
import { Effect } from "effect";
import * as Given from "../../test/Given.ts";
import {
  EntelTest,
  mount,
  setVisibility,
  WorkspaceStores,
} from "../../test/Theoria.tsx";

layer(EntelTest, { excludeTestServices: true })("the workspace page", (it) => {
  it.effect("groups the objects by kind, each region with its count", () =>
    Effect.gen(function* () {
      const client = yield* Given.entel();
      const harbour = yield* Given.workspace(client, "harbour");
      const ship = yield* Given.individual(client, harbour.id, "Ship");
      const fleet = yield* Given.set(client, harbour.id, "Fleet");
      const hasPart = yield* Given.tupleSet(client, harbour.id, "has part");
      const shipHasAnchor = yield* Given.tuple(
        client,
        harbour.id,
        "Ship has Anchor",
        [ship.id],
      );

      const { view } = yield* mount(`/workspaces/${harbour.id}`);

      yield* Effect.promise(() =>
        view.findByRole("heading", { level: 1, name: "harbour" }),
      );
      assert.strictEqual(view.getByText(harbour.id).tagName, "CODE");

      const shown = [
        ["Individuals", "Ship", ship.id],
        ["Sets", "Fleet", fleet.id],
        ["Tuples", "Ship has Anchor", shipHasAnchor.id],
        ["Tuple sets", "has part", hasPart.id],
      ] as const;
      for (const [kind, title, id] of shown) {
        const region = view.getByRole("region", { name: kind });
        assert.strictEqual(
          within(region).getByTestId("count").textContent,
          "1",
          `${kind} count`,
        );
        const link = within(region).getByRole("link", { name: title });
        assert.strictEqual(
          link.getAttribute("href"),
          `/workspaces/${harbour.id}/objects/${id}`,
        );
        assert.strictEqual(within(region).getByText(id).tagName, "CODE");
      }

      // The four regions in the order a reader expects to meet them, the
      // simple things before the ones built out of them.
      const regions = view.getAllByRole("region");
      assert.deepStrictEqual(
        shown.map(([kind]) =>
          regions.indexOf(view.getByRole("region", { name: kind })),
        ),
        [0, 1, 2, 3],
      );
    }),
  );

  it.effect("shows an object created while it was open", () =>
    Effect.gen(function* () {
      const client = yield* Given.entel();
      const harbour = yield* Given.workspace(client, "harbour");

      const { view } = yield* mount(`/workspaces/${harbour.id}`);
      const individuals = () =>
        view.getByRole("region", { name: "Individuals" });
      yield* Effect.promise(() =>
        view.findByRole("region", { name: "Individuals" }),
      );
      assert.strictEqual(
        within(individuals()).getByTestId("count").textContent,
        "0",
      );
      within(individuals()).getByText("None yet.");

      const ship = yield* Given.individual(client, harbour.id, "Ship");

      const link = yield* Effect.promise(() =>
        view.findByRole("link", { name: "Ship" }),
      );
      assert.strictEqual(
        link.getAttribute("href"),
        `/workspaces/${harbour.id}/objects/${ship.id}`,
      );
      assert.strictEqual(
        within(individuals()).getByTestId("count").textContent,
        "1",
      );
    }),
  );

  // jsdom has no tabs, so the state is set by hand and the event dispatched.
  // What this pins is the half that can be seen: a tab shown again asks at
  // once. That nothing is asked while hidden would need a wait for silence.
  it.effect(
    "shows what was made while the tab was hidden, once it is shown",
    () =>
      Effect.gen(function* () {
        const client = yield* Given.entel();
        const harbour = yield* Given.workspace(client, "harbour");

        const { view } = yield* mount(`/workspaces/${harbour.id}`);
        yield* Effect.promise(() =>
          view.findByRole("region", { name: "Individuals" }),
        );

        yield* Effect.sync(() => setVisibility("hidden"));
        const ship = yield* Given.individual(client, harbour.id, "Ship");
        yield* Effect.sync(() => setVisibility("visible"));

        const link = yield* Effect.promise(() =>
          view.findByRole("link", { name: "Ship" }),
        );
        assert.strictEqual(
          link.getAttribute("href"),
          `/workspaces/${harbour.id}/objects/${ship.id}`,
        );
      }),
  );

  // Both paths match the same route, so the router keeps the page and only
  // the param changes. This is the path a back button or an edited address
  // takes, and the one where a stale picture would show under the wrong name.
  it.effect(
    "shows the other workspace when only the id in the path changes",
    () =>
      Effect.gen(function* () {
        const client = yield* Given.entel();
        const alpha = yield* Given.workspace(client, "alpha");
        const beta = yield* Given.workspace(client, "beta");
        yield* Given.individual(client, alpha.id, "Ship");
        yield* Given.individual(client, beta.id, "Anchor");

        const { view, history } = yield* mount(`/workspaces/${alpha.id}`);
        yield* Effect.promise(() => view.findByRole("link", { name: "Ship" }));

        history.set({ value: `/workspaces/${beta.id}`, scroll: false });

        yield* Effect.promise(() =>
          view.findByRole("heading", { level: 1, name: "beta" }),
        );
        yield* Effect.promise(() =>
          view.findByRole("link", { name: "Anchor" }),
        );
        assert.isNull(view.queryByRole("link", { name: "Ship" }));
        assert.strictEqual(view.getByText(beta.id).tagName, "CODE");
      }),
  );

  it.effect("opens an object when its link is clicked", () =>
    Effect.gen(function* () {
      const client = yield* Given.entel();
      const harbour = yield* Given.workspace(client, "harbour");
      const ship = yield* Given.individual(client, harbour.id, "Ship");

      const { view, history } = yield* mount(`/workspaces/${harbour.id}`);
      const link = yield* Effect.promise(() =>
        view.findByRole("link", { name: "Ship" }),
      );
      fireEvent.click(link);

      yield* Effect.promise(() =>
        view.findByRole("heading", { level: 1, name: "Ship" }),
      );
      assert.strictEqual(
        history.get(),
        `/workspaces/${harbour.id}/objects/${ship.id}`,
      );
    }),
  );

  it.effect("says so when the workspace in the path does not exist", () =>
    Effect.gen(function* () {
      const missing = WorkspaceId.make("no-such-workspace");

      const { view } = yield* mount(`/workspaces/${missing}`);

      yield* Effect.promise(() =>
        view.findByText(`No workspace with id ${missing}.`),
      );
    }),
  );
});

// Its own server, because the test shuts a workspace store down for good and
// no later test should meet it by accident.
layer(EntelTest, { excludeTestServices: true })(
  "the workspace page, with its store shut down",
  (it) => {
    it.effect("keeps the last picture and says so when a refresh fails", () =>
      Effect.gen(function* () {
        const client = yield* Given.entel();
        const harbour = yield* Given.workspace(client, "harbour");
        yield* Given.individual(client, harbour.id, "Ship");

        const { view } = yield* mount(`/workspaces/${harbour.id}`);
        yield* Effect.promise(() => view.findByRole("link", { name: "Ship" }));

        // The only way to make entel fail on purpose: the store behind the
        // workspace is shut down, and every request against it answers 503.
        const stores = yield* WorkspaceStores;
        const { store } = yield* stores.open(harbour.id);
        yield* store.shutdown();

        const alert = yield* Effect.promise(() => view.findByRole("alert"));
        assert.include(alert.textContent ?? "", "StoreUnavailable");
        view.getByRole("link", { name: "Ship" });
        view.getByRole("heading", { level: 1, name: "harbour" });
      }),
    );
  },
);
