import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

/**
 * Combine multiple class-value inputs into a single Tailwind-aware class string, resolving conflicts and deduplicating classes.
 *
 * @param inputs - One or more class values (strings, arrays, objects, etc.) to be merged into the final class string
 * @returns The normalized, conflict-resolved class string suitable for use in className attributes
 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}