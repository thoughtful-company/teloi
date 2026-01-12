# fn-1.6 Implement decorative type replacement in handleTypeTrigger

## Description
Modify `handleTypeTrigger` in Block.tsx to detect when a node already has a decorative type, and replace it with the new decorative type instead of silently failing.

## Current Behavior (Block.tsx:839-855)
```typescript
const handleTypeTrigger = (typeId: Id.Node, trigger: BlockType.TriggerDefinition): boolean => {
  if (hasType(typeId)) return false;  // Only checks SAME type
  // ... adds type
};
```

## New Behavior
1. If trigger type is decorative AND node has a DIFFERENT decorative type:
   - Remove the existing decorative type
   - Add the new decorative type
   - Return true (trigger consumed)
2. If trigger type is same as existing type:
   - Return false (insert literal text) - unchanged
3. If no existing decorative type:
   - Add the new type - unchanged

## Implementation

Add helper to check for existing decorative type:
```typescript
const getExistingDecorativeTypeId = (): Id.Node | undefined => {
  const decorativeIds = BlockType.getDecorativeTypeIds();
  return activeTypes().find(typeId => decorativeIds.includes(typeId));
};
```

Update `handleTypeTrigger`:
```typescript
const handleTypeTrigger = (typeId: Id.Node, trigger: BlockType.TriggerDefinition): boolean => {
  if (hasType(typeId)) return false;

  const typeDef = BlockType.get(typeId);

  if (typeDef?.isDecorative) {
    const existingDecorativeId = getExistingDecorativeTypeId();
    if (existingDecorativeId) {
      // Replace: remove old, add new
      runtime.runPromise(
        Effect.gen(function* () {
          const Type = yield* TypeT;
          yield* Type.removeType(nodeId, existingDecorativeId);
          yield* Type.addType(nodeId, typeId);
          if (trigger.onTrigger) yield* trigger.onTrigger(nodeId);
        }),
      );
      return true;
    }
  }

  // Original logic for non-replacement case
  runtime.runPromise(/* existing */);
  return true;
};
```

## References
- `handleTypeTrigger`: `apps/web/src/ui/Block.tsx:839-855`
- `hasType` helper: `apps/web/src/ui/Block.tsx:214`
- `activeTypes()` signal: derived from props.types
- `TypeT.removeType`: `apps/web/src/services/domain/Type/index.ts`
## Acceptance
- [ ] `getExistingDecorativeTypeId` helper added to Block component
- [ ] `handleTypeTrigger` checks for existing decorative type when adding a decorative type
- [ ] Existing decorative type is removed before new one is added
- [ ] `onTrigger` callback still fires after replacement
- [ ] Same-type check (`hasType(typeId)`) still returns false (literal text insertion)
- [ ] Type check passes: `pnpm -F @teloi/web typecheck`
## Done summary
TBD

## Evidence
- Commits:
- Tests:
- PRs:
