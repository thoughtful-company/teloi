# Focus and Selection Architecture

Design notes for rethinking frame mereology: how focus, selection, and interaction scope flow through the component hierarchy.

## Problem Statement

Three adjacent systems need to be designed together:
1. **Active Element System** — determines which keymap scope has priority
2. **Selected Khora System** — tracks which selectable units are highlighted
3. **Text Selection System** — tracks cursor position within a khora's text content

The previous model stored all selection state (`selection`, `selectedBlocks`, `focusMode`, `activePart`) flat on the frame document. This broke down because:

- `activePart: "head" | "body"` was too coarse — couldn't scope keymaps to property sections or widgets
- Block selection used `Id.Node[]`, which couldn't distinguish between selecting a node as a table row vs as a title cell — both resolved to the same node ID
- Text selection and block selection were entangled on the same frame-level fields

These issues have been addressed: `focusMode` is removed (derived from state), `activePart` is simplified to `"khora"`, text selection moved to khora documents, and `assignedNodeId` renamed to `assignedKhoraId`.

## Khora

**Khora** (χώρα) replaces "block" as the fundamental **selectable unit**. A block is one type of khora. Each khora has a URI that encodes a **containment path** from frame down to the specific selectable thing.

URI segments come in two kinds:
- **`khora:{id}`** — a selectable node
- **Everything else** (`row:`, `column:`, `property:`, etc.) — structural dimensions that narrow the address space

### URI scheme

The URI is compositional — it traces the path through the containment hierarchy.

**Outline view:**

| Selection | URI |
|-----------|-----|
| Block | `frame:{fid}/khora:{nodeId}` |

**Table view** — uses a coordinate system with row and column as selectable dimensions:

| Selection | URI |
|-----------|-----|
| Entire row | `frame:{fid}/khora:{hostId}/row:{rowNodeId}` |
| Entire column | `frame:{fid}/khora:{hostId}/column:{propId}` |
| Cell (row × column) | `frame:{fid}/khora:{hostId}/row:{rowNodeId}/column:{propId}` |
| Block within cell | `frame:{fid}/khora:{hostId}/row:{rowNodeId}/column:{propId}/khora:{nodeId}` |

- `khora:{hostId}` is the parent node displayed as a table (the host block)
- `row:{rowNodeId}` and `column:{propId}` are both independently selectable
- Their intersection addresses a cell, which is also selectable
- Cells can contain multiple blocks (multi-value case — multiple tuples of the same type), each addressable by `khora:{nodeId}`
- Title column uses a sentinel for `propId` (e.g., `column:title`); the block within it is `khora:{rowNodeId}` since the title is the row node's own text

**Property sections:**

| Selection | URI |
|-----------|-----|
| Property title | `frame:{fid}/khora:{hostId}/property:{propId}` |
| Property value | `frame:{fid}/khora:{hostId}/property:{propId}/khora:{valueId}` |

Note: `property:{propId}` and `column:{propId}` are structurally similar — both address a property relationship from a host node — but they remain separate concepts with distinct UI semantics.

### Selection rules

- Selection of the same node at different granularities is **mutually exclusive** (can't select both a row and a cell within that row)
- A khora URI is opaque to the selection system — it just holds the IDs
- Operations (copy, delete, move) parse the khora URI, match on its structure, and dispatch to the appropriate handler
- Each handler knows the semantics: a `row` handler copies all property values; a `cell` handler copies just the cell content; a `block` handler copies the outline subtree

### Parsed khora (replaces BlockContext)

The URI parser produces a discriminated union based on the path structure:

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

## Frame Mereology

The frame is decomposed into **parts**. Each part is a vessel that holds a root khora and owns its own selection state. Nesting is exactly one level deep — parts do not contain sub-parts.

```
Frame
  activePart: "khora"         // which part has focus (keymap scope)
  activeKhoraId: Id.Khora     // which khora is being edited (null if none)
  parts:
    body:
      rootKhoraId             // the assigned node
      selectedKhoras: Id.Node[]
      khoraSelectionAnchor: Id.Node | null
      khoraSelectionFocus: Id.Node | null
      // mode is derived:
      //   activeKhoraId != null → editing
      //   selectedKhoras.length > 0 → khora selection
    widget_left:
      (own root khora, own selection state — deferred)
    widget_right:
      ...

Khora document (per khora):
  textSelection: { anchor, head, assoc, goalX, goalLine } | null
```

### What this solves

- **Keymap scoping**: `activePart` points to the part with focus. Each part can have its own keymap priority. Property sections, widgets, and the main body all get independent shortcut handling.
- **Selection isolation**: Each part owns its selection. Selecting blocks in a widget doesn't interfere with the body's selection state.
- **Node change resilience**: When the frame's assigned node changes (zoom out), the body's selection state persists on the frame — it belongs to the interaction context, not the node.

## Active Element System

Not directly visible to the user, but determines **scope**. Focus flows from the frame into a specific part, which determines which keymap has priority.

The flow: Frame → `activePart` → part's selection state → active khora within that part.

This replaced the old `activeRegion` (world level) + `activePart` (frame level) + `focusMode` (frame level) with a cleaner hierarchy: world → frame → part → khora.

## Strategic Decisions

- **Widgets are deferred.** The parts model supports them, but for now only `body` exists. This keeps the implementation simple while the core selection systems are established.
- **View composition is constrained.** Different view types (outline, table, card) render differently but all use khora as the selectable unit. This ensures cross-view operations (move block from table to outline) work without translation — the underlying unit is the same.
- **Block remains the default khora type.** In outline/page view, khora = block. The concept only diverges in views where a node can be selected at multiple granularities (table rows vs cells).
- **Selection is contiguous, not scatter-select.** You can only select a contiguous range within one context — never arbitrary elements across different contexts. Scatter-select (e.g., 3 blocks + a property value) makes operations ambiguous and unpredictable ("what does Tab do?"). Type badges, command nodes, and similar non-block components get single-active-element only — no multi-selection.
- **Selection is always flat.** Selecting a node selects only that node, never implicitly includes its children. Copy depth (node only, full subtree, visible subtree) is controlled explicitly via Cmd+Alt+C menu.

### Selection Topology

- A table (or any non-outline view embedded in the body) is **one khora** in the outline traversal — shift+down from the block above selects the whole table, not its first row.
- **Entering a nested context:** when a container khora (e.g., table) is selected, pressing down again enters it and selects the first element (first row).
- **Exiting a nested context:** shift+down past the last row exits back into the outline below.
- **Property section** sits above the outline/doc view in the vertical traversal order.

## Prior Art

Notion, Craft, and Tana were inspected for their selection implementations. All keep selection centralized but lack the ability to select the same node at different granularities. Their table selection is either row-only or cell-only, never both in the same model.

The delegation model (each parent tracks its own children's selection) was considered and rejected — cross-parent operations, keyboard navigation, and undo/redo all need a single authoritative source. Centralized selection with type-dispatched operations is simpler and sufficient.

## Open Questions

- What the sentinel value for title column is (`column:title`? `column:__title__`?)
