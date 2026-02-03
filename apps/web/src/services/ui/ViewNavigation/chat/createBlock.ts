import { events } from "@/livestore/schema";
import { Id, System } from "@/schema";
import { TupleT } from "@/services/domain/Tuple";
import { TypeT } from "@/services/domain/Type";
import { StoreT } from "@/services/external/Store";
import { Effect, Option } from "effect";
import { generateKeyBetween } from "fractional-indexing";
import { nanoid } from "nanoid";

/**
 * Chat view createBlock: creates a message node in a chat.
 *
 * Creates a child node of the chat + a CHAT_HAS_MESSAGE tuple with a
 * fractional index computed relative to existing messages.
 *
 * Title context (nodeId === buffer's assignedNodeId):
 * - No messages: assigns msg:user type, appends as first message
 * - Messages exist: prepends before first message, inherits first message's role type
 *
 * Block context (nodeId is a sibling message):
 * - Inserts before/after the given message in tuple ordering
 * - No auto-type assignment
 */
export const createBlock = (
  nodeId: Id.Node,
  bufferId: Id.Buffer,
  position: "before" | "after",
) =>
  Effect.gen(function* () {
    const Store = yield* StoreT;
    const Tuple = yield* TupleT;
    const Type = yield* TypeT;

    const bufferDoc = yield* Store.getDocument("buffer", bufferId);
    const chatNodeId = Option.isSome(bufferDoc)
      ? (bufferDoc.value.assignedNodeId as Id.Node | null)
      : null;

    if (!chatNodeId) {
      return yield* Effect.die(
        new Error(`Buffer ${bufferId} has no assigned node`),
      );
    }

    const isTitle = nodeId === chatNodeId;

    const newNodeId = Id.Node.make(nanoid());
    yield* Store.commit(
      events.nodeCreated({
        timestamp: Date.now(),
        data: { nodeId: newNodeId, parentId: chatNodeId, position: "" },
      }),
    );

    const existingTuples = yield* Tuple.findByPosition(
      System.CHAT_HAS_MESSAGE,
      0,
      chatNodeId,
      1,
    );

    const newIdx = yield* computeFractionalIndex(
      nodeId,
      isTitle,
      position,
      existingTuples,
    );

    yield* Tuple.create(
      System.CHAT_HAS_MESSAGE,
      [chatNodeId, newNodeId],
      ["", newIdx],
    );

    if (isTitle) {
      if (existingTuples.length === 0) {
        yield* Type.addType(newNodeId, System.MSG_USER);
      } else {
        const firstMessageNodeId = existingTuples[0]!.members[1]!;
        const firstMessageTypes = yield* Type.getTypes(firstMessageNodeId);
        const roleType = firstMessageTypes.find(isMessageRoleType);
        if (roleType) {
          yield* Type.addType(newNodeId, roleType);
        }
      }
    }

    yield* Effect.logDebug("[Chat.createBlock] Message created").pipe(
      Effect.annotateLogs({
        chatNodeId,
        newNodeId,
        isTitle,
        position,
      }),
    );

    return newNodeId;
  });

// ================================ Internal ==================================

const MESSAGE_ROLE_TYPES: ReadonlySet<Id.Node> = new Set([
  System.MSG_SYSTEM,
  System.MSG_USER,
  System.MSG_AENGEL,
]);

const isMessageRoleType = (typeId: Id.Node): boolean =>
  MESSAGE_ROLE_TYPES.has(typeId);

const computeFractionalIndex = (
  nodeId: Id.Node,
  isTitle: boolean,
  position: "before" | "after",
  existingTuples: readonly {
    members: readonly Id.Node[];
    memberFractionalIndices: readonly string[];
  }[],
) =>
  Effect.gen(function* () {
    if (isTitle) {
      const firstIdx =
        existingTuples.length > 0
          ? existingTuples[0]!.memberFractionalIndices[1]!
          : null;
      return generateKeyBetween(null, firstIdx);
    }

    const siblingIdx = existingTuples.findIndex((t) => t.members[1] === nodeId);

    if (siblingIdx === -1) {
      const lastIdx =
        existingTuples.length > 0
          ? existingTuples[existingTuples.length - 1]!
              .memberFractionalIndices[1]!
          : null;
      return generateKeyBetween(lastIdx, null);
    }

    const siblingFractionalIdx =
      existingTuples[siblingIdx]!.memberFractionalIndices[1]!;

    if (position === "after") {
      const nextIdx =
        siblingIdx + 1 < existingTuples.length
          ? existingTuples[siblingIdx + 1]!.memberFractionalIndices[1]!
          : null;
      return generateKeyBetween(siblingFractionalIdx, nextIdx);
    } else {
      const prevIdx =
        siblingIdx > 0
          ? existingTuples[siblingIdx - 1]!.memberFractionalIndices[1]!
          : null;
      return generateKeyBetween(prevIdx, siblingFractionalIdx);
    }
  });
