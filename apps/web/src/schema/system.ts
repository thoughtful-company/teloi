import { Id } from "./id";

/**
 * System node IDs.
 * These nodes are created on bootstrap and serve as the type system foundation.
 * They are visible in the UI as living documentation.
 */
export const System = {
  /**
   * Parent node for all system nodes. Visible in sidebar as "System".
   */
  ROOT: "system:root" as Id.Node,

  /**
   * Meta-type applied to nodes that are rendering types.
   * A node with this type affects how other nodes are rendered.
   */
  RENDERING_TYPE: "system:rendering-type" as Id.Node,

  /**
   * Rendering type for list elements. Applied when user types "- " at start of line.
   */
  LIST_ELEMENT: "system:list-element" as Id.Node,
} as const;

export type SystemId = (typeof System)[keyof typeof System];
