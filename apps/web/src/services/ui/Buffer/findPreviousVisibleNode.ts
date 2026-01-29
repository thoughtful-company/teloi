import { Id } from "@/schema";
import { findPreviousNode } from "./navigation";

export const findPreviousVisibleNode = (
  currentId: Id.Node,
  bufferId: Id.Buffer,
) => findPreviousNode(currentId, bufferId);
