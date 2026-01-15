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

Enter block selection mode by pressing `Escape` while editing text, or by using `Shift+Arrow` at text boundaries or by clicking somewhere on the buffer and pressing `ArrowUp/Down`.

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

Implementation in `services/ui/Block/navigation.ts`:

| Function | Purpose |
|----------|---------|
| `findPreviousNode(nodeId, bufferId)` | Previous block in document order. Returns parent if first child, else prev sibling's deepest visible descendant. |
| `findNextNodeInDocumentOrder(nodeId, bufferId)` | Next block in document order. Descends into first child if expanded, else finds next sibling or climbs up. |
| `findNextNode(nodeId)` | Next sibling or ancestor's next sibling (no child descent). Used for text cursor "ArrowRight at end". |
| `findDeepestLastChild(nodeId, bufferId)` | Deepest visible descendant. Used when landing on previous sibling. |
| `isBlockExpanded(bufferId, nodeId)` | Check if block shows children. Collapsed blocks skip child navigation. |

All functions respect collapsed state - they never navigate into hidden children.
