# fn-1.4 Write browser tests for type trigger replacement

## Description

Write browser tests to verify type trigger replacement behavior. Per CLAUDE.md, use the `test-architect` sub-agent for all test work.

### Test scenarios to cover:

1. **List to checkbox conversion**
   - Given: A node with list-element type
   - When: User types `[ ]` at start of content
   - Then: Node has checkbox type, no longer has list type

2. **Checkbox to list conversion**
   - Given: A node with checkbox type (checked)
   - When: User types `- ` at start of content
   - Then: Node has list type, no longer has checkbox type, IS_CHECKED tuple removed

3. **Same-type trigger inserts literal text**
   - Given: A node with list-element type
   - When: User types `- ` at start of content
   - Then: Node still has list type, `- ` text is inserted (trigger not consumed)

4. **Same-type checkbox trigger**
   - Given: A node with checkbox type
   - When: User types `[ ]` at start of content
   - Then: Node still has checkbox type, `[ ]` text is inserted

5. **User types preserved during replacement**
   - Given: A node with list-element type and #project tag
   - When: User types `[ ]` at start
   - Then: Node has checkbox type and still has #project tag

6. **[x] on list creates checked checkbox**
   - Given: A node with list-element type
   - When: User types `[x]` at start
   - Then: Node has checkbox type, has IS_CHECKED tuple set to true

### Test file location:
`apps/web/src/__tests__/type-triggers.browser.spec.tsx`

### BDD helpers:
Use existing BDD helpers from `apps/web/src/__tests__/bdd/` (Given/When/Then pattern).

### Command to run:
```bash
pnpm -F @teloi/web test:browser src/__tests__/type-triggers.browser.spec.tsx
```
## Acceptance
- [ ] Test file exists at `apps/web/src/__tests__/type-triggers.browser.spec.tsx`
- [ ] Test: list to checkbox conversion passes
- [ ] Test: checkbox to list conversion passes (with tuple cleanup)
- [ ] Test: same-type trigger inserts literal text (list on list)
- [ ] Test: same-type trigger inserts literal text (checkbox on checkbox)
- [ ] Test: user types preserved during replacement
- [ ] Test: `[x]` on list creates checked checkbox
- [ ] All tests pass: `pnpm -F @teloi/web test:browser src/__tests__/type-triggers.browser.spec.tsx`
## Done summary
- Created browser test file for type trigger replacement behavior
- Added 6 tests covering all acceptance criteria scenarios
- Tests verify list↔checkbox conversion, same-type literal insertion, user type preservation, and [x] checked checkbox creation

Why:
- Ensures type trigger replacement behavior is verified
- Catches regressions in decorative type mutual exclusivity

Verification:
- All 6 tests pass: `pnpm -F @teloi/web test:browser src/__tests__/type-triggers.browser.spec.tsx`
- Lint passed via lint-staged
## Evidence
- Commits: d1669260c61e6fe461c311dcffb768a2eb193113
- Tests: pnpm -F @teloi/web test:browser src/__tests__/type-triggers.browser.spec.tsx
- PRs: