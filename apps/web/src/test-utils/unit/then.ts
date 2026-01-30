import { Id } from "@/schema";
import { BufferT } from "@/services/ui/Buffer";
import type { EditorTestHandle } from "@/services/ui/Editor/test";
import { Effect, Option } from "effect";
import { expect } from "vitest";

export const SELECTION_ON_BLOCK = (
  expectedBlockId: Id.Block,
  expectedOffset: number,
) =>
  Effect.gen(function* () {
    const [bufferId] = yield* Id.parseBlockId(expectedBlockId);
    const Buffer = yield* BufferT;
    const selection = yield* Buffer.getSelection(bufferId);

    expect(
      Option.isSome(selection),
      "Selection should exist after navigation",
    ).toBe(true);

    if (Option.isSome(selection)) {
      expect(
        selection.value.focus.elementId,
        `Selection should be on block ${expectedBlockId}`,
      ).toBe(expectedBlockId);
      expect(
        selection.value.focusOffset,
        `Cursor should be at offset ${expectedOffset}`,
      ).toBe(expectedOffset);
    }
  }).pipe(Effect.withSpan("Then.SELECTION_ON_BLOCK"));

export const SELECTION_NOT_ON_BLOCK = (blockId: Id.Block) =>
  Effect.gen(function* () {
    const [bufferId] = yield* Id.parseBlockId(blockId);
    const Buffer = yield* BufferT;
    const selection = yield* Buffer.getSelection(bufferId);

    expect(Option.isSome(selection), "Selection should exist").toBe(true);

    if (Option.isSome(selection)) {
      expect(
        selection.value.focus.elementId,
        `Selection should NOT be on block ${blockId}`,
      ).not.toBe(blockId);
    }
  }).pipe(Effect.withSpan("Then.SELECTION_NOT_ON_BLOCK"));

export const SELECTION_ON_TITLE = (
  bufferId: Id.Buffer,
  rootNodeId: Id.Node,
  expectedOffset: number,
) =>
  Effect.gen(function* () {
    const Buffer = yield* BufferT;
    const selection = yield* Buffer.getSelection(bufferId);
    const titleBlockId = Id.makeBufferBlockId(bufferId, rootNodeId);

    expect(
      Option.isSome(selection),
      "Selection should exist after navigation",
    ).toBe(true);

    if (Option.isSome(selection)) {
      expect(
        selection.value.focus.elementId,
        "Selection should be on title block",
      ).toBe(titleBlockId);
      expect(
        selection.value.focusOffset,
        `Cursor should be at offset ${expectedOffset}`,
      ).toBe(expectedOffset);
    }
  }).pipe(Effect.withSpan("Then.SELECTION_ON_TITLE"));

export const MOVE_LEFT_WAS_CALLED = (editor: EditorTestHandle) =>
  Effect.gen(function* () {
    const called = yield* editor.getMoveLeftCalled();
    expect(called, "moveLeft() should have been called").toBe(true);
  }).pipe(Effect.withSpan("Then.MOVE_LEFT_WAS_CALLED"));

export const MOVE_RIGHT_WAS_CALLED = (editor: EditorTestHandle) =>
  Effect.gen(function* () {
    const called = yield* editor.getMoveRightCalled();
    expect(called, "moveRight() should have been called").toBe(true);
  }).pipe(Effect.withSpan("Then.MOVE_RIGHT_WAS_CALLED"));

export const MOVE_UP_WAS_CALLED = (editor: EditorTestHandle) =>
  Effect.gen(function* () {
    const called = yield* editor.getMoveUpCalled();
    expect(called, "moveUp() should have been called").toBe(true);
  }).pipe(Effect.withSpan("Then.MOVE_UP_WAS_CALLED"));

export const MOVE_DOWN_WAS_CALLED = (editor: EditorTestHandle) =>
  Effect.gen(function* () {
    const called = yield* editor.getMoveDownCalled();
    expect(called, "moveDown() should have been called").toBe(true);
  }).pipe(Effect.withSpan("Then.MOVE_DOWN_WAS_CALLED"));

export const MOVE_HOME_WAS_CALLED = (editor: EditorTestHandle) =>
  Effect.gen(function* () {
    const called = yield* editor.getMoveHomeCalled();
    expect(called, "moveHome() should have been called").toBe(true);
  }).pipe(Effect.withSpan("Then.MOVE_HOME_WAS_CALLED"));

export const MOVE_END_WAS_CALLED = (editor: EditorTestHandle) =>
  Effect.gen(function* () {
    const called = yield* editor.getMoveEndCalled();
    expect(called, "moveEnd() should have been called").toBe(true);
  }).pipe(Effect.withSpan("Then.MOVE_END_WAS_CALLED"));

export const SELECTION_HAS_GOAL = (
  blockId: Id.Block,
  expected: { goalX?: number; goalLine?: "first" | "last" },
) =>
  Effect.gen(function* () {
    const [bufferId] = yield* Id.parseBlockId(blockId);
    const Buffer = yield* BufferT;
    const selection = yield* Buffer.getSelection(bufferId);

    expect(Option.isSome(selection), "Selection should exist").toBe(true);

    if (Option.isSome(selection)) {
      if (expected.goalX !== undefined) {
        expect(selection.value.goalX, `goalX should be ${expected.goalX}`).toBe(
          expected.goalX,
        );
      }
      if (expected.goalLine !== undefined) {
        expect(
          selection.value.goalLine,
          `goalLine should be "${expected.goalLine}"`,
        ).toBe(expected.goalLine);
      }
    }
  }).pipe(Effect.withSpan("Then.SELECTION_HAS_GOAL"));
