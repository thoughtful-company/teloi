# Cross-Parent Node Movement on Cmd+Option+Up/Down

## Overview

Enhance the existing `Cmd+Option+Up/Down` node movement to support "jumping" across parent boundaries. When a node (or selection of nodes) is at the first/last position among its siblings and the user continues moving in that direction, the node(s) should reparent to the adjacent sibling of the current parent.

## Scope

**In scope:**
- Move Down at last sibling position → become first child of parent's next sibling
- Move Up at first sibling position → become last child of parent's previous sibling
- Both text editing mode (single block) and block selection mode (single/multi)
- Multi-block selection moves as a unit

**Out of scope:**
- Wrap-around behavior (last to first, first to last)
- Outdent fallback when no sibling exists
- Visual animation enhancements

## Behavior Specification

### Move Down (Cmd+Option+Down)

```
Before:                     After:
- Node A                    - Node A
  - Node B                    - Node B
  - Node C  ← at last pos   - Node D
- Node D                      - Node C  ← first child of D
  - Node E                    - Node E
```

**When node(s) at last position among siblings:**
1. Find parent's next sibling
2. If exists → reparent node(s) to become **first child** of that sibling
3. If not exists → do nothing (no-op)

### Move Up (Cmd+Option+Up)

```
Before:                     After:
- Node A                    - Node A
  - Node B                    - Node B
  - Node C                    - Node C  ← last child of A
- Node D                    - Node D
  - Node C  ← at first pos    - Node E
  - Node E
```

**When node(s) at first position among siblings:**
1. Find parent's previous sibling
2. If exists → reparent node(s) to become **last child** of that sibling
3. If not exists → do nothing (no-op)

### Multi-Block Selection

When multiple blocks are selected, they move together as a unit:
- All selected blocks reparent to the same destination
- Relative order among selected blocks is preserved
- If ANY block cannot move (e.g., at root boundary), entire operation is no-op

## Approach

### Key Files to Modify

1. **`apps/web/src/services/ui/Block/swap.ts`** - Add cross-parent logic when at boundary
2. **`apps/web/src/ui/EditorBuffer.tsx:357-390`** - Update block selection mode handler
3. **`apps/web/src/ui/Block.tsx:450-467`** - May need updates for text mode

### Reusable Code

- `Node.insertNode()` - Already handles reparenting (see `indent.ts` usage)
- `Node.getParent()` - Get parent ID
- `Node.getNodeChildren()` - Get siblings for position checking
- `Store.queryOne(parentLinksTable, { childId })` - Get parent link with position

### Algorithm (pseudocode)

```typescript
// For Move Down at boundary:
const parent = Node.getParent(nodeId)
const parentSiblings = Node.getNodeChildren(Node.getParent(parent))
const parentIndex = parentSiblings.indexOf(parent)
const nextParentSibling = parentSiblings[parentIndex + 1]

if (nextParentSibling) {
  // Get first child of next sibling to insert before
  const targetChildren = Node.getNodeChildren(nextParentSibling)
  if (targetChildren.length > 0) {
    Node.insertNode({ nodeId, parentId: nextParentSibling, insert: "before", siblingId: targetChildren[0] })
  } else {
    Node.insertNode({ nodeId, parentId: nextParentSibling, insert: "first" })
  }
}
```

## Quick Commands

```bash
# Run movement tests
pnpm -F @teloi/web test:browser src/__tests__/Block/Movement.browser.spec.tsx

# Run all browser tests
pnpm -F @teloi/web test:browser

# Type check
pnpm -F @teloi/web typecheck
```

## Acceptance Criteria

- [ ] Move Down at last sibling position reparents to first child of parent's next sibling
- [ ] Move Up at first sibling position reparents to last child of parent's previous sibling
- [ ] No-op when no target sibling exists (root boundary)
- [ ] Works in text editing mode (single block)
- [ ] Works in block selection mode (single block)
- [ ] Works in block selection mode (multi-block selection)
- [ ] Multi-block selection preserves relative order
- [ ] Selection/focus preserved after cross-parent move
- [ ] All existing movement tests still pass
- [ ] New browser tests cover cross-parent scenarios

## Risks & Mitigations

| Risk | Mitigation |
|------|------------|
| Break existing swap behavior | TDD - write tests first, ensure existing tests pass |
| Cursor/selection lost after move | Preserve selection state like current same-parent moves |
| Race condition with fast repeated moves | Use Effect's sequential execution guarantees |

## References

- Current swap logic: `apps/web/src/services/ui/Block/swap.ts:31-42`
- Block selection handler: `apps/web/src/ui/EditorBuffer.tsx:357-390`
- Indent (reparent example): `apps/web/src/services/ui/Buffer/indent.ts`
- Shortcut architecture: `docs/shortcuts.md`
- Movement tests: `apps/web/src/__tests__/Block/Movement.browser.spec.tsx`
