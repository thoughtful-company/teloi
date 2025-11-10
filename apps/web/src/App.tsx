import { defaultKeymap } from "@codemirror/commands";
import { EditorState } from "@codemirror/state";
import { EditorView, keymap } from "@codemirror/view";
import { Component, onMount } from "solid-js";
import PaneWrapper from "./ui/PaneWrapper";

const App: Component = () => {
  let editorRef!: HTMLDivElement;

  onMount(() => {
    const startState = EditorState.create({
      doc: `Alice was beginning to get very tired of sitting by her sister on the bank, and of having nothing to do. Once or twice she had peeped into the book her sister was reading, but it had no pictures or conversations in it, "and what is the use of a book," thought Alice, "without pictures or conversations?"`,
      extensions: [keymap.of(defaultKeymap), EditorView.lineWrapping],
    });

    const view = new EditorView({
      state: startState,
      parent: editorRef,
    });

    return () => view.destroy();
  });

  return (
    <div class="flex h-full w-full">
      <PaneWrapper>
        <header class="mx-auto max-w-[var(--max-line-width)] border-b-[1.5px] border-foreground-lighter pb-3 pt-7">
          <span class="text-title font-bold whitespace-break-spaces wrap-break-word text-wrap outline-none">
            hell,o; Existence
          </span>
        </header>
        <div ref={editorRef}></div>
      </PaneWrapper>
    </div>
  );
};

export default App;
