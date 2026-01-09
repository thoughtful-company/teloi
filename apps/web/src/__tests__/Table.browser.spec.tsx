import "@/index.css";
import { describe, it } from "@effect/vitest";
import { Schedule, Stream } from "effect";
import { render, screen, waitFor } from "solid-testing-library";
import { expect } from "vitest";

import { Table } from "@/Table";

describe("Table", () => {
  it("should display table with 3 elements added asynchronously", async () => {
    const rows = [
      { name: "Concentration" },
      { name: "Clarity" },
      { name: "Equanimity" },
    ];

    const stream = Stream.make(...rows).pipe(
      Stream.schedule(Schedule.spaced("50 millis")),
      Stream.scan({ rows: [] as Array<{ name: string }> }, (acc, hero) => ({
        rows: [...acc.rows, hero],
      })),
    );

    render(() => <Table dataStream={stream} />);

    await waitFor(
      () => {
        expect(screen.getByText("Concentration")).toBeTruthy();
      },
      { timeout: 1000 },
    );

    await waitFor(
      () => {
        expect(screen.getByText("Clarity")).toBeTruthy();
      },
      { timeout: 1000 },
    );

    await waitFor(
      () => {
        expect(screen.getByText("Equanimity")).toBeTruthy();
      },
      { timeout: 1000 },
    );
  });
});
