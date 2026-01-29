import { Id } from "@/schema";
import { StoreT } from "@/services/external/Store";
import { NodeT } from "@/services/domain/Node";
import { findPreviousNode } from "./navigation";
import { Effect, Option } from "effect";

export const findPreviousVisibleNode = (
  currentId: Id.Node,
  bufferId: Id.Buffer,
): Effect.Effect<Option.Option<Id.Node>, never, NodeT | StoreT> =>
  findPreviousNode(currentId, bufferId);
