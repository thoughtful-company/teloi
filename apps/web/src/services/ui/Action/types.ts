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
 * - "editor": Action from within an active text editor (has cursor context)
 * - "activation": Initial activation click on an inactive element (no cursor yet)
 * - "document": Action from document level (block selection mode, no editor focused)
 */
export type ActionSource =
  | { type: "editor"; blockId: Id.Block; cursor: CursorContext }
  | { type: "activation"; blockId: Id.Block }
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
  | { _tag: "Focus"; blockId: Id.Block; offset?: number; assoc?: -1 | 1 };

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

/**
 * Dispatch function signature for components that emit actions.
 */
export type Dispatch = (action: AppAction) => ActionResult;

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

  Focus: (blockId: Id.Block, offset?: number, assoc?: -1 | 1): AppAction =>
    offset !== undefined
      ? assoc !== undefined
        ? { _tag: "Focus", blockId, offset, assoc }
        : { _tag: "Focus", blockId, offset }
      : { _tag: "Focus", blockId },
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

// ============================================================================
// Shared Types for Handler Modules
// ============================================================================

import type { KeyboardT } from "@/services/browser/Keyboard";
import type { NodeT } from "@/services/domain/Node";
import type { TypeT } from "@/services/domain/Type";
import type { AutomergeT } from "@/services/external/Automerge";
import type { StoreT } from "@/services/external/Store";
import type { BlockT } from "@/services/ui/Block";
import type { BlockTypeDefinition } from "@/services/ui/BlockType";
import type { BufferT, EditorMode } from "@/services/ui/Buffer";
import type { NavigationT } from "@/services/ui/Navigation";
import type { PickerT, PickerState } from "@/services/ui/Picker";
import type { TitleT } from "@/services/ui/Title";
import type { TypePickerT } from "@/services/ui/TypePicker";
import type { WindowT } from "@/services/ui/Window";
import type { Effect } from "effect";

/**
 * Dependencies injected into handler modules.
 * Captured at layer composition time.
 */
export interface ActionDeps {
  Keyboard: typeof KeyboardT.Service;
  Buffer: typeof BufferT.Service;
  Block: typeof BlockT.Service;
  Node: typeof NodeT.Service;
  Type: typeof TypeT.Service;
  Picker: typeof PickerT.Service;
  Title: typeof TitleT.Service;
  TypePicker: typeof TypePickerT.Service;
  Window: typeof WindowT.Service;
  Automerge: typeof AutomergeT.Service;
  Store: typeof StoreT.Service;
  Navigation: typeof NavigationT.Service;
}

/**
 * Context for action interpretation.
 * Built from source + model state lookups.
 */
export interface InterpretContext {
  /** Parsed source information */
  bufferId: Id.Buffer;
  nodeId: Id.Node;
  blockId: Id.Block;
  /** Whether this is the title (nodeId == buffer's assignedNodeId) */
  isTitle: boolean;
  /** Active type definitions for this block */
  activeDefinitions: readonly BlockTypeDefinition[];
  /** Whether picker is open for this block */
  pickerOpen: boolean;
  /** Picker state if open */
  pickerState: PickerState | null;
  /** Whether block is expanded */
  isExpanded: boolean;
  /** Current editor mode */
  mode: EditorMode;
}

/**
 * Wrapper function type for error handling.
 */
export type SafeWrapper = <A>(
  effect: Effect.Effect<A, unknown, unknown>,
) => Effect.Effect<A>;
