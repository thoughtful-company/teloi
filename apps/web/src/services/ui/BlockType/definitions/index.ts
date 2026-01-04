import { register } from "../registry";
import { listElementDefinition } from "./listElement";

/**
 * Registers all built-in block type definitions.
 * Called once during app initialization.
 */
export const registerBuiltInTypes = (): void => {
  register(listElementDefinition);
};
