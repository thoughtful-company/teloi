# fn-2.3 Integrate cross-parent movement in block selection mode

## Description

Integrate cross-parent movement into block selection mode in EditorBuffer.tsx.

### Current Behavior

`EditorBuffer.tsx:357-390` handles `Alt+Cmd+ArrowUp/Down` in block selection mode:
- Lines 360, 368: Return early when at first/last position
- Need to replace early return with cross-parent logic

### Implementation

1. When at boundary, instead of returning early:
   - Call the cross-parent swap function from fn-2.2
   - If successful, update selection state to track moved blocks

2. For multi-block selection:
   - All selected blocks move together as a unit
   - Use batch operation to move all at once
   - Preserve relative order among selected blocks

### Files to Modify

- `apps/web/src/ui/EditorBuffer.tsx:357-390` - Replace early returns with cross-parent calls

### Selection State

After cross-parent move, selection should be preserved:
- Current code at lines 379-384 preserves selection for same-parent moves
- Same pattern should work for cross-parent moves
## Acceptance
- [ ] Block selection mode supports cross-parent movement
- [ ] Single block selection: cross-parent works on Cmd+Option+Up/Down
- [ ] Multi-block selection: all blocks move together as unit
- [ ] Multi-block selection: relative order preserved
- [ ] Selection state preserved after cross-parent move
- [ ] No-op when no target sibling (doesn't break selection)
- [ ] All cross-parent tests from fn-2.1 pass
- [ ] All existing tests still pass
- [ ] Type check passes: `pnpm -F @teloi/web typecheck`
## Done summary
- Added `crossParentMoveBlocks` helper function to EditorBuffer.tsx
- Modified block selection mode handler to call crossParentMove at boundary
- Works for single and multi-block selection
- All 27 movement tests pass (9 cross-parent + 18 existing)
## Evidence
- Commits: 12aa7fd3bfbfd3b8158d7cb630a8892f341896d2
- Tests: pnpm -F @teloi/web test:browser src/__tests__/Block/Movement.browser.spec.tsx
- PRs: