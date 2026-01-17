# Properties

Properties allow users to view and edit relationships of a given node. A property displays linked nodes based on an underlying tuple type, providing a structured way to connect entities across the workspace.

## Overview

Properties are **global per-workspace** entities that define how relationships are displayed. They are not children of pages—instead, they are rendered based on tuples linking views to properties.

### Key Characteristics

- **Global scope**: Properties live under `workspace:schema` and can be used by any view
- **Relationship-backed**: Each property is bound to a tuple type that defines the relationship structure
- **Directional**: Properties specify which position the host page occupies and which position to display
- **Reusable**: Multiple views can link to the same property; the same tuple type can power multiple properties (for reverse views)

## Architecture

### Entity Relationships

```
workspace:schema
├── Property "Project"
│     ├── title: "Project"
│     ├── hostPosition: 1
│     ├── displayPosition: 0
│     └── ──PROPERTY_USES_TUPLE──▶ Tuple Type "Project_Tuple"
│
└── (shadow) Tuple Type "Project_Tuple"
      ├── (shadow) Position 0: "Project"
      └── (shadow) Position 1: "Is Project For"

Page "Task A"
└── View ──Has_Property──▶ Property "Project"
```

### Entities

#### Property Node

A property is a node with system type `#property` stored under `workspace:schema`.

| Field | Description |
|-------|-------------|
| `title` | The display name of the property (e.g., "Project") |
| `hostPosition` | Which tuple position the page using this property occupies |
| `displayPosition` | Which tuple position to show values from in the right side |

The property is linked to its tuple type via a `PROPERTY_USES_TUPLE(property, tupleType)` tuple instance.

#### Tuple Type

Tuple types define relationship schemas. They live as shadow children under `workspace:schema`.

Each tuple type has **position nodes** as shadow children. For binary tuples (the current focus):
- **Position 0**: The "linked thing" (e.g., "Project")
- **Position 1**: The "host" relationship (e.g., "Is Project For")

Position nodes have editable titles that define role names.

#### View Node

Each page can have one or more view nodes. Views determine how content is displayed and which properties appear.

Views link to properties via `Has_Property(view, property)` tuple instances. Different views on the same page can show different sets of properties.

See `docs/views.md` for detailed view documentation.

#### Tuple Instance

Tuple instances represent actual relationships between nodes. When a user adds a linked block to a property, a tuple instance is created.

| Field | Description |
|-------|-------------|
| `tupleTypeId` | The tuple type this instance belongs to |
| `position0NodeId` | The node occupying position 0 |
| `position1NodeId` | The node occupying position 1 |

## Rendering

Property sections are **not blocks** in the page's children. They are rendered based on `Has_Property` tuples linking the current view to properties.

### Render Flow

1. Query `Has_Property` tuples where view = current page's active view
2. For each property found, render a property section
3. Property section displays:
   - **Left side**: Property title (the property name)
   - **Right side**: Linked blocks queried from tuple instances

### Querying Linked Blocks

For a property section on a given page:

```
SELECT position{displayPosition}NodeId
FROM tuple_instances
WHERE tupleTypeId = property.tupleTypeId
  AND position{hostPosition}NodeId = currentPageId
```

For example, with Property "Project" (`hostPosition: 1`, `displayPosition: 0`):
- Find all tuple instances of the "Project" tuple type
- Where position 1 = current page (the task)
- Display nodes at position 0 (the projects)

## User Experience

### Visual Layout

Property sections span the full buffer width, split into two parts:

```
┌─────────────────────────────────────────────────────────┐
│ Project            │  [Design Doc]  [Roadmap]  [+]     │
│ (property name)    │  (linked blocks)                  │
└─────────────────────────────────────────────────────────┘
```

- **Left part**: Property name (editable)
- **Right part**: Linked blocks with add button

### Property Settings

Press `Cmd+Down` on the property name to expand settings below the name (still part of the property section). Settings allow:
- Changing the bound tuple type
- Viewing/editing position names
- Adjusting display configuration

## Creation Flow

### Triggering Property Creation

Typing `> ` at the start of any block triggers property section creation.

### Step-by-Step Flow

1. **User types `> `**
   - View node for current page is found or created
   - Property node is created under `workspace:schema` (empty title, no tuple type)
   - `Has_Property(view, property)` tuple is created
   - Property section appears with empty name, right side greyed out

2. **User types property name** (e.g., "Project")
   - Property node's title updates in real-time
   - Existing properties matching the typed text appear below the name
   - Property remains in **unbound state** (no tuple type) until explicitly configured

3. **User completes setup** via one of the navigation paths (see below)

### Unbound State

A property without an assigned tuple type is considered **unbound**:
- Right side is greyed out and non-interactive
- No linked blocks can be displayed or added
- Property section indicates setup is incomplete

### Navigation and Selection

While editing the property name, users can navigate to different selection modes:

| Action | Context | Result |
|--------|---------|--------|
| `↓` (arrow down) | At last visual line of editor | Enter existing properties selection |
| `→` (arrow right) | In properties selection | Move to existing tuple types selection |
| `→` (arrow right) | In tuple types selection | Move to create new tuple type |
| `←` (arrow left) | At first position | Enter create new tuple type |
| `→` (arrow right) | At end of text (while editing) | Quick-create tuple type with defaults |

### Selection Areas

#### Existing Properties

Shows properties matching the typed text. Selecting one:
1. Deletes the newly created (unbound) property
2. Updates `Has_Property` tuple to reference the selected existing property
3. Property section now shows the existing property with its configuration

#### Existing Tuple Types

Shows available tuple types. Flow:

1. User browses/searches tuple types
2. User selects a tuple type and presses `Enter`
3. Position list appears showing all positions with their names
4. User selects which position the host page occupies and presses `Enter`
5. Property is bound:
   - `PROPERTY_USES_TUPLE(property, tupleType)` created
   - `hostPosition` set to selected position
   - `displayPosition` set to the other position (for binary tuples)

#### Create New Tuple Type

Full control mode for creating a new tuple type:
- Define position names
- Configure all settings before creation

### Quick-Create

Pressing `→` at the end of the property name text:
1. Creates a tuple type named `{propertyName}_Tuple` as shadow child of SCHEMA
2. Position 0 title = property name (e.g., "Project")
3. Position 1 title = "Is {name} For" (e.g., "Is Project For")
4. Property is bound with `hostPosition: 1`, `displayPosition: 0`
5. Initial linked block is created
6. Focus moves to the new linked block

## Adding Linked Blocks

When a property is bound and the user adds a block to the right side:

1. New node is created (empty title)
2. Tuple instance is created:
   - `tupleTypeId` = property's tuple type
   - `position{hostPosition}` = current page
   - `position{displayPosition}` = new node
3. New node appears in the right side
4. Cursor focuses the new node for editing

Users always create new nodes when adding to properties. Linking to existing nodes is not supported in the initial implementation.

## Reverse Views (Bidirectional Relationships)

The same tuple type can power properties on both sides of a relationship.

### Example: Projects and Tasks

**Property "Project"** (used on Task pages):
- `hostPosition: 1` (task is at position 1)
- `displayPosition: 0` (show projects)
- Shows: "Which projects is this task linked to?"

**Property "Tasks"** (used on Project pages):
- `hostPosition: 0` (project is at position 0)
- `displayPosition: 1` (show tasks)
- Shows: "Which tasks are linked to this project?"
- Uses the **same tuple type** as Property "Project"

Both properties query the same tuple instances but from opposite directions.

| Property | Tuple Type | Host Position | Display Position | Shows |
|----------|------------|---------------|------------------|-------|
| Project | Has_Project | 1 | 0 | Projects for a task |
| Tasks | Has_Project | 0 | 1 | Tasks for a project |

## Scope and Limitations

### Current Scope

- **Binary tuples only**: Properties support 2-member tuple types
- **Create new only**: When adding linked blocks, users create new nodes (no "link existing" picker)
- **No synced titles**: Position names are not synced to property names (may be added later)

### Future Enhancements

- N-ary tuple support (3+ positions)
- Link to existing node picker
- Synced titles between property name and position 0
- Two-way property creation (create both directions at once)
- Visual indicators for relationship direction

## Data Model

### Tables

#### property_config (optimization, can use tuples initially)

| Column | Type | Description |
|--------|------|-------------|
| propertyNodeId | text | References the property node |
| hostPosition | integer | Position the host page occupies |
| displayPosition | integer | Position to display values from |

Note: `tupleTypeId` is stored via `PROPERTY_USES_TUPLE` tuple, not in this table.

#### tuple_types

| Column | Type | Description |
|--------|------|-------------|
| id | text | References the tuple type node |
| arity | integer | Number of positions (2 for binary) |

#### tuple_positions

| Column | Type | Description |
|--------|------|-------------|
| tupleTypeId | text | The parent tuple type |
| positionIndex | integer | 0, 1, etc. |
| nodeId | text | The position's name node (shadow child) |

#### tuple_instances

| Column | Type | Description |
|--------|------|-------------|
| id | text | Unique instance identifier |
| tupleTypeId | text | The tuple type |
| position0NodeId | text | Node at position 0 |
| position1NodeId | text | Node at position 1 |

### System Tuples

#### PROPERTY_USES_TUPLE

Links a property to its tuple type.

| Position | Role |
|----------|------|
| 0 | Property node |
| 1 | Tuple type node |

#### Has_Property

Links a view to a property.

| Position | Role |
|----------|------|
| 0 | View node |
| 1 | Property node |

## Related Documentation

- `docs/views.md` - View nodes and view management
- `docs/shadow-children.md` - Shadow children mechanism
- `docs/node-title.md` - Title rendering and linking
