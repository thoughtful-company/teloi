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

  /**
   * Type for boolean value nodes.
   */
  BOOLEAN: "system:boolean" as Id.Node,

  /**
   * Boolean true value. Has type BOOLEAN.
   */
  TRUE: "system:true" as Id.Node,

  /**
   * Boolean false value. Has type BOOLEAN.
   */
  FALSE: "system:false" as Id.Node,

  /**
   * Meta-type applied to nodes that are tuple types.
   * A node with this type defines a structured relationship schema.
   */
  TUPLE_TYPE: "system:tuple-type" as Id.Node,

  /**
   * TupleType for checkbox state. Schema: IS_CHECKED(subject: Node, value: Boolean).
   * Presence of tuple with TRUE means checked, absence means unchecked.
   */
  IS_CHECKED: "system:is-checked" as Id.Node,

  /**
   * Rendering type for checkbox elements. Applied when user types "[ ]" at start of line.
   */
  CHECKBOX: "system:checkbox" as Id.Node,

  /**
   * Root node for user workspace. All user-created pages are children of this node.
   * Clicking the home icon navigates here. URL: /workspace/
   */
  WORKSPACE: "workspace:home" as Id.Node,

  /**
   * Inbox node for quick capture. URL shortcut: /inbox
   */
  INBOX: "workspace:inbox" as Id.Node,

  /**
   * The Box - general storage/archive. URL shortcut: /box
   */
  THE_BOX: "workspace:box" as Id.Node,

  /**
   * Calendar node for time-based organization. URL shortcut: /calendar
   */
  CALENDAR: "workspace:calendar" as Id.Node,
} as const;

export type SystemId = (typeof System)[keyof typeof System];
