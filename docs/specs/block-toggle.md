# Block Toggle (Expand/Collapse)

## Commands

### `buffer:collapse`
Progressive collapse. If the block is expanded with children, collapse it and stay. If collapsed or childless, navigate to parent (preserving mode). If at root level, focus title.

In block selection mode, currently operates on `selectedBlocks[0]` only. Multi-block collapse is not yet implemented (tracked by a `it.fails` test).

### `buffer:expand`
Calls `Block.expandOneLevel(bufferId, nodeId)` — DFS-based: if the block itself is collapsed, expand it; if already expanded, find the first collapsed descendant and expand that. Returns false if everything is already expanded.

In block selection mode, expands all selected blocks (iterates the full selection).

## Routing

### KeyEventBus (`Cmd+ArrowUp`)
Unconditionally dispatches `Collapse`. The progressive behavior (collapse vs navigate-to-parent) is handled inside the `Collapse` command handler.

### KeyEventBus (`Cmd+ArrowDown`)
Dispatch `Expand` (expandOneLevel handles both collapsed and already-expanded cases internally).

### Click (triangle button in Block.tsx)
- Expanded → dispatch `Collapse`
- Collapsed → dispatch `Expand`

Dispatched through CommandBus, not directly calling `Block.setExpanded`.

## Modes
Both `Cmd+Up`/`Cmd+Down` work in:
- Editor mode (cursor in a block)
- Block selection mode (block highlighted, no cursor)
- Title (Cmd+Down expands children DFS from buffer root)

## Navigate-to-parent fallback (`Cmd+Up` when collapsed)
When `Cmd+Up` is pressed and block is already collapsed (or has no children):
- Find parent node
- If parent is the buffer's assigned node (title) → focus title
- Otherwise → collapse parent and focus it, preserving goalX

## Auto-expand ancestors on selection

When `Buffer.setBlockSelection` targets a node whose ancestor is collapsed, all ancestors up to the buffer root are automatically expanded. This ensures selected blocks are always visible.

Tested scenarios:
- Single collapsed parent expands when child is selected
- Multiple ancestors at different depths all expand
- Direct children of buffer root require no expansion
