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
   * Meta-type for color nodes. A node with this type represents a color definition.
   */
  COLOR: "system:color" as Id.Node,

  /**
   * TupleType linking a color node to its background CSS value.
   * Schema: COLOR_HAS_BACKGROUND(color: Node, value: Node)
   */
  COLOR_HAS_BACKGROUND: "system:color-has-background" as Id.Node,

  /**
   * TupleType linking a color node to its foreground CSS value.
   * Schema: COLOR_HAS_FOREGROUND(color: Node, value: Node)
   */
  COLOR_HAS_FOREGROUND: "system:color-has-foreground" as Id.Node,

  /**
   * TupleType linking a type node to its display color.
   * Schema: TYPE_HAS_COLOR(type: Node, color: Node)
   * If color is a full color node (has COLOR_HAS_BACKGROUND/FOREGROUND), use those values.
   * If color is a direct value node, treat as background and derive foreground.
   */
  TYPE_HAS_COLOR: "system:type-has-color" as Id.Node,

  /**
   * Default color for type badges (green hue 145).
   * Used when a type doesn't have TYPE_HAS_COLOR configured.
   */
  DEFAULT_TYPE_COLOR: "system:default-type-color" as Id.Node,

  /**
   * Value node storing the default background CSS value: oklch(0.92 0.05 145)
   */
  DEFAULT_TYPE_COLOR_BG: "system:default-type-color-bg" as Id.Node,

  /**
   * Value node storing the default foreground CSS value: oklch(0.35 0.12 145)
   */
  DEFAULT_TYPE_COLOR_FG: "system:default-type-color-fg" as Id.Node,

  // === Color Palette for Auto-Assignment ===
  // These colors are randomly assigned to user-created types.
  // Each has _BG and _FG value nodes linked via tuples.

  /** Blue color (hue 250) */
  COLOR_BLUE: "system:color-blue" as Id.Node,
  COLOR_BLUE_BG: "system:color-blue-bg" as Id.Node,
  COLOR_BLUE_FG: "system:color-blue-fg" as Id.Node,

  /** Purple color (hue 300) */
  COLOR_PURPLE: "system:color-purple" as Id.Node,
  COLOR_PURPLE_BG: "system:color-purple-bg" as Id.Node,
  COLOR_PURPLE_FG: "system:color-purple-fg" as Id.Node,

  /** Pink color (hue 350) */
  COLOR_PINK: "system:color-pink" as Id.Node,
  COLOR_PINK_BG: "system:color-pink-bg" as Id.Node,
  COLOR_PINK_FG: "system:color-pink-fg" as Id.Node,

  /** Orange color (hue 70) */
  COLOR_ORANGE: "system:color-orange" as Id.Node,
  COLOR_ORANGE_BG: "system:color-orange-bg" as Id.Node,
  COLOR_ORANGE_FG: "system:color-orange-fg" as Id.Node,

  /** Teal color (hue 180) */
  COLOR_TEAL: "system:color-teal" as Id.Node,
  COLOR_TEAL_BG: "system:color-teal-bg" as Id.Node,
  COLOR_TEAL_FG: "system:color-teal-fg" as Id.Node,

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

  /**
   * Types node for user-created types. URL shortcut: /types
   */
  TYPES: "workspace:types" as Id.Node,
} as const;

export type SystemId = (typeof System)[keyof typeof System];

/**
 * Color palette for auto-assignment to user-created types.
 * Includes DEFAULT_TYPE_COLOR (green) plus 5 additional colors.
 */
export const COLOR_PALETTE = [
  System.DEFAULT_TYPE_COLOR, // Green (145)
  System.COLOR_BLUE, // Blue (250)
  System.COLOR_PURPLE, // Purple (300)
  System.COLOR_PINK, // Pink (350)
  System.COLOR_ORANGE, // Orange (70)
  System.COLOR_TEAL, // Teal (180)
] as const;
