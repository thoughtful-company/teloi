import {
  ColumnDef,
  createSolidTable,
  flexRender,
  getCoreRowModel,
} from "@tanstack/solid-table";
import { Stream } from "effect";
import { Component, For, onCleanup, onMount } from "solid-js";
import { runtime } from "./runtime";
import { bindStreamToStore } from "./utils/bindStreamToStore";

type Datum = {
  name: string;
};

type TableData = {
  rows: Datum[];
};

const defaultColumns: ColumnDef<Datum>[] = [
  {
    accessorKey: "name",
    cell: (info) => info.getValue(),
    footer: (info) => info.column.id,
  },
];

export const Table: Component<{
  dataStream: Stream.Stream<TableData>;
}> = ({ dataStream }) => {
  const { store: data, start } = bindStreamToStore({
    stream: dataStream,
    project: (x) => ({
      rows: x.rows,
    }),
    initial: {
      rows: [],
    },
    log: (msg) => console.debug(msg),
  });

  let dispose: (() => void) | null = null;

  onMount(() => {
    dispose = start(runtime);
  });

  onCleanup(() => {
    if (dispose) dispose();
  });

  const table = createSolidTable({
    get data() {
      return [...data.rows];
    },
    columns: defaultColumns,
    getCoreRowModel: getCoreRowModel(),
  });

  return (
    <div class="p-2">
      <table>
        <thead>
          <For each={table.getHeaderGroups()}>
            {(headerGroup) => (
              <tr>
                <For each={headerGroup.headers}>
                  {(header) => (
                    <th>
                      {header.isPlaceholder
                        ? null
                        : flexRender(
                            header.column.columnDef.header,
                            header.getContext(),
                          )}
                    </th>
                  )}
                </For>
              </tr>
            )}
          </For>
        </thead>
        <tbody>
          <For each={table.getRowModel().rows}>
            {(row) => (
              <tr>
                <For each={row.getVisibleCells()}>
                  {(cell) => (
                    <td>
                      {flexRender(
                        cell.column.columnDef.cell,
                        cell.getContext(),
                      )}
                    </td>
                  )}
                </For>
              </tr>
            )}
          </For>
        </tbody>
      </table>
      <div class="h-4" />
    </div>
  );
};
