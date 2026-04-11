import { EditorState } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { Id } from "@/schema";
import {
  createTextTriggerExtension,
  type TextTrigger,
  type TriggerContext,
} from "@/services/ui/TextTrigger";
import { Effect } from "effect";
import { beforeEach, describe, expect, it } from "vitest";

/**
 * TextTrigger framework tests
 *
 * The framework is a CodeMirror extension that scans the line prefix (from
 * line-start up to the cursor) on every doc-changing update, and fires a
 * trigger's action effect via the provided `onFire` callback whenever a
 * pattern matches.
 *
 * These tests use a raw CodeMirror EditorView (no app runtime, no FrameView)
 * because the update-listener logic is pure CodeMirror.
 */

describe("createTextTriggerExtension", () => {
  let view: EditorView | undefined;

  beforeEach(() => {
    view?.destroy();
    view = undefined;
  });

  const fakeKhoraId = Id.makeFrameKhoraId(
    Id.Frame.make("test-frame"),
    Id.Node.make("test-node"),
  );

  const mountView = (trigger: TextTrigger) => {
    const onFire = (action: Effect.Effect<void, never, any>) => {
      Effect.runSync(action as Effect.Effect<void>);
    };
    const extension = createTextTriggerExtension(
      [trigger],
      fakeKhoraId,
      onFire,
    );
    view = new EditorView({
      state: EditorState.create({
        doc: "",
        extensions: [extension],
      }),
    });
    return view;
  };

  it("fires trigger when pattern matches at line start", () => {
    const captured: TriggerContext[] = [];
    const trigger: TextTrigger = {
      pattern: /^hi $/,
      action: (ctx) =>
        Effect.sync(() => {
          captured.push(ctx);
        }),
    };

    const v = mountView(trigger);
    v.dispatch(v.state.replaceSelection("hi "));

    expect(captured).toHaveLength(1);
    expect(captured[0]!.match[0]).toBe("hi ");
  });

  it("does not fire trigger when pattern does not match", () => {
    const captured: TriggerContext[] = [];
    const trigger: TextTrigger = {
      pattern: /^hi $/,
      action: (ctx) =>
        Effect.sync(() => {
          captured.push(ctx);
        }),
    };

    const v = mountView(trigger);
    v.dispatch(v.state.replaceSelection("hello"));

    expect(captured).toHaveLength(0);
  });

  it("does not fire when pattern matches only mid-line", () => {
    const captured: TriggerContext[] = [];
    const trigger: TextTrigger = {
      pattern: /^hi $/,
      action: (ctx) =>
        Effect.sync(() => {
          captured.push(ctx);
        }),
    };

    const v = mountView(trigger);
    v.dispatch(v.state.replaceSelection("some text"));
    v.dispatch(v.state.replaceSelection(" hi "));

    expect(captured).toHaveLength(0);
  });

  it("consumeMatch deletes the matched characters from the doc", () => {
    const trigger: TextTrigger = {
      pattern: /^foo $/,
      action: (ctx) => Effect.sync(() => ctx.consumeMatch()),
    };

    const v = mountView(trigger);
    v.dispatch(v.state.replaceSelection("foo "));

    expect(v.state.doc.toString()).toBe("");
  });
});
