import { defaultKeymap } from "@codemirror/commands";
import { EditorState } from "@codemirror/state";
import { EditorView, keymap } from "@codemirror/view";
import { onCleanup, onMount } from "solid-js";

interface TextEditorProps {
  initialText: string;
  onChange: (text: string) => void;
  initialClickCoords?: { x: number; y: number } | null;
}

export default function TextEditor({ initialText, onChange, initialClickCoords }: TextEditorProps) {
  let containerRef!: HTMLDivElement;
  let view: EditorView | undefined;

  onMount(() => {
    const state = EditorState.create({
      doc: initialText,
      extensions: [
        keymap.of(defaultKeymap),
        EditorView.lineWrapping,
        EditorView.updateListener.of((update) => {
          if (update.docChanged) {
            onChange(update.state.doc.toString());
          }
        }),
      ],
    });

    view = new EditorView({
      state,
      parent: containerRef,
    });
    view.focus();

    // Position cursor at click location if available
    if (initialClickCoords) {
      const pos = view.posAtCoords(initialClickCoords);
      if (pos !== null) {
        view.dispatch({ selection: { anchor: pos } });
      }
    }

    onCleanup(() => view?.destroy());
  });

  return <div ref={containerRef} />;
}
