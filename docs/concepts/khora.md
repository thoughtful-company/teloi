# Khora

Khora (from Greek, "space" or "receptacle") is a **vessel for a node**. It is the fundamental selectable unit in a frame.

A node can appear in multiple contexts — as a block in an outline, a row in a table, a value in a property. Each appearance is a distinct khora. The node is the content; the khora is the place it occupies.

## URI

A khora is identified by a URI that encodes the containment path from the frame to the vessel.

Format: `key:value` segments separated by `/`. Each segment that resolves to something selectable is a khora in its own right. The hierarchy is real — khoras contain other khoras.

### Outline

| What | URI |
|------|-----|
| Block | `frame:{fid}/khora:{nodeId}` |

### Table

| What | URI |
|------|-----|
| Row | `frame:{fid}/khora:{hostId}/row:{rowNodeId}` |
| Column | `frame:{fid}/khora:{hostId}/column:{propId}` |
| Cell | `frame:{fid}/khora:{hostId}/row:{rowNodeId}/column:{propId}` |
| Block in cell | `frame:{fid}/khora:{hostId}/row:{rowNodeId}/column:{propId}/khora:{nodeId}` |

- `khora:{hostId}` is the node displayed as a table
- Row and column are each independently selectable khoras
- Their combination is a cell — also a khora
- Title column uses `column:title`; the block within it is `khora:{rowNodeId}`

### Property

| What | URI |
|------|-----|
| Property title | `frame:{fid}/khora:{hostId}/property:{propId}` |
| Property value | `frame:{fid}/khora:{hostId}/property:{propId}/khora:{valueId}` |

The property itself is not selectable — only its title and values are khoras.

## Parsed Context

The URI parser produces a discriminated union:

```ts
type KhoraContext =
  | { type: "block"; frameId; nodeId }
  | { type: "row"; frameId; hostId; rowNodeId }
  | { type: "column"; frameId; hostId; propId }
  | { type: "cell"; frameId; hostId; rowNodeId; propId }
  | { type: "cellBlock"; frameId; hostId; rowNodeId; propId; nodeId }
  | { type: "propertyTitle"; frameId; hostId; propId }
  | { type: "propertyValue"; frameId; hostId; propId; valueId }
```

Operations (copy, delete, move) match on the context type and dispatch to the appropriate handler.

## Migration

- `Id.Khora` replaces `Id.Block` entirely. `KhoraContext` replaces `BlockContext`.
- The current `tuple:{tupleId}` segment in Block IDs does not carry over — it was a Block ID addressing a tuple, not the tuple itself. In the khora scheme, individual property values are addressed by `khora:{valueId}` within a `property:{propId}` path.

## Selection

- Selection at different granularities is mutually exclusive — selecting a row and a cell within that row cannot coexist
- The URI is opaque to the selection system — it stores the path without interpreting it
- In outline view, khora maps one-to-one with blocks
