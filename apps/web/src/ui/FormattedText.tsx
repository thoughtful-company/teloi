import { createSignal, For, onCleanup, onMount } from "solid-js";
import * as Y from "yjs";

/** Text segment with optional formatting */
interface TextSegment {
  text: string;
  bold?: boolean;
  italic?: boolean;
  code?: boolean;
}

/** Build segments from Y.Text deltas for formatted rendering */
function buildSegments(ytext: Y.Text): TextSegment[] {
  const deltas = ytext.toDelta() as Array<{
    insert: string;
    attributes?: { bold?: true; italic?: true; code?: true };
  }>;

  return deltas.map((d) => ({
    text: d.insert,
    bold: d.attributes?.bold === true,
    italic: d.attributes?.italic === true,
    code: d.attributes?.code === true,
  }));
}

/** Renders Y.Text with formatting for unfocused blocks */
export function FormattedText(props: { ytext: Y.Text }) {
  const [segments, setSegments] = createSignal(buildSegments(props.ytext));

  // Observe Y.Text changes to update segments
  onMount(() => {
    const observer = () => setSegments(buildSegments(props.ytext));
    props.ytext.observe(observer);
    onCleanup(() => props.ytext.unobserve(observer));
  });

  return (
    <For each={segments()}>
      {(segment) => {
        // Code gets special treatment (monospace font + background)
        if (segment.code) {
          return (
            <code
              classList={{
                "font-mono bg-neutral-100 px-1 rounded": true,
                "font-bold": segment.bold,
                italic: segment.italic,
              }}
            >
              {segment.text}
            </code>
          );
        }
        // Plain text with optional bold/italic
        if (segment.bold || segment.italic) {
          return (
            <span
              classList={{
                "font-bold": segment.bold,
                italic: segment.italic,
              }}
            >
              {segment.text}
            </span>
          );
        }
        return segment.text;
      }}
    </For>
  );
}
