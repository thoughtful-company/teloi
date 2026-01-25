/**
 * Navigation Handlers for ActionT.
 *
 * Shared navigation logic used by both editor mode and block selection mode:
 * - Arrow navigation at boundaries
 * - Zoom in/out
 * - Block move operations
 */

import { Id } from "@/schema";
import { makeCollapsedSelection } from "@/utils/selectionStrategy";
import { Effect, Match, Option } from "effect";
import {
  ActionResult,
  type ActionDeps,
  type InterpretContext,
  type SafeWrapper,
} from "./types";

export interface NavigationHandlers {
  handleArrowLeftAtStart: (
    ctx: InterpretContext,
  ) => Effect.Effect<ActionResult>;
  handleArrowRightAtEnd: (ctx: InterpretContext) => Effect.Effect<ActionResult>;
  handleArrowUpOnFirstLine: (
    ctx: InterpretContext,
    cursorGoalX: number,
  ) => Effect.Effect<ActionResult>;
  handleArrowDownOnLastLine: (
    ctx: InterpretContext,
    cursorGoalX: number,
  ) => Effect.Effect<ActionResult>;
  enterBlockSelectionWithExtend: (
    ctx: InterpretContext,
    direction: "up" | "down",
  ) => Effect.Effect<ActionResult>;
  handleZoomOut: (ctx: InterpretContext) => Effect.Effect<ActionResult>;
  handleMove: (
    ctx: InterpretContext,
    moveAction: "swapUp" | "swapDown" | "first" | "last",
  ) => Effect.Effect<ActionResult>;
}

export const createNavigationHandlers = (
  deps: ActionDeps,
  safe: SafeWrapper,
): NavigationHandlers => {
  const { Buffer, Block, Node, Automerge, Store, Window, Navigation } = deps;

  const handleArrowLeftAtStart = (
    ctx: InterpretContext,
  ): Effect.Effect<ActionResult> =>
    safe(
      Effect.gen(function* () {
        const { bufferId, nodeId } = ctx;

        const bufferDoc = yield* Store.getDocument("buffer", bufferId);
        const rootNodeId = Option.isSome(bufferDoc)
          ? bufferDoc.value.assignedNodeId
          : null;

        const targetOpt = yield* Block.findPreviousNode(nodeId, bufferId);
        if (Option.isNone(targetOpt)) {
          return ActionResult.handled({});
        }

        const targetNodeId = targetOpt.value;
        const targetText = yield* Automerge.getText(targetNodeId);
        const endPos = targetText.length;
        const targetBlockId = Id.makeBufferBlockId(bufferId, targetNodeId);

        yield* Buffer.setSelection(
          bufferId,
          makeCollapsedSelection(targetBlockId, endPos),
        );

        // Title is just a block - use the same activeElement type
        yield* Window.setActiveElement(
          Option.some({ type: "block" as const, id: targetBlockId }),
        );

        if (targetNodeId === rootNodeId) {
          return ActionResult.handled({
            focus: { type: "title", bufferId },
          });
        } else {
          return ActionResult.handled({
            focus: {
              type: "block",
              blockId: targetBlockId,
              selection: { anchor: endPos, head: endPos },
            },
          });
        }
      }),
    );

  const handleArrowRightAtEnd = (
    ctx: InterpretContext,
  ): Effect.Effect<ActionResult> =>
    safe(
      Effect.gen(function* () {
        const { bufferId, nodeId, isExpanded } = ctx;

        // If has visible children (expanded), go to first child
        const children = yield* Node.getNodeChildren(nodeId);
        if (children.length > 0 && isExpanded) {
          const firstChildId = children[0]!;
          const targetBlockId = Id.makeBufferBlockId(bufferId, firstChildId);
          yield* Buffer.setSelection(
            bufferId,
            makeCollapsedSelection(targetBlockId, 0),
          );
          yield* Window.setActiveElement(
            Option.some({ type: "block" as const, id: targetBlockId }),
          );
          return ActionResult.handled({
            focus: {
              type: "block",
              blockId: targetBlockId,
              selection: { anchor: 0, head: 0 },
            },
          });
        }

        // Find next node in document order
        const nextNodeOpt = yield* Block.findNextNode(nodeId);
        if (Option.isNone(nextNodeOpt)) {
          return ActionResult.handled({});
        }

        const nextNodeId = nextNodeOpt.value;
        const targetBlockId = Id.makeBufferBlockId(bufferId, nextNodeId);
        yield* Buffer.setSelection(
          bufferId,
          makeCollapsedSelection(targetBlockId, 0),
        );
        yield* Window.setActiveElement(
          Option.some({ type: "block" as const, id: targetBlockId }),
        );
        return ActionResult.handled({
          focus: {
            type: "block",
            blockId: targetBlockId,
            selection: { anchor: 0, head: 0 },
          },
        });
      }),
    );

  const handleArrowUpOnFirstLine = (
    ctx: InterpretContext,
    cursorGoalX: number,
  ): Effect.Effect<ActionResult> =>
    safe(
      Effect.gen(function* () {
        const { bufferId, nodeId } = ctx;

        // Preserve existing goalX if set
        const existingSelection = yield* Buffer.getSelection(bufferId);
        const goalX =
          Option.isSome(existingSelection) &&
          existingSelection.value.goalX != null
            ? existingSelection.value.goalX
            : cursorGoalX;

        const bufferDoc = yield* Store.getDocument("buffer", bufferId);
        const rootNodeId = Option.isSome(bufferDoc)
          ? bufferDoc.value.assignedNodeId
          : null;

        const targetOpt = yield* Block.findPreviousNode(nodeId, bufferId);
        if (Option.isNone(targetOpt)) {
          return ActionResult.handled({});
        }

        const targetNodeId = targetOpt.value;
        const targetBlockId = Id.makeBufferBlockId(bufferId, targetNodeId);
        yield* Buffer.setSelection(
          bufferId,
          makeCollapsedSelection(targetBlockId, 0, {
            goalX,
            goalLine: "last",
          }),
        );
        // NOTE: setSelection forks a daemon to set activeElement after next
        // frame, giving the selection time to propagate before TextEditor mounts.

        if (targetNodeId === rootNodeId) {
          return ActionResult.handled({
            focus: { type: "title", bufferId },
          });
        } else {
          return ActionResult.handled({
            focus: { type: "block", blockId: targetBlockId },
          });
        }
      }),
    );

  const handleArrowDownOnLastLine = (
    ctx: InterpretContext,
    cursorGoalX: number,
  ): Effect.Effect<ActionResult> =>
    safe(
      Effect.gen(function* () {
        const { bufferId, nodeId, blockId, isExpanded } = ctx;

        // Preserve existing goalX if set
        const existingSelection = yield* Buffer.getSelection(bufferId);
        const goalX =
          Option.isSome(existingSelection) &&
          existingSelection.value.goalX != null
            ? existingSelection.value.goalX
            : cursorGoalX;

        // If has visible children (expanded), go to first child
        const children = yield* Node.getNodeChildren(nodeId);
        if (children.length > 0 && isExpanded) {
          const firstChildId = children[0]!;
          const targetBlockId = Id.makeBufferBlockId(bufferId, firstChildId);
          yield* Buffer.setSelection(
            bufferId,
            makeCollapsedSelection(targetBlockId, 0, {
              goalX,
              goalLine: "first",
            }),
          );
          // NOTE: setSelection forks a daemon to set activeElement after next
          // frame, giving the selection time to propagate before TextEditor mounts.
          return ActionResult.handled({
            focus: { type: "block", blockId: targetBlockId },
          });
        }

        // Find next node in document order
        const nextNodeOpt = yield* Block.findNextNode(nodeId);
        if (Option.isNone(nextNodeOpt)) {
          // No next block - stay at current position
          const text = yield* Automerge.getText(nodeId);
          yield* Buffer.setSelection(
            bufferId,
            makeCollapsedSelection(blockId, text.length),
          );
          return ActionResult.handled({});
        }

        const nextNodeId = nextNodeOpt.value;
        const targetBlockId = Id.makeBufferBlockId(bufferId, nextNodeId);
        yield* Buffer.setSelection(
          bufferId,
          makeCollapsedSelection(targetBlockId, 0, {
            goalX,
            goalLine: "first",
          }),
        );
        // NOTE: setSelection forks a daemon to set activeElement after next
        // frame, giving the selection time to propagate before TextEditor mounts.
        return ActionResult.handled({
          focus: { type: "block", blockId: targetBlockId },
        });
      }),
    );

  const enterBlockSelectionWithExtend = (
    ctx: InterpretContext,
    _direction: "up" | "down",
  ): Effect.Effect<ActionResult> =>
    safe(
      Effect.gen(function* () {
        const { bufferId, nodeId } = ctx;

        yield* Buffer.enterBlockSelection(bufferId);
        yield* Buffer.setSelection(bufferId, Option.none());
        yield* Buffer.setBlockSelection(bufferId, [nodeId], nodeId);

        // TODO: extend selection in _direction

        return ActionResult.handled({ focus: { type: "none" } });
      }),
    );

  const handleZoomOut = (ctx: InterpretContext): Effect.Effect<ActionResult> =>
    safe(
      Effect.gen(function* () {
        const { bufferId, nodeId } = ctx;

        const bufferDoc = yield* Store.getDocument("buffer", bufferId);
        if (Option.isNone(bufferDoc) || !bufferDoc.value.assignedNodeId) {
          return ActionResult.handled({});
        }

        const rootNodeId = Id.Node.make(bufferDoc.value.assignedNodeId);
        const parentId = yield* Node.getParent(rootNodeId).pipe(
          Effect.catchTag("NodeHasNoParentError", () =>
            Effect.succeed<Id.Node | null>(null),
          ),
        );

        if (!parentId) {
          return ActionResult.handled({});
        }

        yield* Navigation.navigateTo(parentId);

        // Check if the previous root (now a block) is expanded
        const rootBlockId = Id.makeBufferBlockId(bufferId, rootNodeId);
        const isRootExpanded = yield* Block.isExpanded(rootBlockId);

        // If expanded, select the original node; if collapsed, select the root block
        const targetBlockId = isRootExpanded
          ? Id.makeBufferBlockId(bufferId, nodeId)
          : rootBlockId;

        yield* Window.setActiveElement(
          Option.some({ type: "block" as const, id: targetBlockId }),
        );

        return ActionResult.handled({
          focus: { type: "block", blockId: targetBlockId },
        });
      }),
    );

  const handleMove = (
    ctx: InterpretContext,
    moveAction: "swapUp" | "swapDown" | "first" | "last",
  ): Effect.Effect<ActionResult> =>
    safe(
      Effect.gen(function* () {
        const { bufferId, nodeId, blockId } = ctx;

        // For swap actions, check if at buffer boundary
        if (moveAction === "swapUp" || moveAction === "swapDown") {
          const parentId = yield* Node.getParent(nodeId).pipe(
            Effect.catchTag("NodeHasNoParentError", () =>
              Effect.succeed<Id.Node | null>(null),
            ),
          );
          const siblings = parentId
            ? yield* Node.getNodeChildren(parentId)
            : [];
          const index = siblings.indexOf(nodeId);
          const isAtBoundary =
            (moveAction === "swapUp" && index === 0) ||
            (moveAction === "swapDown" && index === siblings.length - 1);

          if (isAtBoundary && parentId) {
            const bufferDoc = yield* Store.getDocument("buffer", bufferId).pipe(
              Effect.orDie,
            );
            const assignedNodeId = Option.match(bufferDoc, {
              onNone: () => null,
              onSome: (doc) => doc.assignedNodeId,
            });
            if (parentId === assignedNodeId) {
              return ActionResult.handled({});
            }
          }
        }

        const moved = yield* Match.value(moveAction).pipe(
          Match.when("swapUp", () => Buffer.swap(nodeId, "up")),
          Match.when("swapDown", () => Buffer.swap(nodeId, "down")),
          Match.when("first", () => Buffer.moveToFirst(nodeId)),
          Match.when("last", () => Buffer.moveToLast(nodeId)),
          Match.exhaustive,
        );

        if (moved) {
          // Re-set selection to trigger ancestor expansion
          const selection = yield* Buffer.getSelection(bufferId);
          yield* Buffer.setSelection(bufferId, selection);
        }

        return ActionResult.handled({
          focus: { type: "block", blockId },
        });
      }),
    );

  return {
    handleArrowLeftAtStart,
    handleArrowRightAtEnd,
    handleArrowUpOnFirstLine,
    handleArrowDownOnLastLine,
    enterBlockSelectionWithExtend,
    handleZoomOut,
    handleMove,
  };
};
