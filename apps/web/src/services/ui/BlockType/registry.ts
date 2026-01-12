import { Id } from "@/schema";
import { BlockTypeDefinition, TriggerDefinition } from "./types";

const definitions = new Map<Id.Node, BlockTypeDefinition>();

/**
 * A trigger paired with its parent definition.
 * Used for iterating all triggers across all definitions.
 */
export interface TriggerWithDefinition {
  definition: BlockTypeDefinition;
  trigger: TriggerDefinition;
}

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
 * Get all triggers paired with their parent definitions.
 * Flattens definitions with multiple triggers into separate entries.
 * Used by TextEditor.tsx input handler.
 */
export const getTriggersWithDefinitions =
  (): readonly TriggerWithDefinition[] => {
    const result: TriggerWithDefinition[] = [];
    for (const definition of definitions.values()) {
      if (!definition.trigger) continue;
      const triggers = Array.isArray(definition.trigger)
        ? definition.trigger
        : [definition.trigger];
      for (const trigger of triggers) {
        result.push({ definition, trigger });
      }
    }
    return result;
  };

/**
 * Get IDs of all decorative types.
 * Decorative types are mutually exclusive - only one can be active on a node at a time.
 */
export const getDecorativeTypeIds = (): readonly Id.Node[] => {
  return Array.from(definitions.values())
    .filter((def) => def.isDecorative)
    .map((def) => def.id);
};
