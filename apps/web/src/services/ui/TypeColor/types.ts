/**
 * Resolved color pair for type badge rendering.
 */
export interface TypeColors {
  readonly bg: string;
  readonly fg: string;
}

/**
 * Default color values (green hue 145) used when a type
 * doesn't have TYPE_HAS_COLOR configured.
 */
export const DEFAULT_COLORS: TypeColors = {
  bg: "oklch(0.92 0.05 145)",
  fg: "oklch(0.35 0.12 145)",
} as const;
