import { Id } from "@/schema";
import { BlockTypeDefinition } from "./types";

const definitions = new Map<Id.Node, BlockTypeDefinition>();

/**
 * Register a block type definition.
 * Should be called during app initialization before rendering.
 */
export const register = (definition: BlockTypeDefinition): void => {
  definitions.set(definition.id, definition);
};

/**
 * Get a block type definition by ID.
 * Returns undefined if no definition is registered for this type.
 */
export const get = (typeId: Id.Node): BlockTypeDefinition | undefined => {
  return definitions.get(typeId);
};

/**
 * Get all registered definitions.
 */
export const getAll = (): readonly BlockTypeDefinition[] => {
  return Array.from(definitions.values());
};

/**
 * Get definitions that have input triggers.
 * Used by TextEditor.tsx input handler.
 */
export const getWithTriggers = (): readonly BlockTypeDefinition[] => {
  return Array.from(definitions.values()).filter((d) => d.trigger != null);
};
