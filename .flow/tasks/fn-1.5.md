# fn-1.5 Add isDecorative infrastructure to BlockTypeDefinition

## Description
Add the `isDecorative` field to the BlockType system to identify mutually exclusive types (like list and checkbox) that shouldn't coexist on the same node.

## Changes Required

### 1. Update `BlockTypeDefinition` interface
**File**: `apps/web/src/services/ui/BlockType/types.ts`

Add optional field:
```typescript
isDecorative?: boolean;
```

### 2. Mark system types as decorative
**Files**:
- `apps/web/src/services/ui/BlockType/definitions/listElement.tsx` - add `isDecorative: true`
- `apps/web/src/services/ui/BlockType/definitions/checkbox.tsx` - add `isDecorative: true`

### 3. Add registry helper
**File**: `apps/web/src/services/ui/BlockType/registry.ts`

Add function to get all decorative type IDs:
```typescript
export function getDecorativeTypeIds(): Id.Node[] {
  return Array.from(registry.values())
    .filter(def => def.isDecorative)
    .map(def => def.typeId);
}
```

## References
- `BlockTypeDefinition` interface: `apps/web/src/services/ui/BlockType/types.ts:38-77`
- Registry: `apps/web/src/services/ui/BlockType/registry.ts`
- List definition: `apps/web/src/services/ui/BlockType/definitions/listElement.tsx`
- Checkbox definition: `apps/web/src/services/ui/BlockType/definitions/checkbox.tsx`
## Acceptance
- [ ] `isDecorative?: boolean` field added to `BlockTypeDefinition` interface in `types.ts`
- [ ] `listElement` definition has `isDecorative: true`
- [ ] `checkbox` definition has `isDecorative: true`
- [ ] `getDecorativeTypeIds()` function exported from registry
- [ ] `getDecorativeTypeIds()` returns array containing LIST_ELEMENT and CHECKBOX IDs
- [ ] Type check passes: `pnpm -F @teloi/web typecheck`
## Done summary
- Added `isDecorative?: boolean` field to BlockTypeDefinition interface with JSDoc
- Marked listElement and checkbox definitions as decorative
- Added `getDecorativeTypeIds()` registry helper function

Why:
- Enables upcoming replacement logic where decorative types are mutually exclusive
- Clean separation between decorative types (bullets, checkboxes) and user types (#tags)

Verification:
- Code changes compile (pre-existing test type errors unrelated to this change)
- Lint passed via lint-staged
## Evidence
- Commits: 19b2aafac4638c194b030a982a1887d926907633
- Tests:
- PRs: