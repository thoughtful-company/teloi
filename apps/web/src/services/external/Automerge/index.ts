import { Id } from "@/schema";
import { DocHandle, Repo } from "@automerge/automerge-repo";
import { IndexedDBStorageAdapter } from "@automerge/automerge-repo-storage-indexeddb";
import { Context, Effect, Layer, Stream } from "effect";
import type { WorkspaceTexts } from "./types";

export type { WorkspaceTexts } from "./types";

/**
 * AutomergeT provides text content storage using Automerge CRDT.
 *
 * Unlike the old YjsT, we don't expose Y.Text directly since Automerge
 * uses a different API. For CodeMirror integration, components should
 * use the handle/path props with automergeSyncPlugin.
 */
export class AutomergeT extends Context.Tag("AutomergeT")<
  AutomergeT,
  {
    /** Get the current text for a node (empty string if not set) */
    getText: (nodeId: Id.Node) => Effect.Effect<string>;

    /** Set text for a node (creates entry if needed) */
    setText: (nodeId: Id.Node, text: string) => Effect.Effect<void>;

    /** Delete text for a node (cleanup) */
    deleteText: (nodeId: Id.Node) => Effect.Effect<void>;

    /** Subscribe to text changes for a node */
    subscribeText: (
      nodeId: Id.Node,
    ) => Effect.Effect<Stream.Stream<{ content: string }>>;

    /** Get the DocHandle for CodeMirror integration */
    readonly handle: DocHandle<WorkspaceTexts>;

    /** Get the text path for a node (for automergeSyncPlugin) */
    getTextPath: (nodeId: Id.Node) => ["texts", string];
  }
>() {}

export interface AutomergeConfig {
  /** Workspace name for storage (e.g., "teloi-workspace") */
  workspaceName: string;
  /** Whether to persist to IndexedDB (disable in tests) */
  persist?: boolean;
}

/**
 * Create the Automerge service layer.
 */
export const makeAutomergeLive = (config: AutomergeConfig) =>
  Layer.effect(
    AutomergeT,
    Effect.gen(function* () {
      // Create repo with optional persistence
      const storage = config.persist
        ? new IndexedDBStorageAdapter(config.workspaceName)
        : undefined;

      const repo = new Repo({ storage });

      // localStorage key for storing the doc URL for this workspace
      const storageKey = `automerge:${config.workspaceName}`;

      // Try to find existing doc or create new one
      const existingUrl = config.persist
        ? localStorage.getItem(storageKey)
        : null;

      let handle: DocHandle<WorkspaceTexts>;
      let isNewDoc = !existingUrl;

      if (existingUrl) {
        // Try to find existing document (allow unavailable state so we can handle it)
        const foundHandle = yield* Effect.promise(() =>
          repo.find<WorkspaceTexts>(existingUrl as `automerge:${string}`, {
            allowableStates: ["ready", "unavailable"],
          }),
        );

        if (foundHandle.isUnavailable()) {
          // Document was lost - create a new one
          handle = repo.create<WorkspaceTexts>();
          isNewDoc = true;
          localStorage.setItem(storageKey, handle.url);
        } else {
          handle = foundHandle;
        }
      } else {
        handle = repo.create<WorkspaceTexts>();
      }

      // Store the URL for next time (only if persisting and new)
      if (config.persist && isNewDoc) {
        localStorage.setItem(storageKey, handle.url);
      }

      // Wait for document to be ready (for newly created docs)
      if (isNewDoc) {
        yield* Effect.promise(() => handle.whenReady());
      }

      // Initialize empty texts object if needed (only for new docs)
      if (isNewDoc) {
        handle.change((doc) => {
          if (!doc.texts) {
            doc.texts = {};
          }
        });
      }

      const getText = (nodeId: Id.Node): Effect.Effect<string> =>
        Effect.sync(() => {
          const doc = handle.doc();
          return doc?.texts?.[nodeId] ?? "";
        });

      const setText = (nodeId: Id.Node, text: string): Effect.Effect<void> =>
        Effect.sync(() => {
          handle.change((doc) => {
            if (!doc.texts) {
              doc.texts = {};
            }
            doc.texts[nodeId] = text;
          });
        });

      const deleteText = (nodeId: Id.Node): Effect.Effect<void> =>
        Effect.sync(() => {
          handle.change((doc) => {
            if (doc.texts && nodeId in doc.texts) {
              delete doc.texts[nodeId];
            }
          });
        });

      const subscribeText = (
        nodeId: Id.Node,
      ): Effect.Effect<Stream.Stream<{ content: string }>> =>
        Effect.sync(() => {
          return Stream.async<{ content: string }>((emit) => {
            // Emit initial value
            const doc = handle.doc();
            const initialContent = doc?.texts?.[nodeId] ?? "";
            emit.single({ content: initialContent });

            // Subscribe to changes
            const onChange = () => {
              const doc = handle.doc();
              const content = doc?.texts?.[nodeId] ?? "";
              emit.single({ content });
            };

            handle.on("change", onChange);

            return Effect.sync(() => {
              handle.off("change", onChange);
            });
          });
        });

      const getTextPath = (nodeId: Id.Node): ["texts", string] => [
        "texts",
        nodeId,
      ];

      return {
        getText,
        setText,
        deleteText,
        subscribeText,
        handle,
        getTextPath,
      };
    }),
  );
