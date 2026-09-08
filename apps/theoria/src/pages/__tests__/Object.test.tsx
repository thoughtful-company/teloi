import { assert, layer } from "@effect/vitest";
import { fireEvent, within } from "@solidjs/testing-library";
import { ObjectId } from "@teloi/entel/api";
import { Effect } from "effect";
import * as Given from "../../test/Given.ts";
import { EntelTest, mount } from "../../test/Theoria.tsx";

layer(EntelTest, { excludeTestServices: true })("the object page", (it) => {
  it.effect("shows the object, its kind, its names and the way back", () =>
    Effect.gen(function* () {
      const client = yield* Given.entel();
      const harbour = yield* Given.workspace(client, "harbour");
      const ship = yield* Given.individual(client, harbour.id, "Ship");

      const { view } = yield* mount(
        `/workspaces/${harbour.id}/objects/${ship.id}`,
      );

      yield* Effect.promise(() =>
        view.findByRole("heading", { level: 1, name: "Ship" }),
      );
      assert.strictEqual(view.getByText(ship.id).tagName, "CODE");
      assert.strictEqual(view.getByTestId("kind").textContent, "Individual");
      assert.strictEqual(
        view.getByRole("link", { name: "harbour" }).getAttribute("href"),
        `/workspaces/${harbour.id}`,
      );

      const signs = view.getByRole("region", { name: "Signs" });
      const listed = within(signs).getAllByRole("listitem");
      assert.strictEqual(listed.length, 1);
      assert.include(listed[0]?.textContent ?? "", "Ship");
      for (const sign of ship.signs) {
        assert.strictEqual(within(signs).getByText(sign.id).tagName, "CODE");
      }
    }),
  );

  it.effect("says the object is in nothing when it is in nothing", () =>
    Effect.gen(function* () {
      const client = yield* Given.entel();
      const harbour = yield* Given.workspace(client, "harbour");
      const ship = yield* Given.individual(client, harbour.id, "Ship");

      const { view } = yield* mount(
        `/workspaces/${harbour.id}/objects/${ship.id}`,
      );

      const appearsIn = yield* Effect.promise(() =>
        view.findByRole("region", { name: "Appears in" }),
      );
      within(appearsIn).getByText("Nowhere yet.");
      assert.isNull(view.queryByTestId("as-place"));
      assert.isNull(view.queryByTestId("as-element"));
    }),
  );

  it.effect("shows the tuple and the set the object is in", () =>
    Effect.gen(function* () {
      const client = yield* Given.entel();
      const harbour = yield* Given.workspace(client, "harbour");
      const ship = yield* Given.individual(client, harbour.id, "Ship");
      const anchor = yield* Given.individual(client, harbour.id, "Anchor");
      const shipHasAnchor = yield* Given.tuple(
        client,
        harbour.id,
        "Ship has Anchor",
        [ship.id, anchor.id],
      );
      const fleet = yield* Given.set(client, harbour.id, "Fleet");
      yield* Given.element(client, harbour.id, fleet.id, ship.id);

      const { view } = yield* mount(
        `/workspaces/${harbour.id}/objects/${ship.id}`,
      );

      const places = yield* Effect.promise(() => view.findByTestId("as-place"));
      const placeItems = within(places).getAllByRole("listitem");
      assert.strictEqual(placeItems.length, 1);
      assert.include(placeItems[0]?.textContent ?? "", "place 1");
      assert.strictEqual(
        within(places)
          .getByRole("link", { name: "Ship has Anchor" })
          .getAttribute("href"),
        `/workspaces/${harbour.id}/objects/${shipHasAnchor.id}`,
      );

      const sets = view.getByTestId("as-element");
      const setItems = within(sets).getAllByRole("listitem");
      assert.strictEqual(setItems.length, 1);
      assert.strictEqual(
        within(sets).getByRole("link", { name: "Fleet" }).getAttribute("href"),
        `/workspaces/${harbour.id}/objects/${fleet.id}`,
      );
    }),
  );

  it.effect("shows a tuple's places in their order, a repeat included", () =>
    Effect.gen(function* () {
      const client = yield* Given.entel();
      const harbour = yield* Given.workspace(client, "harbour");
      const ship = yield* Given.individual(client, harbour.id, "Ship");
      const anchor = yield* Given.individual(client, harbour.id, "Anchor");
      // A tuple can hold the same object in two places, so the page has to
      // show a list of places and not a set of the objects filling them.
      const watch = yield* Given.tuple(
        client,
        harbour.id,
        "Ship watches Ship",
        [ship.id, anchor.id, ship.id],
      );

      const { view } = yield* mount(
        `/workspaces/${harbour.id}/objects/${watch.id}`,
      );

      yield* Effect.promise(() =>
        view.findByRole("heading", { level: 1, name: "Ship watches Ship" }),
      );
      assert.strictEqual(view.getByTestId("kind").textContent, "Tuple");

      const region = view.getByRole("region", { name: "Places" });
      const links = within(region).getAllByRole("link");
      assert.deepStrictEqual(
        links.map((link) => link.textContent),
        ["Ship", "Anchor", "Ship"],
      );
      assert.deepStrictEqual(
        links.map((link) => link.getAttribute("href")),
        [ship.id, anchor.id, ship.id].map(
          (id) => `/workspaces/${harbour.id}/objects/${id}`,
        ),
      );
    }),
  );

  it.effect("shows an object once for each place a tuple holds it in", () =>
    Effect.gen(function* () {
      const client = yield* Given.entel();
      const harbour = yield* Given.workspace(client, "harbour");
      const ship = yield* Given.individual(client, harbour.id, "Ship");
      const anchor = yield* Given.individual(client, harbour.id, "Anchor");
      yield* Given.tuple(client, harbour.id, "Ship watches Ship", [
        ship.id,
        anchor.id,
        ship.id,
      ]);

      const { view } = yield* mount(
        `/workspaces/${harbour.id}/objects/${ship.id}`,
      );

      const places = yield* Effect.promise(() => view.findByTestId("as-place"));
      const items = within(places).getAllByRole("listitem");
      assert.strictEqual(items.length, 2);
      assert.include(items[0]?.textContent ?? "", "place 1");
      assert.include(items[1]?.textContent ?? "", "place 3");
    }),
  );

  it.effect("opens the object in a place when its link is clicked", () =>
    Effect.gen(function* () {
      const client = yield* Given.entel();
      const harbour = yield* Given.workspace(client, "harbour");
      const ship = yield* Given.individual(client, harbour.id, "Ship");
      const anchor = yield* Given.individual(client, harbour.id, "Anchor");
      const hasPart = yield* Given.tuple(
        client,
        harbour.id,
        "Ship has Anchor",
        [ship.id, anchor.id],
      );

      const { view, history } = yield* mount(
        `/workspaces/${harbour.id}/objects/${hasPart.id}`,
      );
      const region = yield* Effect.promise(() =>
        view.findByRole("region", { name: "Places" }),
      );
      fireEvent.click(within(region).getByRole("link", { name: "Anchor" }));

      yield* Effect.promise(() =>
        view.findByRole("heading", { level: 1, name: "Anchor" }),
      );
      assert.strictEqual(
        history.get(),
        `/workspaces/${harbour.id}/objects/${anchor.id}`,
      );
    }),
  );

  it.effect("lists a set's elements in the order entel answers them", () =>
    Effect.gen(function* () {
      const client = yield* Given.entel();
      const harbour = yield* Given.workspace(client, "harbour");
      const ship = yield* Given.individual(client, harbour.id, "Ship");
      const anchor = yield* Given.individual(client, harbour.id, "Anchor");
      const fleet = yield* Given.set(client, harbour.id, "Fleet");
      yield* Given.element(client, harbour.id, fleet.id, ship.id);
      const held = yield* Given.element(
        client,
        harbour.id,
        fleet.id,
        anchor.id,
      );

      const { view } = yield* mount(
        `/workspaces/${harbour.id}/objects/${fleet.id}`,
      );

      yield* Effect.promise(() =>
        view.findByRole("heading", { level: 1, name: "Fleet" }),
      );
      assert.strictEqual(view.getByTestId("kind").textContent, "Set");
      // A set has no places, so the page must not offer a place to look at.
      assert.isNull(view.queryByRole("region", { name: "Places" }));

      const titles = new Map([
        [ship.id, "Ship"],
        [anchor.id, "Anchor"],
      ]);
      const region = view.getByRole("region", { name: "Elements" });
      assert.deepStrictEqual(
        within(region)
          .getAllByRole("link")
          .map((link) => link.textContent),
        held.elements.map((id) => titles.get(id)),
      );
    }),
  );

  it.effect("lists the tuples a tuple set holds", () =>
    Effect.gen(function* () {
      const client = yield* Given.entel();
      const harbour = yield* Given.workspace(client, "harbour");
      const ship = yield* Given.individual(client, harbour.id, "Ship");
      const anchor = yield* Given.individual(client, harbour.id, "Anchor");
      const shipHasAnchor = yield* Given.tuple(
        client,
        harbour.id,
        "Ship has Anchor",
        [ship.id, anchor.id],
      );
      const hasPart = yield* Given.tupleSet(client, harbour.id, "has part");
      yield* Given.element(client, harbour.id, hasPart.id, shipHasAnchor.id);

      const { view } = yield* mount(
        `/workspaces/${harbour.id}/objects/${hasPart.id}`,
      );

      yield* Effect.promise(() =>
        view.findByRole("heading", { level: 1, name: "has part" }),
      );
      assert.strictEqual(view.getByTestId("kind").textContent, "Tuple set");
      const region = view.getByRole("region", { name: "Elements" });
      assert.strictEqual(
        within(region)
          .getByRole("link", { name: "Ship has Anchor" })
          .getAttribute("href"),
        `/workspaces/${harbour.id}/objects/${shipHasAnchor.id}`,
      );
    }),
  );

  it.effect(
    "shows a name given while it was open, first name still first",
    () =>
      Effect.gen(function* () {
        const client = yield* Given.entel();
        const harbour = yield* Given.workspace(client, "harbour");
        const ship = yield* Given.individual(client, harbour.id, "Ship");

        const { view } = yield* mount(
          `/workspaces/${harbour.id}/objects/${ship.id}`,
        );
        yield* Effect.promise(() =>
          view.findByRole("heading", { level: 1, name: "Ship" }),
        );

        const vessel = yield* Given.sign(client, harbour.id, ship.id, "Vessel");

        const signs = yield* Effect.promise(() =>
          view.findByRole("region", { name: "Signs" }),
        );
        yield* Effect.promise(() => within(signs).findByText(vessel.title));
        const listed = within(signs).getAllByRole("listitem");
        assert.strictEqual(listed.length, 2);
        assert.include(listed[0]?.textContent ?? "", "Ship");
        assert.include(listed[1]?.textContent ?? "", "Vessel");
        view.getByRole("heading", { level: 1, name: "Ship" });
      }),
  );

  it.effect("says so when the object in the path is not in the workspace", () =>
    Effect.gen(function* () {
      const client = yield* Given.entel();
      const harbour = yield* Given.workspace(client, "harbour");
      const missing = ObjectId.make("no-such-object");

      const { view } = yield* mount(
        `/workspaces/${harbour.id}/objects/${missing}`,
      );

      yield* Effect.promise(() =>
        view.findByText(`No object with id ${missing} in this workspace.`),
      );
    }),
  );
});
