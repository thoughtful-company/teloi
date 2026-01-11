import { Id } from "@/schema";
import { Context, Effect, Layer } from "effect";
import * as Y from "yjs";

/** Delta format for Y.Text operations - compatible with Quill/Yjs delta format */
export interface TextDelta {
  insert: string;
  attributes?: TextAttributes;
}

/** Formatting attributes for text marks */
export interface TextAttributes {
  bold?: true | null;
  // Future marks: italic?: true | null; code?: true | null;
}

/** Active marks at a position (null values filtered out) */
export interface ActiveMarks {
  bold?: true;
  // Future: italic?: true; code?: true;
}

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

    /** Apply formatting attributes to a range of text */
    applyFormat: (
      nodeId: Id.Node,
      index: number,
      length: number,
      attrs: TextAttributes,
    ) => Effect.Effect<void>;

    /** Remove formatting attributes from a range (pass null for attribute value) */
    removeFormat: (
      nodeId: Id.Node,
      index: number,
      length: number,
      attrs: TextAttributes,
    ) => Effect.Effect<void>;

    /** Get active marks at a cursor position */
    getMarksAt: (
      nodeId: Id.Node,
      position: number,
    ) => Effect.Effect<ActiveMarks>;

    /** Get deltas with formatting for a range (used in split/merge to preserve formatting) */
    getDeltasWithFormats: (
      nodeId: Id.Node,
      index: number,
      length: number,
    ) => Effect.Effect<TextDelta[]>;

    /** Insert deltas with formatting at a position (used in split/merge to preserve formatting) */
    insertWithFormats: (
      nodeId: Id.Node,
      position: number,
      deltas: TextDelta[],
    ) => Effect.Effect<void>;
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

      const applyFormat = (
        nodeId: Id.Node,
        index: number,
        length: number,
        attrs: TextAttributes,
      ): Effect.Effect<void> =>
        Effect.sync(() => {
          const ytext = doc.getText(nodeId);
          ytext.format(index, length, attrs);
        });

      const removeFormat = (
        nodeId: Id.Node,
        index: number,
        length: number,
        attrs: TextAttributes,
      ): Effect.Effect<void> =>
        Effect.sync(() => {
          const ytext = doc.getText(nodeId);
          ytext.format(index, length, attrs);
        });

      const getMarksAt = (
        nodeId: Id.Node,
        position: number,
      ): Effect.Effect<ActiveMarks> =>
        Effect.sync(() => {
          const ytext = doc.getText(nodeId);
          const deltas = ytext.toDelta() as TextDelta[];

          let currentPos = 0;
          for (const delta of deltas) {
            const deltaLength = delta.insert.length;
            if (position >= currentPos && position < currentPos + deltaLength) {
              // Found the delta containing this position
              const marks: ActiveMarks = {};
              if (delta.attributes?.bold === true) {
                marks.bold = true;
              }
              return marks;
            }
            currentPos += deltaLength;
          }

          return {};
        });

      const getDeltasWithFormats = (
        nodeId: Id.Node,
        index: number,
        length: number,
      ): Effect.Effect<TextDelta[]> =>
        Effect.sync(() => {
          const ytext = doc.getText(nodeId);
          const allDeltas = ytext.toDelta() as TextDelta[];

          const result: TextDelta[] = [];
          let currentPos = 0;
          const endPos = index + length;

          for (const delta of allDeltas) {
            const deltaLength = delta.insert.length;
            const deltaEnd = currentPos + deltaLength;

            // Skip deltas entirely before the range
            if (deltaEnd <= index) {
              currentPos = deltaEnd;
              continue;
            }

            // Stop if we've passed the range
            if (currentPos >= endPos) {
              break;
            }

            // Calculate overlap
            const overlapStart = Math.max(currentPos, index);
            const overlapEnd = Math.min(deltaEnd, endPos);
            const slice = delta.insert.slice(
              overlapStart - currentPos,
              overlapEnd - currentPos,
            );

            if (slice.length > 0) {
              const newDelta: TextDelta = { insert: slice };
              if (delta.attributes) {
                newDelta.attributes = delta.attributes;
              }
              result.push(newDelta);
            }

            currentPos = deltaEnd;
          }

          return result;
        });

      const insertWithFormats = (
        nodeId: Id.Node,
        position: number,
        deltas: TextDelta[],
      ): Effect.Effect<void> =>
        Effect.sync(() => {
          const ytext = doc.getText(nodeId);
          let insertPos = position;

          for (const delta of deltas) {
            // Always pass attributes to prevent inheriting from adjacent formatted text.
            // When no attributes, pass explicit null values to clear any inherited formatting.
            const attrs = delta.attributes ?? { bold: null };
            ytext.insert(insertPos, delta.insert, attrs);
            insertPos += delta.insert.length;
          }
        });

      return {
        getText,
        deleteText,
        getUndoManager,
        doc,
        applyFormat,
        removeFormat,
        getMarksAt,
        getDeltasWithFormats,
        insertWithFormats,
      };
    }),
  );
