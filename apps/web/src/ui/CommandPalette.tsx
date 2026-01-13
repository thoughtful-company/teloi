import { useBrowserRuntime } from "@/context/useBrowserRuntime";
import { commands, type Command, type CommandContext } from "@/commands";
import { Dialog } from "@kobalte/core/dialog";
import { createEffect, createSignal, For, onCleanup, Show } from "solid-js";

export interface CommandPaletteProps {
  open: boolean;
  onClose: () => void;
  context: CommandContext | null;
}

export default function CommandPalette(props: CommandPaletteProps) {
  const runtime = useBrowserRuntime();
  let inputRef: HTMLInputElement | undefined;

  const [query, setQuery] = createSignal("");
  const [selectedIndex, setSelectedIndex] = createSignal(0);

  // Filter commands by query
  const filteredCommands = () => {
    const q = query().toLowerCase();
    if (!q) return commands;
    return commands.filter((cmd) => cmd.label.toLowerCase().includes(q));
  };

  const executeCommand = (cmd: Command) => {
    if (!props.context) return;

    runtime.runPromise(cmd.action(props.context)).then(() => {
      props.onClose();
    });
  };

  const executeSelectedCommand = () => {
    const cmd = filteredCommands()[selectedIndex()];
    if (cmd && props.context) {
      executeCommand(cmd);
    }
  };

  // Capture phase listener to intercept keys before Kobalte can block them
  const captureKeyHandler = (e: KeyboardEvent) => {
    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        e.stopPropagation();
        setSelectedIndex((i) => Math.min(i + 1, filteredCommands().length - 1));
        break;
      case "ArrowUp":
        e.preventDefault();
        e.stopPropagation();
        setSelectedIndex((i) => Math.max(i - 1, 0));
        break;
      case "Enter":
        e.preventDefault();
        e.stopPropagation();
        executeSelectedCommand();
        break;
      case "ArrowLeft":
      case "ArrowRight":
      case "Backspace":
      case "Delete":
      case "Home":
      case "End":
        // Let these through to the input but stop Kobalte from seeing them
        e.stopPropagation();
        break;
    }
  };

  // Reset state when opening
  createEffect(() => {
    if (props.open) {
      setQuery("");
      setSelectedIndex(0);
      // Focus input after render and add capture listener
      setTimeout(() => {
        inputRef?.focus();
        const dialogContent = document.querySelector('[data-testid="command-palette"]');
        if (dialogContent instanceof HTMLElement) {
          dialogContent.addEventListener("keydown", captureKeyHandler, true);
        }
      }, 0);
    }
  });

  onCleanup(() => {
    const dialogContent = document.querySelector('[data-testid="command-palette"]');
    if (dialogContent instanceof HTMLElement) {
      dialogContent.removeEventListener("keydown", captureKeyHandler, true);
    }
  });

  return (
    <Dialog open={props.open} onOpenChange={(open) => !open && props.onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay class="fixed inset-0 bg-black/50 z-40" />
        <Dialog.Content
          data-testid="command-palette"
          class="fixed top-1/4 left-1/2 -translate-x-1/2 z-50 w-full max-w-md bg-sidebar/95 backdrop-blur-md border border-sidebar-border rounded-lg shadow-daiichi overflow-hidden"
        >
          {/* Search input */}
          <div class="p-3 border-b border-sidebar-border">
            <input
              ref={inputRef}
              type="text"
              placeholder="Type a command..."
              value={query()}
              onInput={(e) => {
                setQuery(e.currentTarget.value);
                setSelectedIndex(0);
              }}
              class="w-full bg-transparent text-sidebar-foreground placeholder:text-sidebar-foreground/50 outline-none text-sm"
            />
          </div>

          {/* Command list */}
          <div class="max-h-64 overflow-y-auto py-1">
            <Show
              when={filteredCommands().length > 0}
              fallback={
                <div class="px-3 py-2 text-sm text-sidebar-foreground/60">
                  No commands found
                </div>
              }
            >
              <For each={filteredCommands()}>
                {(cmd, index) => (
                  <button
                    type="button"
                    data-testid="command-item"
                    class={`w-full flex items-center gap-2 px-3 py-2 text-sm text-left text-sidebar-foreground ${
                      index() === selectedIndex()
                        ? "bg-sidebar-accent"
                        : "hover:bg-sidebar-accent"
                    }`}
                    onClick={() => executeCommand(cmd)}
                    onMouseEnter={() => setSelectedIndex(index())}
                  >
                    {cmd.label}
                  </button>
                )}
              </For>
            </Show>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog>
  );
}
