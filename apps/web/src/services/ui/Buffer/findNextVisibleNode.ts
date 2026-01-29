import { Id } from "@/schema";
import { findNextNodeInDocumentOrder } from "./navigation";

export const findNextVisibleNode = (currentId: Id.Node, bufferId: Id.Buffer) =>
  findNextNodeInDocumentOrder(currentId, bufferId);
