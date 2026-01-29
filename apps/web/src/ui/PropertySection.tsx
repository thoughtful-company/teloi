import { useBrowserRuntime } from "@/context/useBrowserRuntime";
import { Id, System } from "@/schema";
import { TupleT } from "@/services/domain/Tuple";
import { AutomergeT } from "@/services/external/Automerge";
import { PropertyT, type LinkedTuple } from "@/services/ui/Property";
import { WindowT } from "@/services/ui/Window";
import { Effect, Option } from "effect";
import { nanoid } from "nanoid";
import {
  createEffect,
  createSignal,
  For,
  onCleanup,
  onMount,
  Show,
  useContext,
} from "solid-js";
import Block from "./Block";
import { ActiveElementContext } from "./BufferView";
// TODO: Re-enable Editor import once blockId support is added
// import Editor from "./Editor";

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
 * GhostBlock: A phantom block that shows a Editor but doesn't create a
 * LiveStore node until the user actually types something.
 *
 * The key insight is that text content is independent of LiveStore - we can bind
 * Editor to text with a pre-generated nodeId, then only materialize
 * the actual node when the user types. The typed content is preserved because
 * the real Block will use the same nodeId (same Automerge text!).
 */
function GhostBlock(props: GhostBlockProps) {
  const runtime = useBrowserRuntime();
  const Automerge = runtime.runSync(AutomergeT);

  // Pre-generate nodeId on component initialization
  // This ID is ephemeral until materialization
  const ghostNodeId = Id.Node.make(nanoid());

  // Track if we've materialized (to prevent double-trigger)
  let materialized = false;

  // Local focus state
  const [isActive, setIsActive] = createSignal(false);

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

  // Subscribe to Automerge text changes for first change → materialize
  onMount(() => {
    let materializeTimeout: ReturnType<typeof setTimeout> | null = null;

    const checkAndMaterialize = async () => {
      const text = await runtime.runPromise(Automerge.getText(ghostNodeId));
      if (text.length > 0 && !materialized) {
        // Debounce materialization to allow rapid typing to complete
        // 50ms is enough for most keyboard input to settle
        if (materializeTimeout) clearTimeout(materializeTimeout);
        materializeTimeout = setTimeout(() => {
          if (!materialized) materialize();
        }, 50);
      }
    };

    // Subscribe to changes via handle
    const onChange = () => {
      checkAndMaterialize();
    };
    Automerge.handle.on("change", onChange);

    onCleanup(() => {
      if (materializeTimeout) clearTimeout(materializeTimeout);
      Automerge.handle.off("change", onChange);
      // Clean up orphan text if never materialized and empty
      if (!materialized) {
        runtime.runPromise(
          Effect.gen(function* () {
            const text = yield* Automerge.getText(ghostNodeId);
            if (text.length === 0) {
              yield* Automerge.deleteText(ghostNodeId);
            }
          }),
        );
      }
    });
  });

  // Derive "should show editor" from both local state and requestFocus prop
  const shouldShowEditor = () => isActive() || props.requestFocus;

  const handleFocus = (_e: MouseEvent) => {
    setIsActive(true);
  };

  // TODO: handleBlur/handleSelectionChange will be handled via ActionT once
  // blockId support is added. For now, focus/blur state is broken.

  return (
    <div
      data-testid="ghost-block"
      data-element-type="block"
      class="relative"
      onClick={handleFocus}
    >
      <Show
        when={shouldShowEditor()}
        fallback={
          <span class="text-neutral-400 italic cursor-text">
            click to add...
          </span>
        }
      >
        {/* TODO: Pre-generate blockId for ghost block and pass to Editor.
            The ghost block pattern needs a blockId before materialization.
            See: Editor now requires blockId for ActionT integration. */}
        <div class="text-neutral-400">[Ghost editor placeholder]</div>
      </Show>
    </div>
  );
}

/**
 * PropertySection displays an editable property with its name and linked blocks.
 *
 * Features:
 * - Property name is editable (using Editor when focused)
 * - ArrowRight at end of unbound property triggers quick-create flow:
 *   - Creates tuple type, position nodes, and initial linked block
 *   - Focuses the new linked block
 * - Linked blocks displayed on the right side
 */
export default function PropertySection(props: PropertySectionProps) {
  const runtime = useBrowserRuntime();
  const Automerge = runtime.runSync(AutomergeT);

  // Subscribe to activeElement for auto-focus
  const getActiveElement = useContext(ActiveElementContext);

  // Property name from Automerge
  const [propertyName, setPropertyName] = createSignal("");

  // Local focus state for property name
  const [isActive, setIsActive] = createSignal(false);

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

  // Focus the property name
  const focusPropertyName = () => {
    setIsActive(true);
    // Selection is handled by CodeMirror internally now
  };

  // Auto-focus when activeElement matches this property
  createEffect(() => {
    const activeEl = getActiveElement();
    // Don't steal focus when ghost block is being focused
    if (ghostFocusRequested()) return;

    if (
      activeEl?.type === "property" &&
      activeEl.propertyId === props.propertyId &&
      activeEl.bufferId === props.bufferId
    ) {
      focusPropertyName();
    }
  });

  onMount(() => {
    // Load initial property name from Automerge
    runtime
      .runPromise(Automerge.getText(props.propertyId))
      .then(setPropertyName);

    // Subscribe to Automerge changes for property name
    const onChange = () => {
      runtime
        .runPromise(Automerge.getText(props.propertyId))
        .then(setPropertyName);
    };
    Automerge.handle.on("change", onChange);

    // Load linked tuples
    loadLinkedTuples();

    onCleanup(() => {
      Automerge.handle.off("change", onChange);
    });
  });

  const handleFocus = (_e: MouseEvent) => {
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

  // TODO: handleBlur/handleSelectionChange will be handled via ActionT once
  // blockId support is added. For now, focus/blur state is broken.

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
            {/* TODO: Pre-generate blockId for property header and pass to Editor.
                Editor now requires blockId for ActionT integration. */}
            <div class="text-neutral-400">[Property editor placeholder]</div>
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
            {(tuple) => <Block blockId={makePropertyBlockId(tuple.tupleId)} />}
          </For>
        </Show>
      </div>
    </div>
  );
}
