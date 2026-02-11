import { useBrowserRuntime } from "@/context/useBrowserRuntime";
import { Id } from "@/schema";
import { posAtCoordsInElement } from "@/services/browser/TextBlock";
import { AutomergeT } from "@/services/external/Automerge";
import {
  TitleT,
  type TitleSelection,
  type TitleView,
} from "@/services/ui/Title";
import { bindStreamToStore } from "@/utils/bindStreamToStore";
import { Effect, Stream } from "effect";
import { onCleanup, onMount, Show } from "solid-js";
import Editor from "./Editor";
import { focusBlock } from "./focusBlock";

interface TitleProps {
  frameId: Id.Frame;
  nodeId: Id.Node;
}

/**
 * Render and manage an editable title for a frame node.
 *
 * Synchronizes the displayed text with Automerge, switches between a read-only heading
 * and an interactive Editor when the title becomes active, and handles focus and keyboard
 * navigation (ArrowRight at end, ArrowDown on last line, Enter to split/create a child node).
 */
export default function Title({ frameId, nodeId }: TitleProps) {
  const runtime = useBrowserRuntime();

  const Automerge = runtime.runSync(AutomergeT);

  const titleStream = Stream.unwrap(
    Effect.gen(function* () {
      const Title = yield* TitleT;
      return yield* Title.subscribe(frameId, nodeId);
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

  let h1Ref: HTMLHeadingElement | undefined;

  const toTextOffset = (
    container: HTMLElement,
    node: Node,
    offset: number,
  ): number | null => {
    if (!container.contains(node)) return null;
    const range = document.createRange();
    range.selectNodeContents(container);
    range.setEnd(node, offset);
    return range.toString().length;
  };

  const resolveInitialSelection = (
    container: HTMLElement,
    e: MouseEvent,
  ): { anchor: number; head: number; assoc: -1 | 0 | 1 } => {
    const domSelection = window.getSelection();
    if (
      domSelection &&
      domSelection.rangeCount > 0 &&
      domSelection.anchorNode &&
      domSelection.focusNode &&
      container.contains(domSelection.anchorNode) &&
      container.contains(domSelection.focusNode)
    ) {
      const anchor = toTextOffset(
        container,
        domSelection.anchorNode,
        domSelection.anchorOffset,
      );
      const head = toTextOffset(
        container,
        domSelection.focusNode,
        domSelection.focusOffset,
      );
      if (anchor != null && head != null) {
        if (anchor === head) {
          const resolved = posAtCoordsInElement(container, e.clientX, e.clientY);
          return { anchor, head, assoc: resolved?.assoc ?? 0 };
        }
        return { anchor, head, assoc: 0 };
      }
    }

    const resolved = posAtCoordsInElement(container, e.clientX, e.clientY);
    const offset = resolved?.offset ?? 0;
    return { anchor: offset, head: offset, assoc: resolved?.assoc ?? 0 };
  };

  const handleClick = (e: MouseEvent) => {
    if (store.isActive) return;
    if (!h1Ref) return;

    const titleBlockId = Id.makeFrameBlockId(frameId, nodeId);
    const initialSelection = resolveInitialSelection(h1Ref, e);

    runtime.runSync(
      focusBlock({
        frameId,
        nodeId,
        blockId: titleBlockId,
        anchor: initialSelection.anchor,
        head: initialSelection.head,
        assoc: initialSelection.assoc,
      }),
    );
  };

  onMount(() => {
    const dispose = start(runtime);
    onCleanup(() => dispose());
  });

  return (
    <div
      data-element-id={frameId}
      data-element-type="title"
      onClick={handleClick}
      class="min-h-[var(--text-title--line-height)]"
    >
      <Show
        when={store.isActive}
        fallback={
          <h1
            ref={h1Ref}
            class="text-title leading-[var(--text-title--line-height)] font-semibold whitespace-break-spaces wrap-anywhere pl-[var(--block-padding-left)]"
          >
            {store.textContent}
          </h1>
        }
      >
        <Editor
          handle={Automerge.handle}
          path={Automerge.getTextPath(nodeId)}
          blockId={Id.makeFrameBlockId(frameId, nodeId)}
          {...(store.selection ? { initialSelection: store.selection } : {})}
          variant="title"
        />
      </Show>
    </div>
  );
}
