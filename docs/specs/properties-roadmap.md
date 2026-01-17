# Properties Implementation Roadmap

This document outlines the implementation phases for the Properties feature. See `properties.md` for the full specification.

## Completed

### Phase 0: Schema Foundation ✅
- Renamed `System.TYPES` → `System.SCHEMA` (node ID: `workspace:schema`)
- Added system constants:
  - `PROPERTY` - type marker for property nodes
  - `HAS_VIEW` - tuple type linking page → view
  - `HAS_PROPERTY` - tuple type linking view → property
  - `PROPERTY_USES_TUPLE` - tuple type linking property → tuple type
  - `PROPERTY_CONFIG` - tuple type for hostPosition/displayPosition config
  - `POSITION_0`, `POSITION_1` - position value nodes
- Updated URL `/types` → `/schema`, sidebar label "Types" → "Schema"

**Note:** New tuple types are NOT bootstrapped - they work by ID like `RENDERED_NAME`.

### Phase 1: ViewT Service ✅
- Created `apps/web/src/services/ui/View/` with `ViewT` service
- Methods: `getOrCreateView`, `getActiveView`, `getViewsForPage`
- View nodes are shadow children of their page (`inShadow: true`, `position: ""`)
- Linked via `HAS_VIEW(page, view)` tuples
- Tests: `apps/web/src/__tests__/View.browser.spec.tsx` (8 tests)

### Phase 2: PropertyT Service ✅
- Created `apps/web/src/services/ui/Property/` with `PropertyT` service
- Methods: `createProperty`, `getPropertiesForView`, `bindToTupleType`, `getLinkedBlocks`, `addLinkedBlock`
- Properties are children of `System.SCHEMA` with type `PROPERTY`
- Binding creates `PROPERTY_USES_TUPLE` and `PROPERTY_CONFIG` tuples
- Tests: `apps/web/src/__tests__/Property.browser.spec.tsx` (16 tests)

---

## Remaining Phases

### Phase 3: Property Section UI
Render property sections in EditorBuffer.

**Files:**
- `apps/web/src/ui/EditorBuffer/PropertySection.tsx` (new)
- `apps/web/src/ui/EditorBuffer/index.tsx` (modify)

**Component structure:**
```
PropertySection
├── Left: Property name (editable title via TextEditor)
├── Right: Linked blocks list + Add button
└── Settings panel (expandable via Cmd+Down)
```

**Rendering flow:**
1. Get active view for buffer (ViewT.getActiveView)
2. Query properties for view (PropertyT.getPropertiesForView)
3. For each property, render PropertySection
4. Property sections appear between title and children blocks

---

### Phase 4: Property Creation Flow
Trigger property creation with `> ` syntax.

**Files:**
- `apps/web/src/ui/TextEditor/extensions/` (new extension)
- Modify input handling to detect `> ` at line start

**Flow:**
1. User types `> ` at start of any block
2. System finds/creates view for current page
3. Creates property node under SCHEMA
4. Creates `HAS_PROPERTY(view, property)` tuple
5. Property section appears (unbound state)
6. Block with `> ` is deleted or converted

---

### Phase 5: Property Binding UI
Allow users to bind properties to tuple types.

**UI states:**
1. **Editing property name** - Autocomplete shows existing properties
2. **Existing properties list** - Select to replace current property
3. **Existing tuple types list** - Select to bind
4. **Position selection** - Choose host position after selecting tuple type
5. **Create new tuple type** - Full control mode

**Quick-create:** `→` at end of property name:
- Creates tuple type with property name
- Position 0 = property name, Position 1 = empty
- Property immediately bound

---

### Phase 6: Linked Blocks
Add and display linked blocks in property sections.

**Add flow:**
1. User clicks `+` in property section
2. New node created (empty title)
3. Tuple instance created with bound tuple type
4. Focus moves to new node for editing

**Display:**
- Query tuple instances where `position{hostPosition}` = current page
- Display nodes from `position{displayPosition}`
- Each linked block shows as rendered title (clickable to navigate)

---

## Testing Strategy

Each phase should have tests written BEFORE implementation (TDD):

1. **ViewT Service** - Unit tests for getOrCreateView, getViewsForPage
2. **PropertyT Service** - Unit tests for CRUD operations
3. **Property Section UI** - Browser tests for rendering
4. **Creation Flow** - Browser tests for `> ` trigger
5. **Binding UI** - Browser tests for selection flows
6. **Linked Blocks** - Browser tests for add/display

---

## Dependencies Between Phases

```
Phase 0 (Schema) ✅
    ↓
Phase 1 (ViewT) ✅ ←──────┐
    ↓                     │
Phase 2 (PropertyT) ✅ ───┤
    ↓                     │
Phase 3 (UI) ─────────────┘
    ↓
Phase 4 (Creation)
    ↓
Phase 5 (Binding)
    ↓
Phase 6 (Linked Blocks)
```
