import { useBrowserRuntime } from "@/context/useBrowserRuntime";
import { Id, System } from "@/schema";
import { TupleT } from "@/services/domain/Tuple";
import { YjsT } from "@/services/external/Yjs";
import { BufferT } from "@/services/ui/Buffer";
import { PropertyT, type LinkedTuple } from "@/services/ui/Property";
import { WindowT } from "@/services/ui/Window";
import { resolveSelectionStrategy } from "@/utils/selectionStrategy";
import { Effect, Match, Option } from "effect";
import { nanoid } from "nanoid";
import { createEffect, createSignal, For, onCleanup, onMount, Show, useContext } from "solid-js";
import Block, { type BlockNavigationContext } from "./Block";
import { ActiveElementContext } from "./EditorBuffer";
import TextEditor, { type EditorAction, type SelectionInfo } from "./TextEditor";

interface PropertySectionProps {
  propertyId: Id.Node;
  pageId: Id.Node;
  bufferId: Id.Buffer;
}

interface GhostBlockProps {
  propertyId: Id.Node;
  pageId: Id.Node;
  /** Called when ghost block is materialized (user typed something) */
  onMaterialize: () => void;
  /** Called to focus the property name (ArrowUp/Left navigation) */
  onFocusPropertyName: () => void;
  /** Request focus on the ghost block (e.g., from ArrowRight in property name) */
  requestFocus?: boolean;
}

/**
 * GhostBlock: A phantom block that shows a TextEditor but doesn't create a
 * LiveStore node until the user actually types something.
 *
 * The key insight is that Y.Text is independent of LiveStore - we can bind
 * TextEditor to a Y.Text with a pre-generated nodeId, then only materialize
 * the actual node when the user types. The typed content is preserved because
 * the real Block will use the same nodeId (same Y.Text!).
 */
function GhostBlock(props: GhostBlockProps) {
  const runtime = useBrowserRuntime();
  const Yjs = runtime.runSync(YjsT);

  // Pre-generate nodeId on component initialization
  // This ID is ephemeral until materialization
  const ghostNodeId = Id.Node.make(nanoid());

  // Get Y.Text for our phantom node (Yjs creates it lazily)
  const ytext = Yjs.getText(ghostNodeId);
  const undoManager = Yjs.getUndoManager(ghostNodeId);

  // Track if we've materialized (to prevent double-trigger)
  let materialized = false;

  // Local focus state
  const [isActive, setIsActive] = createSignal(false);
  const [selection, setSelection] = createSignal<{
    anchor: number;
    head: number;
    goalX: number | null;
    goalLine: "first" | "last" | null;
    assoc: -1 | 0 | 1;
  } | null>(null);

  // Click coordinates for selection strategy
  let clickCoords: { x: number; y: number } | null = null;

  // Materialize: create the real node and tuple in LiveStore
  const materialize = () => {
    if (materialized) return;
    materialized = true;

    runtime.runPromise(
      Effect.gen(function* () {
        const Property = yield* PropertyT;

        // Create linked block using the pre-existing nodeId
        yield* Property.addLinkedBlock(props.propertyId, props.pageId, {
          nodeId: ghostNodeId,
        });

        // Notify parent to reload linked tuples
        props.onMaterialize();
      }),
    );
  };

  // Observe Y.Text for first change → materialize (debounced to allow typing)
  onMount(() => {
    let materializeTimeout: ReturnType<typeof setTimeout> | null = null;

    const observer = () => {
      if (ytext.length > 0 && !materialized) {
        // Debounce materialization to allow rapid typing to complete
        // 50ms is enough for most keyboard input to settle
        if (materializeTimeout) clearTimeout(materializeTimeout);
        materializeTimeout = setTimeout(() => {
          if (!materialized) materialize();
        }, 50);
      }
    };
    ytext.observe(observer);

    onCleanup(() => {
      if (materializeTimeout) clearTimeout(materializeTimeout);
      ytext.unobserve(observer);
      // Clean up orphan Y.Text if never materialized and empty
      if (!materialized && ytext.length === 0) {
        Yjs.deleteText(ghostNodeId);
      }
    });
  });

  // Handle requestFocus prop reactively (e.g., ArrowRight from property name)
  createEffect(() => {
    if (props.requestFocus) {
      setIsActive(true);
      setSelection({ anchor: 0, head: 0, goalX: null, goalLine: null, assoc: 0 });
    }
  });

  const handleFocus = (e: MouseEvent) => {
    clickCoords = { x: e.clientX, y: e.clientY };
    setIsActive(true);
  };

  const handleBlur = () => {
    if (!document.hasFocus()) return;
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

  const handleAction = (action: EditorAction): boolean | void =>
    Match.value(action).pipe(
      Match.tags({
        // Navigation: ArrowUp/Left → property name
        Navigate: ({ direction }) =>
          Match.value(direction).pipe(
            Match.when("up", () => {
              props.onFocusPropertyName();
              return true;
            }),
            Match.when("left", () => {
              props.onFocusPropertyName();
              return true;
            }),
            Match.when("down", () => true), // No-op, nothing below ghost
            Match.when("right", () => true), // No-op at end
            Match.exhaustive,
          ),

        // Tab/ShiftTab: no-op (flat list, no indent)
        Tab: () => true,
        ShiftTab: () => true,

        // Enter: do nothing (only materialize on actual text input)
        Enter: () => true,

        // BackspaceAtStart: navigate to property name
        BackspaceAtStart: () => {
          props.onFocusPropertyName();
          return true;
        },

        // Escape: blur without materializing
        Escape: () => {
          setIsActive(false);
          setSelection(null);
        },

        // Pass through other events
        SelectionChange: ({ selection: sel }) => handleSelectionChange(sel),
        Blur: () => handleBlur(),

        // No-ops for ghost block
        DeleteAtEnd: () => true,
        ForceDelete: () => true,
        VerticalMove: () => true,
        ZoomIn: () => true,
        ZoomOut: () => true,
        BlockSelect: () => true,
        Move: () => true,
        TypeTrigger: () => false,
        PropertyTrigger: () => false,
        TypePickerOpen: () => true,
        TypePickerUpdate: () => true,
        TypePickerClose: () => true,
        Expand: () => true,
        ToggleTodo: () => true,
      }),
      Match.exhaustive,
    );

  const getInitialStrategy = () =>
    resolveSelectionStrategy({
      clickCoords,
      domSelection: null,
      modelSelection: selection(),
    });

  return (
    <div
      data-testid="ghost-block"
      data-element-type="block"
      class="relative"
      onClick={handleFocus}
    >
      <Show
        when={isActive()}
        fallback={
          <span class="text-neutral-400 italic cursor-text">click to add...</span>
        }
      >
        <TextEditor
          ytext={ytext}
          undoManager={undoManager}
          onAction={handleAction}
          initialStrategy={getInitialStrategy()}
          selection={selection()}
        />
      </Show>
    </div>
  );
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

  // Subscribe to activeElement for auto-focus
  const getActiveElement = useContext(ActiveElementContext);

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

  // Linked tuples (tuple instances for property relationships)
  const [linkedTuples, setLinkedTuples] = createSignal<readonly LinkedTuple[]>(
    [],
  );

  // Track if property is bound (for ghost block display)
  const [isBound, setIsBound] = createSignal(false);

  // Signal to request focus on ghost block (for ArrowRight navigation)
  const [ghostFocusRequested, setGhostFocusRequested] = createSignal(false);

  // Create property block ID for a linked tuple
  const makePropertyBlockId = (tupleId: Id.Tuple) =>
    Id.makePropertyBlockId(
      props.bufferId,
      props.pageId,
      props.propertyId,
      tupleId,
    );

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

  // Load linked tuples and check if property is bound
  const loadLinkedTuples = () =>
    runtime.runPromise(
      Effect.gen(function* () {
        const Property = yield* PropertyT;

        // Check if bound
        const bound = yield* checkIsBound();
        setIsBound(bound);

        // Get linked tuples
        const tuples = yield* Property.getLinkedTuples(
          props.propertyId,
          props.pageId,
        );
        setLinkedTuples(tuples);
      }),
    );

  // Helper to find index of linked tuple by its block ID
  const findLinkedTupleIndex = (blockId: Id.Block): number => {
    const tuples = linkedTuples();
    // Extract tupleId from property block ID format:
    // buffer:{bufferId}/node:{hostNodeId}/property:{propertyId}/tuple:{tupleId}
    const tupleSegment = "/tuple:";
    const tupleIndex = blockId.indexOf(tupleSegment);
    if (tupleIndex === -1) return -1;
    const tupleId = blockId.slice(tupleIndex + tupleSegment.length) as Id.Tuple;
    return tuples.findIndex((t) => t.tupleId === tupleId);
  };

  // Focus a linked tuple by index
  const focusLinkedTuple = (index: number) => {
    const tuples = linkedTuples();
    const tuple = tuples[index];
    if (!tuple) return;
    const blockId = makePropertyBlockId(tuple.tupleId);
    runtime.runPromise(
      Effect.gen(function* () {
        const Buffer = yield* BufferT;
        const Window = yield* WindowT;
        // Focus the block
        yield* Window.setActiveElement(
          Option.some({ type: "block" as const, id: blockId }),
        );
        // Set selection at start of block
        yield* Buffer.setSelection(
          props.bufferId,
          Option.some({
            anchor: { elementId: blockId },
            anchorOffset: 0,
            focus: { elementId: blockId },
            focusOffset: 0,
            goalX: null,
            goalLine: null,
            assoc: 0,
          }),
        );
      }),
    );
  };

  // Focus the property name
  const focusPropertyName = () => {
    setIsActive(true);
    // Set selection at end of property name
    const textLength = getYtext().length;
    setSelection({
      anchor: textLength,
      head: textLength,
      goalX: null,
      goalLine: null,
      assoc: 0,
    });
  };

  // Auto-focus when activeElement matches this property
  createEffect(() => {
    const activeEl = getActiveElement();
    if (
      activeEl?.type === "property" &&
      activeEl.propertyId === props.propertyId &&
      activeEl.bufferId === props.bufferId
    ) {
      focusPropertyName();
    }
  });

  // Create a new linked block after the current one
  const createNewLinkedBlock = (_afterIndex: number) => {
    runtime.runPromise(
      Effect.gen(function* () {
        const Property = yield* PropertyT;

        // Create new linked block
        const newNodeId = yield* Property.addLinkedBlock(
          props.propertyId,
          props.pageId,
        );

        // Reload linked tuples
        yield* Effect.sync(() => loadLinkedTuples());

        // Wait for DOM update, then focus the new block
        yield* Effect.promise(
          () => new Promise((r) => requestAnimationFrame(() => setTimeout(r, 0))),
        );

        // Find and focus the new tuple by its displayNodeId
        const newIndex = linkedTuples().findIndex(
          (t) => t.displayNodeId === newNodeId,
        );
        if (newIndex !== -1) {
          focusLinkedTuple(newIndex);
        }
      }),
    );
  };

  // Action handler for linked blocks - intercepts tree operations
  const linkedBlockActionHandler = (
    action: EditorAction,
    context: BlockNavigationContext,
  ): boolean => {
    const currentIndex = findLinkedTupleIndex(context.blockId);
    const tuples = linkedTuples();

    return Match.value(action).pipe(
      Match.tags({
        Tab: () => true, // No indent in linked blocks (flat list)
        ShiftTab: () => true, // No outdent in linked blocks

        Navigate: ({ direction }) =>
          Match.value(direction).pipe(
            Match.when("up", () => {
              if (currentIndex === 0) {
                // First block - navigate to property name
                focusPropertyName();
              } else if (currentIndex > 0) {
                // Navigate to previous linked block
                focusLinkedTuple(currentIndex - 1);
              }
              return true;
            }),
            Match.when("down", () => {
              if (currentIndex < tuples.length - 1) {
                // Navigate to next linked block
                focusLinkedTuple(currentIndex + 1);
              }
              // At last block - no-op
              return true;
            }),
            Match.when("left", () => {
              // Navigate to property name (at start of first)
              focusPropertyName();
              return true;
            }),
            Match.when("right", () => {
              if (currentIndex < tuples.length - 1) {
                // Navigate to next linked block
                focusLinkedTuple(currentIndex + 1);
              }
              // At last block - no-op
              return true;
            }),
            Match.exhaustive,
          ),

        Enter: () => {
          // Create new linked block after current one
          createNewLinkedBlock(currentIndex);
          return true;
        },

        BackspaceAtStart: () => {
          // Navigate to previous block or property name (don't merge)
          if (currentIndex === 0) {
            focusPropertyName();
          } else if (currentIndex > 0) {
            focusLinkedTuple(currentIndex - 1);
          }
          return true;
        },

        DeleteAtEnd: () => true, // Don't merge linked blocks
      }),
      Match.orElse(() => false), // Let Block handle everything else
    );
  };

  onMount(() => {
    // Observe Y.Text changes for property name
    const ytext = getYtext();
    const observer = () => setPropertyName(ytext.toString());
    ytext.observe(observer);

    // Load linked tuples
    loadLinkedTuples();

    onCleanup(() => {
      ytext.unobserve(observer);
    });
  });

  let clickCoords: { x: number; y: number } | null = null;

  const handleFocus = (e: MouseEvent) => {
    clickCoords = { x: e.clientX, y: e.clientY };
    setIsActive(true);
    runtime.runPromise(
      Effect.gen(function* () {
        const Window = yield* WindowT;
        yield* Window.setActiveElement(
          Option.some({
            type: "property" as const,
            propertyId: props.propertyId,
            bufferId: props.bufferId,
          }),
        );
      }),
    );
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
        const bound = yield* checkIsBound();

        if (bound) {
          // Already bound - navigate to linked blocks or ghost
          const tuples = linkedTuples();
          if (tuples.length > 0) {
            // Focus first linked block
            yield* Effect.sync(() => focusLinkedTuple(0));
          } else {
            // No linked blocks - focus ghost block (don't create yet!)
            yield* Effect.sync(() => setGhostFocusRequested(true));
          }
          return;
        }

        // Unbound + at end → trigger quick-create (binds property, shows ghost)
        const Property = yield* PropertyT;
        const tupleTypeId = yield* Property.quickCreateTupleType(
          props.propertyId,
          props.pageId,
        );

        // Reload linked tuples (will set isBound=true, linkedTuples=[])
        yield* Effect.sync(() => loadLinkedTuples());

        // Wait for DOM update, then focus the ghost block
        yield* Effect.promise(
          () => new Promise((r) => requestAnimationFrame(() => setTimeout(r, 0))),
        );

        // Focus ghost block (user types to create first linked block)
        yield* Effect.sync(() => setGhostFocusRequested(true));

        yield* Effect.logDebug(
          "[PropertySection] Quick-created tuple type, ghost block ready",
        ).pipe(
          Effect.annotateLogs({
            propertyId: props.propertyId,
            tupleTypeId,
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
      <div data-testid="linked-blocks" class="flex flex-col gap-1 flex-1">
        <Show
          when={linkedTuples().length > 0}
          fallback={
            <Show
              when={isBound()}
              fallback={
                <span class="text-neutral-400 italic">no linked items</span>
              }
            >
              {/* Ghost block: editable placeholder when bound but empty */}
              <GhostBlock
                propertyId={props.propertyId}
                pageId={props.pageId}
                onMaterialize={() => {
                  // Just reload tuples - the real Block will auto-focus via its subscription
                  loadLinkedTuples();
                  setGhostFocusRequested(false);
                }}
                onFocusPropertyName={focusPropertyName}
                requestFocus={ghostFocusRequested()}
              />
            </Show>
          }
        >
          <For each={linkedTuples()}>
            {(tuple) => (
              <Block
                blockId={makePropertyBlockId(tuple.tupleId)}
                nodeId={tuple.displayNodeId}
                onAction={linkedBlockActionHandler}
              />
            )}
          </For>
        </Show>
      </div>
    </div>
  );
}
