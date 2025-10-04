import { Component } from "solid-js";
import PaneWrapper from "./ui/PaneWrapper";

const App: Component = () => {
  return (
    <div class="flex h-full w-full">
      <PaneWrapper>
        <header class="mx-auto max-w-[var(--max-line-width)] border-b-[1.5px] border-foreground-lighter  pb-3 pt-7">
          <span class="text-title font-bold whitespace-break-spaces wrap-break-word text-wrap outline-none">
            hell,o; Existence
          </span>
        </header>
      </PaneWrapper>
    </div>
  );
};

export default App;
