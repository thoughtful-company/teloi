# Table Feature Specification

## Overview

Tables are an alternative **view** for displaying a node's children. Instead of a hierarchical page/outline view, children appear as rows with columns derived from their tuple relationships.

## Core Concepts

### Everything is Nodes

| UI Concept | Data Model |
|------------|------------|
| Table | View of parent node's children |
| Row | Child node |
| Title cell | Child node's text content |
| Property cell | Another node linked via tuple |

### View Architecture

- **View node**: Defines table configuration, linked to parent via `HAS_VIEW` tuple
- **View type**: Node type (e.g., `system:table-view`)
- **View config**: Stored on view node (columns, order, visibility)
  For example ViewShowsColumnsFor[Projects #table-view][ProjectHasTodo][ColumnSettingsNode]
- **Active view**: Stored per-khora (`activeViewId` on the khora document)
- **Tabs**: Shown when 2+ views exist for a node

## Columns

### Title Column
- Always present, always first
- Non-deletable, non-renamable (for now)
- Displays child node's text content
- Rendered as Block component (same as page view)

### Property Columns

Each property column corresponds to a **tuple type** with 2 positions:
- Position 0: The row node (the child)
- Position 1: The value node (rendered in the cell)

### Column Creation Flow

1. User triggers "Add Column" (button in header or "+" at end)
2. Dialog appears with:
   - **Role 0 name** input (user types, e.g., "Project") — becomes column header
   - **Tuple type name** placeholder (auto-generated: `Has_Project`) — editable
   - **Role 1 name** placeholder (auto-generated: `Is_Project_For`) — editable
3. Auto-generated fields update live as user types
4. User can edit any field before confirming
5. On confirm:
   - Tuple type is created (if new)
   - Column added to view config
   - Column appears in table

### Adding Existing Tuple Type as Column

User can select an existing tuple type instead of creating new. Useful when same property (e.g., `Has_Project`) is used across multiple tables.

### Column Operations

| Operation | Supported | Notes |
|-----------|-----------|-------|
| Create | ✅ | Via dialog, creates tuple type |
| Rename | ❌ | Not column rename — edit tuple type definition instead |
| Hide | ✅ | Stored in view config |
| Reorder | ✅ | Stored in view config |
| Delete | ❌ | Doesn't make sense to |

### Column Header Display

Shows **Position 0 / Role 0 name** (the user-provided column name).

## Cells

### Title Cell

- Rendered as Block component
- Same editing behavior as page view blocks
- Text content = node's Yjs text

### Property Cell

- Rendered as Block component
- Displays value node's text content
- Each cell represents a tuple: `(rowNode, valueNode)`

### Empty Property Cell

- Renders as empty Block (same visual as empty block in page)
- On focus: CodeMirror activates
- **Node not created until first character typed**
- Block pre-generates ID; node created with that ID on first input
- On first input:
  1. Value node created
  2. Tuple created: `(rowNode, newValueNode)`

### Multi-Value Cells

Unlike typical spreadsheets, a single row can have **multiple values stacked vertically** in one column.

This occurs when a row node has multiple tuples of the same type:
```
Task "Watch Lain" has:
  - Has_Project tuple → "Anime"
  - Has_Project tuple → "Leisure"

Displays as:
| Title      | Project  |
|------------|----------|
| Watch Lain | Anime    |
|            | Leisure  |
```

**Editing multi-value cells:**
- Enter in middle → split into two values
- Enter at start → new value above
- Enter at end → new value below
- Backspace on empty → delete value (and its tuple)

Same behavior as page view blocks.

### Tuple Member Ordering

Each position in a tuple has **independent ordering** using fractional indices:

```
Tuple: Area_HAS_PROJECT
  Position 0 (row): "Watch Lain" [order: ba]
  Position 1 (value): "Leisure" [order: fa]
```

Position 0 order and Position 1 order are independent. When displaying values in a column, use Position 1's order indices.

## Rows

### Row = Child Node

A row is the visual representation of a child node.

### Creating Rows

| Trigger | Behavior |
|---------|----------|
| Enter while editing title/block | Split/create (same as page) |
| Select block + Enter | Create new row below |
| "+ New" button at bottom | Create new row at end |

New rows have all property cells empty.

### Deleting Rows

Deleting a row = deleting the child node.

**Value node handling:**
- Value nodes (property cells) are deleted via soft-delete (moved to Trash)
- Tuples remain (orphaned) — filtered out when displaying
- Future: option to show deleted nodes

## View Configuration

Stored on the **view node**:

| Property | Description |
|----------|-------------|
| Columns | List of tuple type IDs to display |
| Column order | Ordering of columns |
| Column visibility | Which columns are hidden |
| Column width | (Future) |

## Data Flow

```
┌─────────────────────────────────────────────────────────┐
│ Parent Node                                              │
│   └── Child Nodes (rows)                                │
│         └── Tuples → Value Nodes (property cells)       │
│                                                         │
│ View Node (linked via HAS_VIEW tuple)                   │
│   └── View Config (columns, order, visibility)          │
│                                                         │
│ Root Khora Document                                     │
│   └── activeViewId → which view is displayed            │
└─────────────────────────────────────────────────────────┘
```

## Naming Convention Reference

When user inputs column name "Project":

| Field | Generated Value | Editable |
|-------|-----------------|----------|
| Role 0 name | `Project` | ✅ (user input) |
| Role 1 name | `Is_Project_For` | ✅ |
| Tuple type name | `Has_Project` | ✅ |

Alternative patterns for Role 1:
- `{name}_Value` → `Project_Value`
- `{name}_Of` → `Project_Of`
- `Related_{name}` → `Related_Project`

## Parked / Future

- [ ] Column deletion (complex: what happens to tuples/values?)
- [ ] View node location in hierarchy (currently orphaned)
- [ ] Column width configuration
- [ ] Sorting by column
- [ ] Filtering rows
- [ ] Title column rename
- [ ] Show deleted nodes option

## Implementation Status

### Completed (Basic)
- [x] TableView component renders children as rows
- [x] Title column shows node text
- [x] Dynamic columns from 2-member tuples
- [x] ViewTabs for switching views
- [x] View tabs hidden when < 2 views

### Next Up
- [ ] Cell editing (Block component in cells)
- [ ] Column creation dialog
- [ ] Empty cell → node creation on first input
- [ ] Multi-value cell display
- [ ] Multi-value cell editing (Enter/Backspace)
- [ ] Row creation (Enter, "+ New" button)
- [ ] Row deletion
- [ ] Column hide/reorder
- [ ] Add existing tuple type as column
