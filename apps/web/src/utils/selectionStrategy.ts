import { Id } from "@/schema";
import * as IdT from "@/schema/id/id";
import { BufferT } from "@/services/ui/Buffer";
import { Effect, Option } from "effect";

/** Selection info from editor (anchor, head, assoc) */
export interface EditorSelectionInfo {
  anchor: number;
  head: number;
  assoc: -1 | 0 | 1;
}

/**
 * Update buffer selection from editor selection change.
 * Always clears goalX/goalLine since this handles "regular" selection changes
 * (typing, clicking, horizontal navigation). Vertical navigation handlers
 * set goalX explicitly via makeCollapsedSelection.
 */
export const updateEditorSelection = (
  bufferId: Id.Buffer,
  nodeId: Id.Node,
  selection: EditorSelectionInfo,
) =>
  Effect.gen(function* () {
    const Buffer = yield* BufferT;
    const elementId = IdT.makeBufferBlockId(bufferId, nodeId);

    yield* Buffer.setSelection(
      bufferId,
      Option.some({
        anchor: { elementId },
        anchorOffset: selection.anchor,
        focus: { elementId },
        focusOffset: selection.head,
        goalX: null,
        goalLine: null,
        assoc: selection.assoc,
      }),
    );
  });

/** Build a collapsed selection (anchor === focus) for Buffer.setSelection */
export const makeCollapsedSelection = (
  elementId: Id.Block,
  offset: number,
  opts?: {
    goalX?: number | null;
    goalLine?: "first" | "last" | null;
  },
) =>
  Option.some({
    anchor: { elementId },
    anchorOffset: offset,
    focus: { elementId },
    focusOffset: offset,
    goalX: opts?.goalX ?? null,
    goalLine: opts?.goalLine ?? null,
    assoc: 0 as const,
  });
