import { Show, type JSX } from "solid-js";

/**
 * Selection with optional goalX/goalLine for vertical navigation.
 * Matches KhoraTextSelection and TitleSelection shapes.
 */
export interface FocusableSelection {
  anchor: number;
  head: number;
  goalX: number | null;
  goalLine: "first" | "last" | null;
  assoc: -1 | 0 | 1;
}

interface FocusableTextProps {
  isActive: boolean;
  selection: FocusableSelection | null;
  renderUnfocused: (ref: (el: HTMLElement) => void) => JSX.Element;
  renderEditor: (selection: FocusableSelection | null) => JSX.Element;
}

/**
 * Wrapper that switches between unfocused text display and Editor.
 *
 * When goalX/goalLine is set, passes them through to Editor which uses
 * CodeMirror's posAtCoords for position resolution and goalColumn for
 * preserving horizontal position during vertical navigation.
 */
export function FocusableText(props: FocusableTextProps) {
  return (
    <Show when={props.isActive} fallback={props.renderUnfocused(() => {})}>
      {props.renderEditor(props.selection)}
    </Show>
  );
}
