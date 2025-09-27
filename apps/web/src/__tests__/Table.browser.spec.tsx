import { describe, it } from "@effect/vitest";
import { render } from "solid-testing-library";

import { createSignal } from "solid-js";

describe("Table", () => {
  it("should display table with 3 elements", () => {
    // there is a list with 3 nodes that only have names
    //’there is a column that is called name
    // all three nodes should have their titles in this column

    // Given a table/database has no elements
    // When new elements are added to database
    // Then new elements are displayed in the table

    interface Datum {
      name: string;
    }

    const [data, setData] = createSignal<Datum[]>([]);
    render(() => <div>hi</div>);
  });
});
