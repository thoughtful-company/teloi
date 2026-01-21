import type { BrowserRuntime } from "@/runtime";
import { Id } from "@/schema";
import { TitleLinkT, type TitleLink } from "@/services/domain/TitleLink";
import { YjsT } from "@/services/external/Yjs";
import { Effect, Fiber, Stream } from "effect";
import { createSignal } from "solid-js";

interface UseTitleLinkOptions {
  nodeId: Id.Node;
  runtime: BrowserRuntime;
}

/**
 * Manages title link state for a node that may display another node's text.
 *
 * When a node has a title link, it displays the source node's text instead of its own.
 * The link mode determines behavior:
 * - "synced": Changes sync bidirectionally (not yet implemented)
 * - "readonly": Text is read-only
 * - "detach": First edit copies text and breaks the link
 *
 * @returns Reactive state and functions for managing the title link
 */
export function useTitleLink({ nodeId, runtime }: UseTitleLinkOptions) {
  const Yjs = runtime.runSync(YjsT);

  const [titleLink, setTitleLink] = createSignal<TitleLink | null>(null);
  const [textContent, setTextContent] = createSignal(
    Yjs.getText(nodeId).toString(),
  );

  /** The node ID whose text should be displayed (source if linked, otherwise self) */
  const displayNodeId = () => titleLink()?.sourceId ?? nodeId;

  /** The title link mode, or null if no link exists */
  const titleMode = () => titleLink()?.mode ?? null;

  /** Get Y.Text for the display node (reactive based on title link) */
  const getYtext = () => Yjs.getText(displayNodeId());

  /** Get undo manager for the display node (reactive based on title link) */
  const getUndoManager = () => Yjs.getUndoManager(displayNodeId());

  // Track current ytext for observer cleanup when link changes
  let currentYtext = Yjs.getText(nodeId);
  const observer = () => setTextContent(getYtext().toString());

  /**
   * Start the title link subscription and Y.Text observation.
   * Call this in onMount and store the returned cleanup function for onCleanup.
   */
  const start = () => {
    currentYtext.observe(observer);

    const fiber = runtime.runFork(
      Effect.gen(function* () {
        const TitleLink = yield* TitleLinkT;
        const stream = yield* TitleLink.subscribe(nodeId);
        yield* Stream.runForEach(stream, (link) =>
          Effect.sync(() => {
            // Unobserve old ytext before updating state
            currentYtext.unobserve(observer);
            setTitleLink(link);
            // Update text content and re-observe new ytext
            currentYtext = getYtext();
            setTextContent(currentYtext.toString());
            currentYtext.observe(observer);
          }),
        );
      }),
    );

    return () => {
      currentYtext.unobserve(observer);
      runtime.runFork(Fiber.interrupt(fiber));
    };
  };

  /**
   * Detach from the title link source.
   * Copies source text to this node's own Y.Text and removes the link.
   */
  const handleDetach = () => {
    const link = titleLink();
    if (!link) return;

    runtime.runFork(
      Effect.gen(function* () {
        const TitleLink = yield* TitleLinkT;
        yield* TitleLink.detach(nodeId, link.sourceId);
      }).pipe(
        Effect.tapError((err) =>
          Effect.logError("[useTitleLink] Detach failed").pipe(
            Effect.annotateLogs({ nodeId, error: String(err) }),
          ),
        ),
        Effect.catchAll(() => Effect.void),
      ),
    );
  };

  return {
    displayNodeId,
    titleMode,
    getYtext,
    getUndoManager,
    textContent,
    start,
    handleDetach,
  };
}
