import type { Id } from "@/schema";
import { resolveNeighbor } from "./resolveNeighbor";

export const resolveBelow = (nodeId: Id.Node, bufferId: Id.Buffer) =>
  resolveNeighbor(nodeId, bufferId, 1);
