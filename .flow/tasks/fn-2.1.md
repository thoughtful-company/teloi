# fn-2.1 Write browser tests for cross-parent movement

## Description

Write browser tests for cross-parent node movement before implementation (TDD approach).

### Test Scenarios

**Move Down (Cmd+Option+Down) at last sibling:**
1. Single block in text editing mode - moves to first child of parent's next sibling
2. Single block in block selection mode - same behavior
3. Multi-block selection in block selection mode - all move together, preserve order
4. No next sibling exists - no-op (node stays in place)
5. Root level node (no parent to escape) - no-op

**Move Up (Cmd+Option+Up) at first sibling:**
1. Single block in text editing mode - moves to last child of parent's previous sibling
2. Single block in block selection mode - same behavior
3. Multi-block selection in block selection mode - all move together, preserve order
4. No previous sibling exists - no-op
5. Root level node - no-op

**Edge cases:**
- Target sibling has no children (moving into empty parent)
- Target sibling already has children (inserting at correct position)
- Selection preserved after cross-parent move

### Files

- Add tests to: `apps/web/src/__tests__/Block/Movement.browser.spec.tsx`
- Use existing BDD helpers from `apps/web/src/__tests__/bdd/`
- Reference existing movement tests in same file for patterns
## Acceptance
- [ ] Tests exist for Move Down cross-parent (text mode, single block selection, multi-block selection)
- [ ] Tests exist for Move Up cross-parent (text mode, single block selection, multi-block selection)
- [ ] Tests exist for no-op cases (no sibling, root level)
- [ ] Tests exist for edge cases (empty target, populated target)
- [ ] Tests initially fail (TDD - implementation not done yet)
- [ ] Test file runs without errors: `pnpm -F @teloi/web test:browser src/__tests__/Block/Movement.browser.spec.tsx`
## Done summary
- Added 9 new tests for cross-parent node movement in Movement.browser.spec.tsx
- Tests cover: text mode, block selection (single/multi), and no-op cases
- 6 cross-parent tests fail as expected (TDD - feature not implemented)
- 3 no-op tests pass (correct current boundary behavior)
- All 18 existing movement tests still pass
## Evidence
- Commits: 8bf8127ba45a57c7c7e01f7c0433b1dd11b1fe43
- Tests: pnpm -F @teloi/web test:browser src/__tests__/Block/Movement.browser.spec.tsx
- PRs: