# fn-1.7 Add IS_CHECKED tuple cleanup on checkbox removal

## Description
When a checkbox type is removed via decorative type replacement (checkbox → list), clean up any IS_CHECKED tuples associated with that node.

## Why This Matters
Checkboxes store their checked state as tuples: `(nodeId, IS_CHECKED, "true"/"false")`. When converting a checkbox to a list, these tuples become orphaned - they have no meaning for a list item, and could cause bugs if the node is later converted back to a checkbox.

## Implementation Options

### Option A: Inline cleanup in handleTypeTrigger (Simpler)
Add cleanup logic directly when removing checkbox type:

```typescript
if (existingDecorativeId === System.CHECKBOX) {
  // Clean up IS_CHECKED tuples
  yield* Effect.gen(function* () {
    const Tuple = yield* TupleT;
    yield* Tuple.remove(nodeId, System.IS_CHECKED);
  });
}
```

### Option B: onRemove callback in BlockTypeDefinition (More extensible)
Add `onRemove?: (nodeId: Id.Node) => Effect.Effect<void, never, BrowserRequirements>` to type definitions. Checkbox would implement this to clean up its tuples.

**Recommendation**: Option A for this issue. Option B is more elegant but adds complexity for a single use case. Can refactor later if more types need cleanup.

## References
- IS_CHECKED constant: `apps/web/src/schema/system.ts:55`
- TupleT service: `apps/web/src/services/domain/Tuple/`
- Checkbox onTrigger (creates tuples): `apps/web/src/services/ui/BlockType/definitions/checkbox.tsx:110-115`
## Acceptance
- [ ] When checkbox is replaced by list, IS_CHECKED tuples are removed
- [ ] Tuple cleanup happens in same Effect as type replacement (atomic)
- [ ] List to checkbox conversion does NOT trigger tuple cleanup (no tuples to clean)
- [ ] Other decorative type conversions (if any added later) don't break
- [ ] Type check passes: `pnpm -F @teloi/web typecheck`
## Done summary
- Added IS_CHECKED tuple cleanup when checkbox is replaced by list type
- Cleanup happens in same Effect as type replacement (atomic)
- Uses TupleT.findByPosition and TupleT.delete to remove orphaned tuples

Why:
- Prevents orphaned IS_CHECKED tuples when checkbox converts to list
- Avoids potential bugs if node is later converted back to checkbox

Verification:
- No type errors in modified files
- Lint passed via lint-staged
## Evidence
- Commits: ed6feb0ff5998efb6be11d17a66bcbabeb897336
- Tests:
- PRs: