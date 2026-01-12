import { BrowserRequirements } from "@/runtime";
import { Id } from "@/schema";
import { Effect } from "effect";
import { JSX } from "solid-js";

/**
 * Defines an input trigger that converts a plain block to a typed block.
 */
export interface TriggerDefinition {
  /**
   * Pattern to match at start of document before space is typed.
   * e.g., /^-$/ matches "-" (triggered by typing "- ")
   */
  pattern: RegExp;
  /**
   * Number of characters to delete when triggered.
   * Single number or array of possible lengths to try.
   * For "- " trigger: consume = 1 (deletes the "-")
   * For checkbox: consume = [2, 3] (accepts both "[]" and "[ ]")
   */
  consume: number | readonly number[];
  /**
   * Additional effect to run after the type is added.
   * Used for triggers that need to do more than just add a type.
   * e.g., "[x] " trigger adds CHECKBOX type AND creates IS_CHECKED tuple.
   *
   * Run via runtime.runPromise which provides all services.
   */
  onTrigger?: (
    nodeId: Id.Node,
  ) => Effect.Effect<void, never, BrowserRequirements>;
}

/**
 * Defines the behavior and rendering for a block type.
 * Used by Block.tsx to determine how to render and handle input for typed blocks.
 */
export interface BlockTypeDefinition {
  /** The system type ID (e.g., System.LIST_ELEMENT) */
  id: Id.Node;

  /**
   * Decorative types are mutually exclusive - only one can be active on a node at a time.
   * When a new decorative type is triggered, any existing decorative type is replaced.
   * e.g., list bullets and checkboxes are decorative; user-created types (#tags) are not.
   */
  isDecorative?: boolean;

  /**
   * Renders a decoration before the block content (e.g., bullet point, checkbox).
   * Return null to render nothing. Only the first active type with a decoration is rendered.
   */
  renderDecoration?: (props: { nodeId: Id.Node }) => JSX.Element | null;

  /**
   * Input trigger(s) that convert a plain block to this type.
   * When matched at document start and space is typed, the pattern is consumed and the type is added.
   * Can be a single trigger or array of triggers (e.g., checkbox has both "[]" and "[x]" triggers).
   */
  trigger?: TriggerDefinition | readonly TriggerDefinition[];

  /** Enter key behavior */
  enter?: {
    /**
     * If true, new block created by Enter inherits this type.
     * e.g., list items propagate to continue the list.
     */
    propagateToNewBlock?: boolean;
    /**
     * If true, pressing Enter on empty block removes this type instead of creating new block.
     * e.g., empty list item converts back to plain paragraph.
     */
    removeOnEmpty?: boolean;
  };

  /** Backspace key behavior */
  backspace?: {
    /**
     * If true, Backspace at start of block removes this type instead of merging.
     * e.g., list item at start converts to plain text.
     */
    removeTypeAtStart?: boolean;
  };
}
