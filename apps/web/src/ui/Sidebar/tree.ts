// Shared tree visuals for the Home view, mapped from the prototype's
// .tree-* rules (docs/app-redesign.md §7). Kept here so system rows and page
// rows can't drift apart.

/** Scrollable Home pane: 12px side gutter (--sb-pad-x), top/bottom breathing room. */
export const TREE_PANE = "flex-1 overflow-y-auto px-3 pb-4 pt-1";

/** Uppercase section header (--c-faint → text-placeholder). */
export const TREE_SECT =
  "flex items-center gap-1.5 select-none pl-1 pr-2 pt-3.5 pb-1 text-sm font-label uppercase tracking-[0.04em] text-text-placeholder";

/**
 * 30px clickable row. Resting text/icon are `secondary` (chrome); hover/active
 * rise to `primary` + the soft black washes (surface-hover/active). The leading
 * icon inherits this `currentColor` (see TREE_ICON) so icon and label always match.
 */
export const TREE_ROW =
  "group/row relative flex h-[30px] w-full items-center rounded-md pr-2 text-left text-sm font-label text-text-secondary hover:bg-surface-hover hover:text-text-primary";

/** 12px twist column + 2px gap, giving leaf rows the same indent as folders. */
export const TREE_TWIST_SPACER = "mr-0.5 w-3 shrink-0";

/** Row leading icon. Color is inherited from the row (currentColor) so it tracks
 * the row's resting/hover/active text color in lockstep. */
export const TREE_ICON = "mr-1.5 size-5 shrink-0";
