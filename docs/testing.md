# Testing Guidelines

## Cleanup

**Never use `afterEach`** for cleanup. All cleanup/reset logic must go in `beforeEach` instead. This ensures each test starts from a known state regardless of whether the previous test passed, failed, or was skipped.

## Setting Up Selection and Focus

### DON'T: Click to set selection
```typescript
// BAD - clicking resets selection
yield* Given.BUFFER_HAS_CURSOR(bufferId, nodeId, offset);
yield* When.USER_CLICKS_BLOCK(blockId); // This RESETS the selection!
```

### DO: Set selection and active element separately
```typescript
// GOOD - set selection via model, then set active element directly
yield* Given.BUFFER_HAS_CURSOR(bufferId, nodeId, offset);
yield* Given.ACTIVE_ELEMENT_IS({ id: blockId, type: "block" });
```

### Better: Use the combined helper
```typescript
// BEST - sets both selection and active element in one call
yield* Given.BLOCK_IS_FOCUSED_AT(blockId, offset);
```

### Setting Active Element

Use `Given.ACTIVE_ELEMENT_IS(element)` to set the active element without triggering click behavior:

```typescript
// For a block:
yield* Given.ACTIVE_ELEMENT_IS({ id: blockId, type: "block" });

// For a title:
yield* Given.ACTIVE_ELEMENT_IS({ bufferId, type: "title" });
```

### Setting Selection

Use `Given.BUFFER_HAS_CURSOR(bufferId, nodeId, offset)` to set cursor position directly:

```typescript
const cursorPosition = 42;
yield* Given.BUFFER_HAS_CURSOR(bufferId, nodeId, cursorPosition);
```

**NEVER** navigate character-by-character to set cursor position:
```typescript
// TERRIBLE - never do this
for (let i = 0; i < offset; i++) {
  yield* When.USER_PRESSES("{ArrowRight}");
}
```
