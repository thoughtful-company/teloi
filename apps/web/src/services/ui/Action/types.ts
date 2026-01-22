/**
 * Primitive Action Types for TEA-Inspired ActionT Service.
 *
 * Components emit what happened (KeyDown, Click, Blur), not what it means
 * (BackspaceAtStart, Navigate). Interpretation happens in ActionT with full
 * model context.
 *
 * Design principles:
 * - Actions are primitive (raw events + source context)
 * - Single ActionT service interprets meaning based on model state
 * - All action handling is synchronous (runSync for preventDefault)
 */

import { Id } from "@/schema";

// ============================================================================
// Modifiers
// ============================================================================

export interface Modifiers {
  meta: boolean;
  ctrl: boolean;
  alt: boolean;
  shift: boolean;
}

// ============================================================================
// Cursor Context (captured from CodeMirror at event time)
// ============================================================================

export interface CursorContext {
  /** Character position of cursor */
  position: number;
  /** Selection anchor position */
  anchor: number;
  /** Selection head position */
  head: number;
  /** Whether cursor is at document start (anchor === 0 && head === 0) */
  atStart: boolean;
  /** Whether cursor is at document end (anchor === docLen && head === docLen) */
  atEnd: boolean;
  /** Text before cursor position */
  textBefore: string;
  /** Text after cursor position */
  textAfter: string;
  /** Full document text */
  docText: string;
  /** Line information */
  lineInfo: {
    /** Current line number (0-indexed) */
    line: number;
    /** Total number of lines */
    totalLines: number;
    /** Whether cursor is on first visual line */
    atFirstLine: boolean;
    /** Whether cursor is on last visual line */
    atLastLine: boolean;
    /** Column position on current line */
    column: number;
  };
  /** Cursor coordinates in viewport (for picker positioning) */
  coords: { x: number; y: number } | null;
  /** Preserved goalX for vertical navigation */
  goalX: number | null;
  /** Cursor association at wrap boundaries: -1 = end of prev line, 1 = start of next line */
  assoc: -1 | 0 | 1;
}

// ============================================================================
// Selection Info (for selection change events)
// ============================================================================

export interface SelectionInfo {
  anchor: number;
  head: number;
  /** Cursor association at wrap boundaries */
  assoc: -1 | 0 | 1;
}

// ============================================================================
// Action Source Context
// ============================================================================

/**
 * Where the action originated from.
 *
 * - "editor": Action from a text editor (Block or Title)
 * - "document": Action from document level (block selection mode, no editor focused)
 */
export type ActionSource =
  | { type: "editor"; blockId: Id.Block; cursor: CursorContext }
  | { type: "document"; bufferId: Id.Buffer };

// ============================================================================
// Primitive Actions
// ============================================================================

/**
 * Primitive actions emitted by components.
 * These are raw events with source context - interpretation happens in ActionT.
 */
export type AppAction =
  | { _tag: "KeyDown"; key: string; modifiers: Modifiers; source: ActionSource }
  | { _tag: "Click"; coords: { x: number; y: number }; source: ActionSource }
  | {
      _tag: "SelectionChange";
      selection: SelectionInfo;
      source: ActionSource;
    }
  | { _tag: "Blur"; source: ActionSource }
  | { _tag: "Focus"; source: ActionSource };

// ============================================================================
// Action Result
// ============================================================================

/**
 * Focus target for DOMIntent.
 */
export type FocusTarget =
  | { type: "title"; bufferId: Id.Buffer }
  | {
      type: "block";
      blockId: Id.Block;
      selection?: { anchor: number; head: number };
    }
  | { type: "none" };

/**
 * DOM operations to perform after action handling.
 * Components execute these imperatively after ActionT.handle() returns.
 */
export interface DOMIntent {
  /** Focus target (title, block, or clear focus) */
  focus?: FocusTarget;
  /** Block to scroll into view */
  scroll?: Id.Block;
  /** Whether to blur current element */
  blur?: boolean;
}

/**
 * Result of action handling.
 *
 * - handled: true means the action was processed and the event should be prevented
 * - handled: false means the action was not processed and native behavior should proceed
 */
export type ActionResult =
  | { handled: true; intent: DOMIntent }
  | { handled: false };

// ============================================================================
// Helper Constructors
// ============================================================================

export const AppAction = {
  KeyDown: (
    key: string,
    modifiers: Modifiers,
    source: ActionSource,
  ): AppAction => ({
    _tag: "KeyDown",
    key,
    modifiers,
    source,
  }),

  Click: (
    coords: { x: number; y: number },
    source: ActionSource,
  ): AppAction => ({
    _tag: "Click",
    coords,
    source,
  }),

  SelectionChange: (
    selection: SelectionInfo,
    source: ActionSource,
  ): AppAction => ({
    _tag: "SelectionChange",
    selection,
    source,
  }),

  Blur: (source: ActionSource): AppAction => ({
    _tag: "Blur",
    source,
  }),

  Focus: (source: ActionSource): AppAction => ({
    _tag: "Focus",
    source,
  }),
} as const;

export const ActionResult = {
  handled: (intent: DOMIntent = {}): ActionResult => ({
    handled: true,
    intent,
  }),

  notHandled: (): ActionResult => ({
    handled: false,
  }),
} as const;
