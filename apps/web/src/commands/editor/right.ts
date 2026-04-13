import { Id } from "@/schema";
import { FrameT } from "@/services/ui/Frame";
import { EditorT } from "@/services/ui/Editor";
import { PropertyT } from "@/services/ui/Property";
import { ViewT } from "@/services/ui/View";
import { Data, Effect, Option } from "effect";
import { clearGoalX } from "./utils/clearGoalX";
import { resolveActiveKhoraContext } from "./utils/resolveActiveKhoraContext";

const scope = "editor";
const commandName = "right";
const tag = `${scope}:${commandName}` as const;

export class Right extends Data.TaggedClass(tag)<{}> {
  static readonly scope = scope;
  static readonly commandName = commandName;
  static readonly tag = tag;
  static handle = Effect.fn(tag)(function* (_cmd: Right) {
    const Editor = yield* EditorT;

    const isAtEnd = yield* Editor.isCursorAtEnd();
    if (!isAtEnd) {
      yield* Editor.moveRight();
      const ctx = yield* resolveActiveKhoraContext();
      if (Option.isSome(ctx)) yield* clearGoalX(ctx.value.frameId);
      return;
    }

    // At end of text — navigate to next block or create linked block.
    // Use Frame.getMode() directly because resolveActiveKhoraContext
    // rejects non-frame khoras (propertyTitle, section).
    const Frame = yield* FrameT;
    const mode = yield* Frame.getMode();
    if (mode.type !== "khora") return;

    const khoraId = mode.khoraId;
    const khoraCtx = Id.parseKhoraContextSync(khoraId);

    if (khoraCtx.type === "propertyTitle") {
      yield* handlePropertyTitleRight(khoraCtx);
      return;
    }

    const View = yield* ViewT;
    const targetOpt = yield* View.resolveBlockRight(khoraId);
    if (Option.isNone(targetOpt)) return;

    yield* Frame.enterKhoraEditing(targetOpt.value, {
      anchor: 0,
      head: 0,
    });
  });
}

// ================================ Internal ==================================

/**
 * Property titles sit outside outline navigation, so Right handles them here.
 * Existing linked tuples win; otherwise quick-create binds if needed and
 * creates the first linked block.
 */
const handlePropertyTitleRight = Effect.fn("Right.handlePropertyTitleRight")(
  function* (
    ctx: Extract<Id.KhoraContext, { type: "propertyTitle" }>,
  ) {
    const Property = yield* PropertyT;
    const Frame = yield* FrameT;

    const { frameId, hostNodeId, propertyId } = ctx;

    const linkedTuples = yield* Property.getLinkedTuples(propertyId, hostNodeId);

    if (linkedTuples.length > 0) {
      const targetKhoraId = Id.makePropertyKhoraId(
        frameId,
        hostNodeId,
        propertyId,
        linkedTuples[0]!.tupleId,
      );
      yield* Frame.enterKhoraEditing(targetKhoraId, { anchor: 0, head: 0 });
      return;
    }

    const { tupleId } = yield* Property.quickCreateTupleType(
      propertyId,
      hostNodeId,
    );

    const targetKhoraId = Id.makePropertyKhoraId(
      frameId,
      hostNodeId,
      propertyId,
      tupleId,
    );
    yield* Frame.enterKhoraEditing(targetKhoraId, { anchor: 0, head: 0 });
  },
);
