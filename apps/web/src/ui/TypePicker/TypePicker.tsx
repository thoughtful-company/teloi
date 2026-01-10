import { useBrowserRuntime } from "@/context/useBrowserRuntime";
import { Id } from "@/schema";
import {
  AvailableType,
  TypePickerT,
} from "@/services/ui/TypePicker";
import { Effect } from "effect";
import {
  createEffect,
  createSignal,
  For,
  onCleanup,
  onMount,
  Show,
} from "solid-js";
import { Portal } from "solid-js/web";

export interface TypePickerProps {
  /** Position in viewport coordinates */
  position: { x: number; y: number };
  /** Current search query (text after "#") */
  query: string;
  /** Node to apply type to */
  nodeId: Id.Node;
  /** Called when a type is selected */
  onSelect: (typeId: Id.Node) => void;
  /** Called when "Create #xyz" is selected */
  onCreate: (name: string) => void;
  /** Called when picker should close */
  onClose: () => void;
}

export default function TypePicker(props: TypePickerProps) {
  const runtime = useBrowserRuntime();
  let containerRef: HTMLDivElement | undefined;

  const [types, setTypes] = createSignal<readonly AvailableType[]>([]);
  const [filteredTypes, setFilteredTypes] = createSignal<
    readonly AvailableType[]
  >([]);
  const [selectedIndex, setSelectedIndex] = createSignal(0);

  onMount(() => {
    runtime.runPromise(
      Effect.gen(function* () {
        const TypePicker = yield* TypePickerT;
        const available = yield* TypePicker.getAvailableTypes();
        setTypes(available);
      }),
    );
  });

  createEffect(() => {
    const available = types();
    const query = props.query;

    runtime.runSync(
      Effect.gen(function* () {
        const TypePicker = yield* TypePickerT;
        const filtered = TypePicker.filterTypes(available, query);
        setFilteredTypes(filtered);
        // Reset selection to first item when filter changes
        setSelectedIndex(0);
      }),
    );
  });

  // Check if there's an exact match for "Create" option
  const hasExactMatch = () => {
    const query = props.query.toLowerCase();
    if (!query) return true; // Don't show create when no query
    return filteredTypes().some((t) => t.name.toLowerCase() === query);
  };

  // Total items including "Create" option
  const totalItems = () =>
    filteredTypes().length + (hasExactMatch() ? 0 : 1);

  // Handle keyboard navigation
  const handleKeyDown = (e: KeyboardEvent) => {
    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        e.stopPropagation();
        setSelectedIndex((i) => Math.min(i + 1, totalItems() - 1));
        break;
      case "ArrowUp":
        e.preventDefault();
        e.stopPropagation();
        setSelectedIndex((i) => Math.max(i - 1, 0));
        break;
      case "Enter":
        e.preventDefault();
        e.stopPropagation();
        selectCurrentItem();
        break;
      case "Escape":
        e.preventDefault();
        e.stopPropagation();
        props.onClose();
        break;
    }
  };

  const selectCurrentItem = () => {
    const index = selectedIndex();
    const filtered = filteredTypes();

    if (index < filtered.length) {
      // Selected an existing type
      const type = filtered[index];
      if (type) {
        props.onSelect(type.id);
      }
    } else {
      // Selected "Create" option
      props.onCreate(props.query);
    }
  };

  // Click outside detection
  const handleClickOutside = (e: MouseEvent) => {
    if (containerRef && !containerRef.contains(e.target as Node)) {
      props.onClose();
    }
  };

  onMount(() => {
    // Use capture phase so we can intercept before CodeMirror
    document.addEventListener("keydown", handleKeyDown, true);
    document.addEventListener("mousedown", handleClickOutside);
  });

  onCleanup(() => {
    document.removeEventListener("keydown", handleKeyDown, true);
    document.removeEventListener("mousedown", handleClickOutside);
  });

  return (
    <Portal>
      <div
        ref={containerRef}
        data-testid="type-picker"
        class="fixed z-50 min-w-48 max-h-64 overflow-y-auto bg-sidebar/95 backdrop-blur-md border border-sidebar-border rounded-lg shadow-daiichi"
        style={{
          left: `${props.position.x}px`,
          top: `${props.position.y}px`,
        }}
      >
        <div class="py-1">
          <Show when={filteredTypes().length === 0 && !props.query}>
            <div class="px-3 py-2 text-sm text-sidebar-foreground/60">
              No types yet. Type a name to create one.
            </div>
          </Show>

          <For each={filteredTypes()}>
            {(type, index) => (
              <button
                type="button"
                class={`w-full flex items-center gap-2 px-3 py-1.5 text-sm text-left text-sidebar-foreground ${
                  index() === selectedIndex()
                    ? "bg-sidebar-accent"
                    : "hover:bg-sidebar-accent"
                }`}
                onClick={() => props.onSelect(type.id)}
                onMouseEnter={() => setSelectedIndex(index())}
              >
                <span class="w-4 h-4 flex items-center justify-center opacity-60">
                  <svg
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="2"
                    class="w-4 h-4"
                  >
                    <path d="M20.59 13.41l-7.17 7.17a2 2 0 01-2.83 0L2 12V2h10l8.59 8.59a2 2 0 010 2.82z" />
                    <line x1="7" y1="7" x2="7.01" y2="7" />
                  </svg>
                </span>
                <span class="truncate">{type.name}</span>
              </button>
            )}
          </For>

          <Show when={!hasExactMatch() && props.query}>
            <button
              type="button"
              class={`w-full flex items-center gap-2 px-3 py-1.5 text-sm text-left text-sidebar-foreground ${
                selectedIndex() === filteredTypes().length
                  ? "bg-sidebar-accent"
                  : "hover:bg-sidebar-accent"
              }`}
              onClick={() => props.onCreate(props.query)}
              onMouseEnter={() => setSelectedIndex(filteredTypes().length)}
            >
              <span class="w-4 h-4 flex items-center justify-center opacity-60">
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2"
                  class="w-4 h-4"
                >
                  <line x1="12" y1="5" x2="12" y2="19" />
                  <line x1="5" y1="12" x2="19" y2="12" />
                </svg>
              </span>
              <span>
                Create <span class="font-medium">#{props.query}</span>
              </span>
            </button>
          </Show>
        </div>
      </div>
    </Portal>
  );
}
