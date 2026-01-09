import { Id } from "@/schema";
import { Context, Effect, Layer } from "effect";
import * as Y from "yjs";

export class YjsT extends Context.Tag("YjsT")<
  YjsT,
  {
    /** Get or create a Y.Text for the given node ID */
    getText: (nodeId: Id.Node) => Y.Text;
    /** Delete the Y.Text for the given node ID (cleanup) */
    deleteText: (nodeId: Id.Node) => void;
    /** Get or create an UndoManager for the given node ID */
    getUndoManager: (nodeId: Id.Node) => Y.UndoManager;
    /** The underlying Y.Doc instance */
    readonly doc: Y.Doc;
  }
>() {}

export interface YjsConfig {
  /** Room name for persistence (e.g., workspace ID) */
  roomName: string;
  /** Whether to enable IndexedDB persistence (disable in tests/dev) */
  persist?: boolean;
}

export const makeYjsLive = (config: YjsConfig) =>
  Layer.effect(
    YjsT,
    Effect.gen(function* () {
      const doc = new Y.Doc();
      const undoManagers = new Map<string, Y.UndoManager>();

      // Wait for IndexedDB persistence to sync before returning.
      // Using Effect.promise (untyped errors) intentionally - this is one-time
      // initialization, and if persistence fails there's no recovery path anyway.
      if (config.persist === true) {
        yield* Effect.promise(async () => {
          const { IndexeddbPersistence } = await import("y-indexeddb");
          const persistence = new IndexeddbPersistence(config.roomName, doc);
          await persistence.whenSynced;
        });
      }

      const getText = (nodeId: Id.Node): Y.Text => {
        return doc.getText(nodeId);
      };

      const deleteText = (nodeId: Id.Node): void => {
        const ytext = doc.getText(nodeId);
        ytext.delete(0, ytext.length);

        const undoManager = undoManagers.get(nodeId);
        if (undoManager) {
          undoManager.destroy();
          undoManagers.delete(nodeId);
        }
      };

      const getUndoManager = (nodeId: Id.Node): Y.UndoManager => {
        let undoManager = undoManagers.get(nodeId);
        if (!undoManager) {
          const ytext = doc.getText(nodeId);
          undoManager = new Y.UndoManager(ytext);
          undoManagers.set(nodeId, undoManager);
        }
        return undoManager;
      };

      return {
        getText,
        deleteText,
        getUndoManager,
        doc,
      };
    }),
  );
