import { tables } from "@/livestore/schema";
import { useBrowserRuntime } from "@/context/useBrowserRuntime";
import { Id } from "@/schema";
import { StoreT } from "@/services/external/Store";
import { YjsT } from "@/services/external/Yjs";
import { Effect } from "effect";
import {
  ColumnDef,
  createSolidTable,
  flexRender,
  getCoreRowModel,
} from "@tanstack/solid-table";
import { createSignal, For, onMount } from "solid-js";

interface TableViewProps {
  bufferId: Id.Buffer;
  nodeId: Id.Node;
  childNodeIds: readonly Id.Node[];
}

interface RowData {
  nodeId: Id.Node;
  title: string;
  // Dynamic property columns: tupleTypeId -> value text
  properties: Record<string, string>;
}

interface TupleTypeInfo {
  id: Id.Node;
  name: string;
}

/**
 * Renders a node's children as a table.
 * - Title column: text content of each child
 * - Property columns: derived from 2-member tuples where child is at position 0
 */
export default function TableView(props: TableViewProps) {
  const runtime = useBrowserRuntime();
  const [data, setData] = createSignal<RowData[]>([]);
  const [columns, setColumns] = createSignal<ColumnDef<RowData, unknown>[]>([]);

  onMount(() => {
    const childNodeIds = props.childNodeIds;

    const loadData = Effect.gen(function* () {
      const Store = yield* StoreT;
      const Yjs = yield* YjsT;

      const tupleTypeMap = new Map<string, TupleTypeInfo>();
      const childTuples = new Map<string, Map<string, string>>();

      for (const childId of childNodeIds) {
        // Find all tuple members where this child is at position 0
        const members = yield* Store.query(
          tables.tupleMembers.select().where({ position: 0, nodeId: childId }),
        );

        for (const member of members) {
          // Get the tuple to find its type
          const tuple = yield* Store.query(
            tables.tuples
              .select()
              .where({ id: member.tupleId })
              .first({ fallback: () => null }),
          );

          if (tuple) {
            // Only process 2-member tuples
            const allMembers = yield* Store.query(
              tables.tupleMembers
                .select()
                .where({ tupleId: tuple.id })
                .orderBy("position", "asc"),
            );

            if (allMembers.length === 2) {
              const tupleTypeId = tuple.tupleTypeId;
              const valueNodeId = allMembers[1]!.nodeId as Id.Node;

              // Register tuple type if not seen
              if (!tupleTypeMap.has(tupleTypeId)) {
                const typeName = Yjs.getText(tupleTypeId as Id.Node).toString();
                tupleTypeMap.set(tupleTypeId, {
                  id: tupleTypeId as Id.Node,
                  name: typeName || tupleTypeId,
                });
              }

              // Get value text
              const valueText = Yjs.getText(valueNodeId).toString();

              // Store in childTuples map
              if (!childTuples.has(childId)) {
                childTuples.set(childId, new Map());
              }
              childTuples.get(childId)!.set(tupleTypeId, valueText);
            }
          }
        }
      }

      const rows: RowData[] = childNodeIds.map((childId) => {
        const properties: Record<string, string> = {};
        const childProps = childTuples.get(childId);
        if (childProps) {
          for (const [tupleTypeId, valueText] of childProps) {
            properties[tupleTypeId] = valueText;
          }
        }

        return {
          nodeId: childId,
          title: Yjs.getText(childId).toString(),
          properties,
        };
      });

      const titleColumn: ColumnDef<RowData, unknown> = {
        id: "title",
        accessorKey: "title",
        header: "Title",
        cell: (info) => info.getValue() as string,
      };

      const propertyColumns: ColumnDef<RowData, unknown>[] = Array.from(
        tupleTypeMap.values(),
      ).map((tupleType) => ({
        id: tupleType.id,
        accessorFn: (row: RowData) => row.properties[tupleType.id] ?? "",
        header: tupleType.name,
        cell: (info) => info.getValue() as string,
      }));

      setColumns([titleColumn, ...propertyColumns]);
      setData(rows);
    });

    runtime.runPromise(loadData);
  });

  const table = createSolidTable({
    get data() {
      return data();
    },
    get columns() {
      return columns();
    },
    getCoreRowModel: getCoreRowModel(),
  });

  return (
    <div class="mx-auto max-w-[var(--max-line-width)] w-full">
      <table class="w-full border-collapse">
        <thead>
          <For each={table.getHeaderGroups()}>
            {(headerGroup) => (
              <tr>
                <For each={headerGroup.headers}>
                  {(header) => (
                    <th class="text-left p-2 border-b border-foreground-lighter font-medium">
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
              <tr class="hover:bg-foreground-lighter/10">
                <For each={row.getVisibleCells()}>
                  {(cell) => (
                    <td class="p-2 border-b border-foreground-lighter/50">
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
    </div>
  );
}
