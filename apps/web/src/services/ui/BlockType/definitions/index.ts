import { register } from "../registry";
import { checkboxDefinition } from "./checkbox";
import {
  header1Definition,
  header2Definition,
  header3Definition,
} from "./headers";
import { listElementDefinition } from "./listElement";

/**
 * Registers all built-in block type definitions.
 * Called once during app initialization.
 */
export const registerBuiltInTypes = (): void => {
  register(listElementDefinition);
  register(checkboxDefinition);
  register(header1Definition);
  register(header2Definition);
  register(header3Definition);
};
