Shadow children are nodes that exist in the hierarchy but don't render as page content.

**Use case:** Tuple type position nodes need unified name-linking but shouldn't clutter the workspace.

**Schema:**
- `parent_links.inShadow: true` — marks a child as shadow
- `parent_links.position: ""` — convention for shadow children (no ordering)

**Behavior:**
- Display queries (`getNodeChildren`, `subscribeChildren`) filter them out
- Position calculations skip them when finding siblings
- Deletion cascade includes them (no orphans)

**Creating shadow children:**
```typescript
events.nodeMoved({
  timestamp: Date.now(),
  data: {
    nodeId,
    newParentId: parentId,
    position: "",
    inShadow: true,
  },
})
```

**Querying shadow children** (when you need them):
```typescript
tables.parentLinks.select().where({ parentId, inShadow: true })
```
