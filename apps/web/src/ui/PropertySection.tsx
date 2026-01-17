import { useBrowserRuntime } from "@/context/useBrowserRuntime";
import { Id, System } from "@/schema";
import { TupleT } from "@/services/domain/Tuple";
import { YjsT } from "@/services/external/Yjs";
import { PropertyT } from "@/services/ui/Property";
import { resolveSelectionStrategy } from "@/utils/selectionStrategy";
import { Effect, Match } from "effect";
import { createSignal, For, onCleanup, onMount, Show } from "solid-js";
import TextEditor, { type EditorAction, type SelectionInfo } from "./TextEditor";

interface PropertySectionProps {
  propertyId: Id.Node;
  pageId: Id.Node;
}

/**
 * PropertySection displays an editable property with its name and linked blocks.
 *
 * Features:
 * - Property name is editable (using TextEditor when focused)
 * - ArrowRight at end of unbound property triggers quick-create flow:
 *   - Creates tuple type, position nodes, and initial linked block
 *   - Focuses the new linked block
 * - Linked blocks displayed on the right side
 */
export default function PropertySection(props: PropertySectionProps) {
  const runtime = useBrowserRuntime();
  const Yjs = runtime.runSync(YjsT);

  // Property name from Y.Text
  const getYtext = () => Yjs.getText(props.propertyId);
  const getUndoManager = () => Yjs.getUndoManager(props.propertyId);
  const [propertyName, setPropertyName] = createSignal(getYtext().toString());

  // Local focus state for property name
  const [isActive, setIsActive] = createSignal(false);

  // Selection state for TextEditor
  const [selection, setSelection] = createSignal<{
    anchor: number;
    head: number;
    goalX: number | null;
    goalLine: "first" | "last" | null;
    assoc: -1 | 0 | 1;
  } | null>(null);

  // Linked blocks
  const [linkedBlocks, setLinkedBlocks] = createSignal<
    Array<{ id: Id.Node; title: string }>
  >([]);

  // Check if property is bound to a tuple type
  const checkIsBound = () =>
    Effect.gen(function* () {
      const Tuple = yield* TupleT;
      const usesTupleTuples = yield* Tuple.findByPosition(
        System.PROPERTY_USES_TUPLE,
        0,
        props.propertyId,
      );
      return usesTupleTuples.length > 0;
    });

  // Load linked blocks
  const loadLinkedBlocks = () =>
    runtime.runPromise(
      Effect.gen(function* () {
        const Property = yield* PropertyT;
        const blockIds = yield* Property.getLinkedBlocks(
          props.propertyId,
          props.pageId,
        );

        // Get titles for each linked block
        const blocks = blockIds.map((id) => ({
          id,
          title: Yjs.getText(id).toString(),
        }));
        setLinkedBlocks(blocks);
      }),
    );

  onMount(() => {
    // Observe Y.Text changes for property name
    const ytext = getYtext();
    const observer = () => setPropertyName(ytext.toString());
    ytext.observe(observer);

    // Load linked blocks
    loadLinkedBlocks();

    onCleanup(() => {
      ytext.unobserve(observer);
    });
  });

  let clickCoords: { x: number; y: number } | null = null;

  const handleFocus = (e: MouseEvent) => {
    clickCoords = { x: e.clientX, y: e.clientY };
    setIsActive(true);
  };

  const handleBlur = () => {
    // Don't clear when window loses focus (alt-tab, tab switch)
    if (!document.hasFocus()) {
      return;
    }
    setIsActive(false);
    setSelection(null);
  };

  const handleSelectionChange = (sel: SelectionInfo) => {
    setSelection({
      anchor: sel.anchor,
      head: sel.head,
      goalX: null,
      goalLine: null,
      assoc: 0,
    });
  };

  const handleArrowRightAtEnd = () => {
    runtime.runPromise(
      Effect.gen(function* () {
        // Check if property is already bound
        const isBound = yield* checkIsBound();
        if (isBound) {
          // Already bound - just navigate to linked blocks or do nothing
          // (standard navigation - could focus first linked block if exists)
          return;
        }

        // Unbound + at end → trigger quick-create
        const Property = yield* PropertyT;
        const newLinkedBlockId = yield* Property.quickCreateTupleType(
          props.propertyId,
          props.pageId,
        );

        // Reload linked blocks
        yield* Effect.sync(() => loadLinkedBlocks());

        // Focus the new linked block (if we have a way to do that)
        // For now, just reload - focus handling TBD
        yield* Effect.logDebug(
          "[PropertySection] Quick-created tuple type and linked block",
        ).pipe(
          Effect.annotateLogs({
            propertyId: props.propertyId,
            newLinkedBlockId,
          }),
        );
      }),
    );
  };

  const handleAction = (action: EditorAction): boolean | void =>
    Match.value(action).pipe(
      Match.tags({
        Navigate: ({ direction }) =>
          Match.value(direction).pipe(
            Match.when("right", () => {
              handleArrowRightAtEnd();
              return true; // Prevent default navigation
            }),
            Match.orElse(() => undefined),
          ),
        SelectionChange: ({ selection: sel }) => handleSelectionChange(sel),
        Blur: () => handleBlur(),
        Escape: () => {
          setIsActive(false);
          setSelection(null);
        },
        // Handle other actions as needed
        Enter: () => {
          // Enter could navigate to linked blocks area
        },
        Tab: () => {},
        ShiftTab: () => {},
        BackspaceAtStart: () => {},
        DeleteAtEnd: () => {},
        ForceDelete: () => {},
        VerticalMove: () => {},
        ZoomIn: () => {},
        ZoomOut: () => {},
        BlockSelect: () => {},
        Move: () => {},
        TypeTrigger: () => false,
        PropertyTrigger: () => false,
        TypePickerOpen: () => {},
        TypePickerUpdate: () => {},
        TypePickerClose: () => {},
        Expand: () => {},
        ToggleTodo: () => {},
      }),
      Match.exhaustive,
    );

  // Resolve initial selection strategy when clicking
  const getInitialStrategy = () =>
    resolveSelectionStrategy({
      clickCoords,
      domSelection: null,
      modelSelection: selection(),
    });

  return (
    <div
      data-testid="property-section"
      class="flex items-stretch gap-3 py-1.5 text-sm"
    >
      {/* Left side: Property name */}
      <div class="flex items-center gap-2 min-w-[120px]">
        <span class="text-neutral-400 select-none">›</span>
        <div class="property-name flex-1" onClick={handleFocus}>
          <Show
            when={isActive()}
            fallback={
              <span class="font-medium text-neutral-700 cursor-text">
                {propertyName() || (
                  <span class="text-neutral-400 italic">untitled</span>
                )}
              </span>
            }
          >
            <TextEditor
              ytext={getYtext()}
              undoManager={getUndoManager()}
              onAction={handleAction}
              initialStrategy={getInitialStrategy()}
              selection={selection()}
            />
          </Show>
        </div>
      </div>

      {/* Divider */}
      <div class="w-px bg-neutral-200 self-stretch" />

      {/* Right side: Linked blocks */}
      <div data-testid="linked-blocks" class="flex items-center gap-2 flex-1">
        <Show
          when={linkedBlocks().length > 0}
          fallback={
            <span class="text-neutral-400 italic">no linked items</span>
          }
        >
          <For each={linkedBlocks()}>
            {(block) => (
              <span class="px-2 py-0.5 bg-neutral-100 rounded text-neutral-600">
                {block.title || "untitled"}
              </span>
            )}
          </For>
        </Show>
      </div>
    </div>
  );
}
