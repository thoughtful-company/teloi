import { defaultKeymap } from "@codemirror/commands";
import { EditorState } from "@codemirror/state";
import { EditorView, keymap } from "@codemirror/view";
import { onCleanup, onMount } from "solid-js";

interface TextEditorProps {
  initialText: string;
  onChange: (text: string) => void;
}

export default function TextEditor({ initialText, onChange }: TextEditorProps) {
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

    onCleanup(() => view?.destroy());
  });

  return <div ref={containerRef} />;
}
