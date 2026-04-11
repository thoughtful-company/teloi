# Navigation

This document explains how cursor and block navigation works across the document tree.

## Visual Document Order

Both text cursor navigation and block selection navigation follow **visual document order** - the order blocks appear on screen, reading top to bottom. This creates a consistent mental model regardless of which mode you're in.

```
Document structure:              Visual order (top to bottom):

┌─ A                             1. A
│  ├─ A1                         2. A1
│  │  └─ A1a                     3. A1a
│  └─ A2                         4. A2
├─ B                             5. B
│  └─ B1                         6. B1
└─ C                             7. C
```

Collapsed blocks are treated as leaf nodes - their hidden children are skipped entirely.

## Text Cursor Navigation

When editing text inside a block, arrow keys first move within the block's content. At boundaries:

**ArrowUp** (cursor on first visual line):
- Move to previous block in document order
- Cursor lands on last line of target block, preserving horizontal position (goalX)

**ArrowDown** (cursor on last visual line):
- Move to next block in document order
- Cursor lands on first line of target block, preserving goalX

**ArrowLeft** (cursor at position 0):
- Move to end of previous block

**ArrowRight** (cursor at end of text):
- Move to start of next block (or first child if expanded)

## Block Selection Navigation

Enter block selection mode by pressing `Escape` while editing text, or by using `Shift+Arrow` at text boundaries or by clicking somewhere on the frame and pressing `ArrowUp/Down`.

### Plain Arrow Keys

Navigate to the visually adjacent block, crossing parent/child boundaries:

| Key | Behavior |
|-----|----------|
| ArrowUp | Previous in document order (parent if first child, else prev sibling's deepest visible descendant) |
| ArrowDown | Next in document order (first child if expanded, else next sibling or ancestor's next sibling) |
| ArrowLeft | Select parent block |
| ArrowRight | Select first child (if any) |

**Edge cases:**
- ArrowUp at first block in document: scroll to top, keep selection
- ArrowDown at last block in document: no movement
- Collapsed blocks: children are skipped, treated as leaf nodes

### Shift+Arrow Keys (Range Selection)

Extend selection to adjacent **siblings only**:

- `Shift+ArrowUp/Down` - Extend/contract selection within current sibling group
- Selection forms a contiguous range from anchor (where you started) to focus (current position)

Cross-parent range selection is not yet supported - the selection stays within siblings.

## Navigation Helpers

Implementation in `services/ui/View/page/navigation.ts`:

| Function | Purpose |
|----------|---------|
| `findPreviousNode(nodeId, frameId)` | Previous block in document order. Returns parent if first child, else prev sibling's deepest visible descendant. |
| `findNextNodeInDocumentOrder(nodeId, frameId)` | Next block in document order. Descends into first child if expanded, else finds next sibling or climbs up. |
| `findNextNode(nodeId)` | Next sibling or ancestor's next sibling (no child descent). Used for text cursor "ArrowRight at end". |
| `findDeepestLastChild(nodeId, frameId)` | Deepest visible descendant. Used when landing on previous sibling. |
| `isBlockExpanded(frameId, nodeId)` | Check if block shows children. Collapsed blocks skip child navigation. |

All functions respect collapsed state - they never navigate into hidden children.

## Architecture

Motion commands are view-agnostic verbs (`Up`, `Down`, `Left`, `Right`, ...). The *meaning* of each motion key depends on two things: which view type is active, and which region within the view is focused.

### Motion delegation

Per-view motion logic lives in `services/ui/View/{type}/navigation.ts`:

- `View/page/navigation.ts` — outline tree walk in document order
- `View/chat/navigation.ts` — tuple-ordered message list

`services/ui/View/index.ts` exposes `resolveBlockAbove/Below/Left/Right(khoraId)`, which reads the active view type and dispatches to the right module. Motion commands call this and focus the returned khora.

### Region-specific overrides

Some regions need key semantics that aren't pure motion. For example, `ArrowDown` in a property name field opens an existing-properties picker — it does not move focus to the khora below. These overrides live **inline in the command handler**, branching on `KhoraContext.type` before falling through to generic motion:

```ts
// Up.handle — simplified
const ctx = parseKhoraContextSync(khoraId);
if (ctx.type === "propertyTitle" && atBottomEdge) {
  return openExistingPropertiesPopup();
}
const next = yield* View.resolveBlockAbove(khoraId);
// focus if Some, noop if None
```

Regions recognized today (from `KhoraContext`):

| Context | Region | Overrides |
|---|---|---|
| `frame` | Outline block | None — default motion |
| `section` | Property value | None — default motion |
| `propertyTitle` | Property name editor | Arrow keys at text edges open property-configuration popups (see `docs/specs/properties.md` § Navigation and Selection) |

### Rejected alternatives

- **Dedicated override layer** (`commands/editor/contextOverrides/{region}.ts`) grouping all of a region's key behaviors in one file. Rejected as premature: today only `propertyTitle` has overrides, and splitting across files costs indirection for little gain. Revisit if a second region grows 3+ overrides.
- **Richer resolver return type** (`{ focus } | { openPopup } | ...`). Rejected because it would leak UI affordances (popups, mode switches) into `View` services, which should stay focused on "where is the next focusable thing," not "what UI action fires."
