import { useBrowserRuntime } from "@/context/useBrowserRuntime";
import { Id, Model } from "@/schema";
import { FrameT } from "@/services/ui/Frame";
import { AvailableType, TypePickerT } from "@/services/ui/TypePicker";
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

export interface BlockTypePickerProps {
  frameId: Id.Frame;
  popup: Model.FramePopup & { type: "typePicker" };
}

export default function BlockTypePicker(props: BlockTypePickerProps) {
  const runtime = useBrowserRuntime();
  let inputRef!: HTMLInputElement;

  const [types, setTypes] = createSignal<readonly AvailableType[]>([]);
  const [filteredTypes, setFilteredTypes] = createSignal<
    readonly AvailableType[]
  >([]);
  const [selectedIndex, setSelectedIndex] = createSignal(0);
  const [query, setQuery] = createSignal(props.popup.query);

  onMount(() => {
    runtime.runPromise(
      Effect.gen(function* () {
        const TypePicker = yield* TypePickerT;
        const available = yield* TypePicker.getAvailableTypes();
        setTypes(available);
      }),
    );
    inputRef.focus();
  });

  // Filter types when query or types change
  createEffect(() => {
    const available = types();
    const q = query();
    const TypePicker = runtime.runSync(TypePickerT);
    const filtered = TypePicker.filterTypes(available, q);
    setFilteredTypes(filtered);
    setSelectedIndex(0);
  });

  // "Create and apply" is visible when query is non-empty
  const showCreate = () => query().length > 0;

  // Total items including optional "Create" option at the end
  const totalItems = () => filteredTypes().length + (showCreate() ? 1 : 0);

  // Index of the "Create and apply" option (last item)
  const createIndex = () => filteredTypes().length;

  const focusFrameContainer = () => {
    const container = document.querySelector(
      `[data-frame-id="${props.frameId}"]`,
    );
    if (container instanceof HTMLElement) {
      container.focus();
    }
  };

  const close = () => {
    void runtime
      .runPromise(
        Effect.gen(function* () {
          const Frame = yield* FrameT;
          yield* Frame.closePopup(props.frameId);
        }),
      )
      .finally(focusFrameContainer);
  };

  const getSelectedBlocks = () =>
    runtime.runSync(
      Effect.gen(function* () {
        const Frame = yield* FrameT;
        const state = yield* Frame.getKhoraSelectionState(props.frameId);
        return state.selectedKhoras;
      }),
    );

  const applyTypeToAllSelected = (typeId: Id.Node) => {
    const blocks = getSelectedBlocks();
    void runtime
      .runPromise(
        Effect.gen(function* () {
          const TypePicker = yield* TypePickerT;
          const Frame = yield* FrameT;
          for (const nodeId of blocks) {
            yield* TypePicker.applyType(nodeId, typeId);
          }
          yield* Frame.closePopup(props.frameId);
        }),
      )
      .finally(focusFrameContainer);
  };

  const createAndApply = () => {
    const q = query();
    if (!q) return;
    const blocks = getSelectedBlocks();
    void runtime
      .runPromise(
        Effect.gen(function* () {
          const TypePicker = yield* TypePickerT;
          const Frame = yield* FrameT;
          const typeId = yield* TypePicker.createType(q);
          for (const nodeId of blocks) {
            yield* TypePicker.applyType(nodeId, typeId);
          }
          yield* Frame.closePopup(props.frameId);
        }),
      )
      .finally(focusFrameContainer);
  };

  const selectCurrentItem = () => {
    const index = selectedIndex();
    const filtered = filteredTypes();

    if (showCreate() && index === createIndex()) {
      createAndApply();
    } else {
      const type = filtered[index];
      if (type) applyTypeToAllSelected(type.id);
    }
  };

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
        close();
        break;
      default:
        // Stop propagation of all keys to prevent block selection handlers
        e.stopPropagation();
    }
  };

  const handleInput = (e: Event) => {
    const value = (e.target as HTMLInputElement).value;
    setQuery(value);
  };

  // Click outside detection
  let containerRef!: HTMLDivElement;
  const handleClickOutside = (e: MouseEvent) => {
    if (!containerRef.contains(e.target as Node)) {
      close();
    }
  };

  onMount(() => {
    document.addEventListener("mousedown", handleClickOutside);
  });

  onCleanup(() => {
    document.removeEventListener("mousedown", handleClickOutside);
  });

  return (
    <Portal>
      <div
        ref={containerRef}
        data-testid="block-type-picker"
        class="fixed z-50 min-w-48 max-h-80 overflow-y-auto bg-sidebar/95 backdrop-blur-md border border-sidebar-border rounded-lg shadow-daiichi"
        style={{
          top: "50%",
          left: "50%",
          transform: "translate(-50%, -50%)",
        }}
      >
        <div class="p-2">
          <input
            ref={inputRef}
            data-testid="block-type-picker-input"
            type="text"
            class="w-full px-2 py-1.5 text-sm bg-transparent border border-sidebar-border rounded outline-none focus:border-sidebar-accent text-sidebar-foreground placeholder:text-sidebar-foreground/40"
            placeholder="Type to filter..."
            value={query()}
            onInput={handleInput}
            onKeyDown={handleKeyDown}
          />
        </div>
        <div class="py-1 max-h-60 overflow-y-auto">
          <For each={filteredTypes()}>
            {(type, index) => (
              <button
                type="button"
                class={`w-full flex items-center gap-2 px-3 py-1.5 text-sm text-left text-sidebar-foreground ${
                  index() === selectedIndex()
                    ? "bg-sidebar-accent"
                    : "hover:bg-sidebar-accent"
                }`}
                onClick={() => applyTypeToAllSelected(type.id)}
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

          <Show when={showCreate()}>
            <button
              type="button"
              data-testid="block-type-picker-create"
              class={`w-full flex items-center gap-2 px-3 py-1.5 text-sm text-left text-sidebar-foreground ${
                selectedIndex() === createIndex()
                  ? "bg-sidebar-accent"
                  : "hover:bg-sidebar-accent"
              }`}
              onClick={createAndApply}
              onMouseEnter={() => setSelectedIndex(createIndex())}
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
                Create and apply <span class="font-medium">#{query()}</span>
              </span>
            </button>
          </Show>

          <Show when={filteredTypes().length === 0 && !query()}>
            <div class="px-3 py-2 text-sm text-sidebar-foreground/60">
              No types yet. Type a name to create one.
            </div>
          </Show>
        </div>
      </div>
    </Portal>
  );
}
