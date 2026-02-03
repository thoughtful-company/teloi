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
   * Schema node for types, properties, and relationship definitions.
   * - Visible children: Classification types, Properties (with PROPERTY type)
   * - Shadow children: User-defined tuple types
   * URL shortcut: /schema
   */
  SCHEMA: "workspace:schema" as Id.Node,

  // === Rendered Title System ===
  // Allows nodes to display another node's title instead of their own.

  /**
   * TupleType for rendered title links.
   * Schema: RENDERED_NAME(node: Node, source: Node, mode: Mode)
   * - Position 0: The node whose title is rendered
   * - Position 1: The node providing the title
   * - Position 2: The rendering mode (MODE_SYNCED | MODE_READONLY | MODE_DETACH)
   */
  RENDERED_NAME: "system:rendered-name" as Id.Node,

  /**
   * Mode value: Synced mode.
   * Editing the node's title edits the source's title.
   */
  MODE_SYNCED: "system:mode-synced" as Id.Node,

  /**
   * Mode value: Readonly mode.
   * Display only, cannot edit the title.
   */
  MODE_READONLY: "system:mode-readonly" as Id.Node,

  /**
   * Mode value: Detach mode.
   * Editing breaks the link, node gets its own title.
   */
  MODE_DETACH: "system:mode-detach" as Id.Node,

  // === Property System ===
  // Properties define how relationships are displayed on pages.

  /**
   * Type marker for property nodes.
   * Applied to nodes that define properties under SCHEMA.
   */
  PROPERTY: "system:property" as Id.Node,

  /**
   * TupleType linking a page to a view node.
   * Schema: HAS_VIEW(page, view)
   * - Position 0: The page node
   * - Position 1: The view node (shadow child of page)
   */
  HAS_VIEW: "system:has-view" as Id.Node,

  /**
   * TupleType linking a view to a property.
   * Schema: HAS_PROPERTY(view, property)
   * - Position 0: The view node
   * - Position 1: The property node
   */
  HAS_PROPERTY: "system:has-property" as Id.Node,

  /**
   * TupleType linking a property to its underlying tuple type.
   * Schema: PROPERTY_USES_TUPLE(property, tupleType)
   * - Position 0: The property node
   * - Position 1: The tuple type node
   */
  PROPERTY_USES_TUPLE: "system:property-uses-tuple" as Id.Node,

  /**
   * TupleType storing property position configuration.
   * Schema: PROPERTY_CONFIG(property, hostPosition, displayPosition)
   * - Position 0: The property node
   * - Position 1: Host position (POSITION_0 or POSITION_1)
   * - Position 2: Display position (POSITION_0 or POSITION_1)
   */
  PROPERTY_CONFIG: "system:property-config" as Id.Node,

  /**
   * Position value: index 0 in a tuple.
   * Used in PROPERTY_CONFIG to indicate tuple position.
   */
  POSITION_0: "system:position-0" as Id.Node,

  /**
   * Position value: index 1 in a tuple.
   * Used in PROPERTY_CONFIG to indicate tuple position.
   */
  POSITION_1: "system:position-1" as Id.Node,

  // === Chat System ===
  // Chat view displays a node's children as a conversation.

  /**
   * Meta-type for message role nodes (like BOOLEAN for TRUE/FALSE).
   */
  MESSAGE_ROLE: "system:message-role" as Id.Node,

  /**
   * Message role: system prompt. Has type MESSAGE_ROLE.
   */
  MSG_SYSTEM: "system:msg-system" as Id.Node,

  /**
   * Message role: user message. Has type MESSAGE_ROLE.
   */
  MSG_USER: "system:msg-user" as Id.Node,

  /**
   * Message role: assistant (aengel) message. Has type MESSAGE_ROLE.
   */
  MSG_AENGEL: "system:msg-aengel" as Id.Node,

  /**
   * Type applied to nodes that render as chat. Non-removable once applied.
   */
  CHAT: "system:chat" as Id.Node,

  /**
   * View type for chat views (like sys:type:table-view for tables).
   */
  CHAT_VIEW: "system:chat-view" as Id.Node,

  /**
   * TupleType linking a chat node to its messages.
   * Schema: CHAT_HAS_MESSAGE(chat, message)
   * - Position 0: The chat node
   * - Position 1: The message node
   * Message order determined by position-1 fractional index.
   */
  CHAT_HAS_MESSAGE: "system:chat-has-message" as Id.Node,
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
