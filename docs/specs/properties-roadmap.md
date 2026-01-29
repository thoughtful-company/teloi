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
- Methods: `createProperty`, `getPropertiesForView`, `bindToTupleType`, `getLinkedBlocks`, `addLinkedBlock`, `quickCreateTupleType`
- Properties are children of `System.SCHEMA` with type `PROPERTY`
- Binding creates `PROPERTY_USES_TUPLE` and `PROPERTY_CONFIG` tuples
- Tests: `apps/web/src/__tests__/Property.browser.spec.tsx` (16 tests)

### Phase 3: Property Section UI ✅
- Created `apps/web/src/ui/PropertySection.tsx`
- PropertySection renders property name (editable via Editor) on left
- Linked blocks display on right as full Block components
- Ghost block shown when property bound but no linked blocks
- Integrated into Buffer via PropertyList component
- Tests: `apps/web/src/__tests__/PropertySection.browser.spec.tsx` (8 tests)

### Phase 4: Property Creation Flow ✅
- `> ` trigger implemented in `BlockType/propertyTrigger`
- Creates view, property, and HAS_PROPERTY tuple
- Deletes the triggering block
- Tests: Part of PropertySection tests

### Phase 5a: Quick-Create Flow ✅
- ArrowRight at end of unbound property name triggers quick-create
- Creates tuple type `{propertyName}_Tuple` as shadow child of SCHEMA
- Creates position nodes with proper titles
- Binds property with `hostPosition: 1`, `displayPosition: 0`
- Creates initial linked block with title "untitled"
- Focus moves to new linked block
- Tests: `apps/web/src/__tests__/PropertyQuickCreate.browser.spec.tsx` (8 tests)

### Phase 6a: Linked Blocks Display ✅
- Linked blocks render as full Block components (not buttons)
- Custom action handler intercepts tree operations (Tab, Enter, Navigate)
- Enter creates new linked block
- ArrowUp/Down navigates between linked blocks
- ArrowLeft returns to property name
- Backspace at start navigates back (no merge)
- Ghost block clickable to create first linked block
- Tests: `apps/web/src/__tests__/PropertySectionLinkedBlocks.browser.spec.tsx` (18 tests)

### Phase 6b: Tuple-Based Block ID Scheme ✅
Refactored block IDs to properly represent the tuple relationship, not just the displayed node.

**Old format (deprecated):**
```
section:{sectionId}/node:{nodeId}
```

**New format:**
```
buffer:{bufferId}/node:{hostNodeId}/property:{propertyId}/tuple:{tupleId}
```

**Key changes:**
- `BlockContext.section` now includes `bufferId`, `hostNodeId`, `propertyId`, `tupleId`
- `displayNodeId` is derived from tuple lookup (not stored in ID)
- Added `Id.makePropertyBlockId()` and `Id.VIRTUAL_TUPLE` sentinel
- `PropertyT.getLinkedTuples()` returns `{ tupleId, displayNodeId }[]`
- Block component accepts optional `nodeId` prop for section blocks
- Updated `Block/subscribe.ts` to derive nodeId from tuple

**Why this matters:**
- The linked block represents a **tuple instance** (relationship), not just a node
- Deleting a "linked block" means deleting the tuple, not the node
- The same node could appear in multiple tuples
- Proper UI anchor with bufferId + hostNodeId

---

## Remaining Phases

### Phase 5b: Property Binding UI (Advanced)
Allow binding to existing tuple types.

**Not yet implemented:**
1. **Property name autocomplete** - Show existing properties matching typed text
2. **Existing properties selection** - Replace unbound property with existing one
3. **Existing tuple types list** - Browse/select tuple types to bind
4. **Position selection** - Choose which position the host page occupies
5. **Full tuple type creation** - Create with custom position names

**Navigation paths (from spec):**
| Action | Context | Result |
|--------|---------|--------|
| `↓` | At last line of editor | Enter existing properties selection |
| `→` | In properties selection | Move to tuple types selection |
| `→` | In tuple types selection | Move to create new tuple type |
| `←` | At first position | Enter create new tuple type |

---

### Phase 7: Property Settings Panel
Expandable settings below property name.

**Trigger:** `Cmd+Down` on property name

**Settings:**
- Change bound tuple type
- View/edit position names
- Display configuration

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
Phase 3 (UI) ✅ ──────────┘
    ↓
Phase 4 (Creation) ✅
    ↓
Phase 5a (Quick-Create) ✅
    ↓
Phase 6a (Linked Blocks) ✅
    ↓
Phase 6b (Tuple-Based IDs) ✅
    ↓
    ├─→ Phase 5b (Advanced Binding) ← Next
    │
    └─→ Phase 7 (Settings Panel)
```
