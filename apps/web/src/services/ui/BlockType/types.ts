import { Id } from "@/schema";
import { JSX } from "solid-js";

/**
 * Defines the behavior and rendering for a block type.
 * Used by Block.tsx to determine how to render and handle input for typed blocks.
 */
export interface BlockTypeDefinition {
  /** The system type ID (e.g., System.LIST_ELEMENT) */
  id: Id.Node;

  /**
   * Renders a decoration before the block content (e.g., bullet point, checkbox).
   * Return null to render nothing. Only the first active type with a decoration is rendered.
   */
  renderDecoration?: (props: { nodeId: Id.Node }) => JSX.Element | null;

  /**
   * Input trigger that converts a plain block to this type.
   * When matched at document start and space is typed, the pattern is consumed and the type is added.
   */
  trigger?: {
    /**
     * Pattern to match at start of document before space is typed.
     * e.g., /^-$/ matches "-" (triggered by typing "- ")
     */
    pattern: RegExp;
    /**
     * Number of characters to delete when triggered.
     * For "- " trigger: consume = 1 (deletes the "-")
     */
    consume: number;
  };

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
