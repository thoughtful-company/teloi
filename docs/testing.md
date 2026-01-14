# Testing Guidelines

## Setting Up Selection and Focus

### DON'T: Click to set selection
```typescript
// BAD - clicking resets selection
yield* When.SELECTION_IS_SET_TO(bufferId, nodeId, offset);
yield* When.USER_CLICKS_BLOCK(blockId); // This RESETS the selection!
```

### DO: Set selection and active element separately
```typescript
// GOOD - set selection via model, then set active element directly
yield* When.SELECTION_IS_SET_TO(bufferId, nodeId, offset);
yield* Given.ACTIVE_ELEMENT_IS({ id: blockId, type: "block" });
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

Use `When.SELECTION_IS_SET_TO(bufferId, nodeId, offset)` to set cursor position directly:

```typescript
const cursorPosition = 42;
yield* When.SELECTION_IS_SET_TO(bufferId, nodeId, cursorPosition);
```

**NEVER** navigate character-by-character to set cursor position:
```typescript
// TERRIBLE - never do this
for (let i = 0; i < offset; i++) {
  yield* When.USER_PRESSES("{ArrowRight}");
}
```
