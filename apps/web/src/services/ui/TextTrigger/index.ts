import { Id } from "@/schema";
import type { Extension } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import type { Effect } from "effect";

/**
 * Context passed to a trigger's action when its pattern matches.
 */
export interface TriggerContext {
  khoraId: Id.Khora;
  nodeId: Id.Node;
  frameId: Id.Frame;
  match: RegExpMatchArray;
  /**
   * Delete the matched characters from the editor.
   * Call this from inside the action to strip the trigger prefix (e.g. "- ")
   * while leaving the surrounding block intact. Triggers that destroy the
   * whole block (like the property trigger) don't need to call this.
   */
  consumeMatch: () => void;
}

/**
 * A text-trigger definition.
 *
 * The framework tests `pattern` against the current line prefix (from
 * line-start up to the cursor) on every doc-changing update. On first match,
 * it invokes `action(ctx)` via the `onFire` callback registered at mount.
 */
export interface TextTrigger {
  pattern: RegExp;
  action: (
    ctx: TriggerContext,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ) => Effect.Effect<void, never, any>;
}

/**
 * Build a CodeMirror extension that runs `triggers` against the cursor's
 * line prefix on each doc-changing update.
 *
 * @param khoraId    The khora hosting this editor. Non-frame khoras (e.g.
 *                   property titles) get a no-op extension — triggers only
 *                   fire inside outline blocks.
 * @param onFire     Callback that runs a matched trigger's action. In
 *                   production this is `runtime.runFork`; tests pass
 *                   `Effect.runSync`.
 */
export const createTextTriggerExtension = (
  triggers: readonly TextTrigger[],
  khoraId: Id.Khora,
  onFire: (
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    action: Effect.Effect<void, never, any>,
  ) => void,
): Extension => {
  if (triggers.length === 0) return [];

  const ctx = Id.parseKhoraContextSync(khoraId);
  if (ctx.type !== "frame") return [];
  const frameId = ctx.frameId;
  const nodeId = ctx.nodeId;

  return EditorView.updateListener.of((update) => {
    if (!update.docChanged) return;

    const { state, view } = update;
    const cursor = state.selection.main.head;
    const line = state.doc.lineAt(cursor);
    const prefix = state.doc.sliceString(line.from, cursor);

    for (const trigger of triggers) {
      const match = prefix.match(trigger.pattern);
      if (!match) continue;

      const matchIndex = match.index ?? 0;
      const from = line.from + matchIndex;
      const to = from + match[0].length;

      const consumeMatch = () => {
        view.dispatch({ changes: { from, to, insert: "" } });
      };

      onFire(
        trigger.action({
          khoraId,
          nodeId,
          frameId,
          match,
          consumeMatch,
        }),
      );
      return;
    }
  });
};
