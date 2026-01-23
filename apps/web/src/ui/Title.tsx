import { useBrowserRuntime } from "@/context/useBrowserRuntime";
import { Id } from "@/schema";
import { AutomergeT } from "@/services/external/Automerge";
import { AppAction, createDispatch } from "@/services/ui/Action";
import {
  TitleT,
  type TitleSelection,
  type TitleView,
} from "@/services/ui/Title";
import { bindStreamToStore } from "@/utils/bindStreamToStore";
import { posAtCoordsInElement } from "@/utils/posAtCoordsInElement";
import { Effect, Stream } from "effect";
import { onCleanup, onMount, Show } from "solid-js";
import TextEditor from "./TextEditor";

interface TitleProps {
  bufferId: Id.Buffer;
  nodeId: Id.Node;
}

/**
 * Render and manage an editable title for a buffer node.
 *
 * Synchronizes the displayed text with Automerge, switches between a read-only heading
 * and an interactive TextEditor when the title becomes active, and handles focus and keyboard
 * navigation (ArrowRight at end, ArrowDown on last line, Enter to split/create a child node).
 */
export default function Title({ bufferId, nodeId }: TitleProps) {
  const runtime = useBrowserRuntime();

  // Get Automerge handle
  const Automerge = runtime.runSync(AutomergeT);

  // Title state stream (includes isActive, selection, textContent)
  const titleStream = Stream.unwrap(
    Effect.gen(function* () {
      const Title = yield* TitleT;
      return yield* Title.subscribe(bufferId, nodeId);
    }),
  );

  const { store, start } = bindStreamToStore({
    stream: titleStream,
    project: (v) => v,
    initial: {
      isActive: false,
      selection: null as TitleSelection | null,
      textContent: "",
    } satisfies TitleView,
  });

  // Ref to h1 element for click position resolution
  let h1Ref: HTMLHeadingElement | undefined;

  const dispatch = createDispatch(runtime);

  // Handle mousedown to activate title (mousedown enables drag-to-select)
  const handleMouseDown = (e: MouseEvent) => {
    if (store.isActive) return;

    const titleBlockId = Id.makeBufferBlockId(bufferId, nodeId);

    // Resolve click position on the unfocused h1
    let offset: number | undefined;
    if (h1Ref) {
      const resolved = posAtCoordsInElement(h1Ref, e.clientX, e.clientY);
      offset = resolved?.offset;
    }

    dispatch(AppAction.Focus(titleBlockId, offset));
  };

  onMount(() => {
    const dispose = start(runtime);
    onCleanup(() => dispose());
  });

  return (
    <div
      data-element-id={bufferId}
      data-element-type="title"
      onMouseDown={handleMouseDown}
      class="min-h-[var(--text-title--line-height)]"
    >
      <Show
        when={store.isActive}
        fallback={
          <h1
            ref={h1Ref}
            class="text-title leading-[var(--text-title--line-height)] font-semibold whitespace-break-spaces"
          >
            {store.textContent}
          </h1>
        }
      >
        <TextEditor
          handle={Automerge.handle}
          path={Automerge.getTextPath(nodeId)}
          blockId={Id.makeBufferBlockId(bufferId, nodeId)}
          {...(store.selection ? { initialSelection: store.selection } : {})}
          variant="title"
        />
      </Show>
    </div>
  );
}
