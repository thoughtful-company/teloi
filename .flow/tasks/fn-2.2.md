# fn-2.2 Implement cross-parent movement in swap service

## Description

Implement the core cross-parent movement logic in the Block service layer.

### Approach

Extend or create new function alongside `swap.ts` that handles the cross-parent case:

1. When `swap()` detects boundary (first/last position), instead of returning `false`:
   - Find parent's adjacent sibling in the move direction
   - If sibling exists, reparent the node(s) using `Node.insertNode()`
   - Return success/failure

### Implementation Details

**Move Down at last position:**
```typescript
// Pseudocode
const parent = yield* Node.getParent(nodeId)
const grandparent = yield* Node.getParent(parent) // May fail if root
const parentSiblings = yield* Node.getNodeChildren(grandparent)
const parentIndex = parentSiblings.indexOf(parent)
const nextSibling = parentSiblings[parentIndex + 1]

if (nextSibling) {
  const targetChildren = yield* Node.getNodeChildren(nextSibling)
  if (targetChildren.length > 0) {
    yield* Node.insertNode({ nodeId, parentId: nextSibling, insert: "before", siblingId: targetChildren[0] })
  } else {
    yield* Node.insertNode({ nodeId, parentId: nextSibling, insert: "first" })
  }
  return true
}
return false
```

**Move Up at first position:**
- Mirror logic: find parent's previous sibling, insert as last child

### Files to Modify

- `apps/web/src/services/ui/Block/swap.ts` - Extend to handle cross-parent
- May need new helper in `apps/web/src/services/domain/Node/` for getting parent's siblings

### Reuse

- `Node.insertNode()` from `apps/web/src/services/domain/Node/insertNode.ts`
- `Node.getParent()` from `apps/web/src/services/domain/Node/getParent.ts`
- `Node.getNodeChildren()` from `apps/web/src/services/domain/Node/getNodeChildren.ts`
- Pattern from `indent.ts` / `outdent.ts` for reparenting
## Acceptance
- [ ] `swap()` or new function handles cross-parent when at boundary
- [ ] Move Down at last position reparents to first child of next sibling
- [ ] Move Up at first position reparents to last child of previous sibling
- [ ] Returns false (no-op) when no target sibling exists
- [ ] Handles edge case: target sibling has no children
- [ ] Handles edge case: target sibling already has children
- [ ] All existing movement tests still pass
- [ ] Type check passes: `pnpm -F @teloi/web typecheck`
## Done summary
TBD

## Evidence
- Commits:
- Tests:
- PRs:
