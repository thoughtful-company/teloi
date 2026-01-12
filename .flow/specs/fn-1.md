# Type Triggers Should Replace Existing Decorative Types

**GitHub Issue**: #18
**Branch**: `fn-1`

## Overview

When typing a markdown-style trigger (like `- ` for list or `[ ]` for checkbox) on a node that already has a *different* decorative type, the new type should **replace** the existing one instead of silently failing.

**Current behavior**: `handleTypeTrigger` in `Block.tsx:839-855` checks `if (hasType(typeId)) return false` - this only prevents adding the *same* type twice, but doesn't handle the case where a *different* decorative type already exists.

**Result**: Nodes can accumulate multiple decorative types (list + checkbox), but only the first one renders, causing confusion.

## Scope

**In scope:**
- Add `isDecorative` field to `BlockTypeDefinition` to identify mutually exclusive types
- Modify `handleTypeTrigger` to remove existing decorative types before adding new one
- Clean up IS_CHECKED tuples when checkbox type is removed (via type replacement)
- Mark system types (list-element, checkbox) as decorative
- Tests for all conversion scenarios

**Out of scope:**
- User-created types (via `#`) - these are NOT decorative and should coexist with decorative types
- TypePicker (`#` menu) mutual exclusion - that's a separate feature
- Undo/redo semantics - uses existing event-based undo
- Title component - uses Block's behavior via shared components

## Approach

### Phase 1: Type Definition Changes

1. Add `isDecorative?: boolean` to `BlockTypeDefinition` interface in `types.ts`
2. Mark `listElement` and `checkbox` definitions as `isDecorative: true`
3. Add registry helper `getDecorativeTypeIds()` to return IDs of all decorative types

### Phase 2: Trigger Logic Update

Modify `handleTypeTrigger` in `Block.tsx`:

```typescript
const handleTypeTrigger = (typeId: Id.Node, trigger: BlockType.TriggerDefinition): boolean => {
  // If node already has THIS type, don't trigger (insert literal text)
  if (hasType(typeId)) return false;

  const typeDef = BlockType.get(typeId);

  // If this IS a decorative type AND node has a DIFFERENT decorative type, replace it
  if (typeDef?.isDecorative) {
    const existingDecorativeTypeId = getExistingDecorativeType(); // new helper
    if (existingDecorativeTypeId) {
      // Remove existing decorative type (with cleanup), then add new one
      runtime.runPromise(
        Effect.gen(function* () {
          const Type = yield* TypeT;
          yield* removeDecorativeTypeWithCleanup(nodeId, existingDecorativeTypeId);
          yield* Type.addType(nodeId, typeId);
          if (trigger.onTrigger) yield* trigger.onTrigger(nodeId);
        }),
      );
      return true;
    }
  }

  // Normal case: no decorative type exists, just add
  runtime.runPromise(/* existing logic */);
  return true;
};
```

### Phase 3: Tuple Cleanup

When removing checkbox type, clean up IS_CHECKED tuples:
- Query tuples where `(nodeId, IS_CHECKED, *)` exists
- Remove them as part of the type replacement effect

## Quick Commands

```bash
# Run tests for type trigger behavior (after implementation)
pnpm -F @teloi/web test:browser src/__tests__/type-triggers.browser.spec.tsx

# Type check
pnpm -F @teloi/web typecheck
```

## Acceptance Criteria

- [ ] Typing `[ ]` on a list item converts it to checkbox (list type removed, checkbox added)
- [ ] Typing `- ` on a checkbox converts it to list item (checkbox removed, list added)
- [ ] Typing `- ` on a list item inserts literal `- ` text (no trigger activation)
- [ ] Typing `[ ]` on a checkbox inserts literal `[ ]` text (no trigger activation)
- [ ] User-created types (via `#`) are NOT affected by replacement logic
- [ ] A node cannot have both list AND checkbox types simultaneously after this change
- [ ] When checkbox is removed via replacement, IS_CHECKED tuples are cleaned up
- [ ] All new functionality has test coverage

## Technical References

| File | Line | Purpose |
|------|------|---------|
| `apps/web/src/ui/Block.tsx` | 839-855 | `handleTypeTrigger` - main logic to modify |
| `apps/web/src/ui/Block.tsx` | 214 | `hasType` helper |
| `apps/web/src/services/ui/BlockType/types.ts` | 38-77 | `BlockTypeDefinition` interface |
| `apps/web/src/services/ui/BlockType/registry.ts` | 1-56 | Registry with `get()`, `getAll()` |
| `apps/web/src/services/ui/BlockType/definitions/listElement.tsx` | 10-28 | List element definition |
| `apps/web/src/services/ui/BlockType/definitions/checkbox.tsx` | 96-125 | Checkbox definition |
| `apps/web/src/services/domain/Type/index.ts` | 11-53 | TypeT service (addType, removeType) |
| `apps/web/src/schema/system.ts` | 23, 55 | System.LIST_ELEMENT, System.CHECKBOX constants |

## Edge Cases

| Scenario | Expected Behavior |
|----------|-------------------|
| Node has both list AND checkbox (corrupt state) | Remove ALL decorative types, add new one |
| `[x]` on list item | Creates checked checkbox (preserves trigger semantics) |
| Rapid sequential triggers | Sequential Effect execution prevents race |
| Node has list + #project tag | Remove list, add checkbox, preserve #project |

## Open Questions (Resolved)

1. **IS_CHECKED cleanup**: YES - clean up tuples when checkbox is replaced
2. **Transaction semantics**: Individual events fine (local-first, no distributed transactions needed)
3. **Where to track decorative-ness**: Add `isDecorative` to `BlockTypeDefinition` (simpler than querying meta-type)
4. **Backspace tuple cleanup**: Defer to separate issue - this issue focuses on trigger replacement only
