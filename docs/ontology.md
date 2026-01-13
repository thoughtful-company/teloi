# Ontology Design

This document captures the evolving design for Teloi's type system and node ontology.

## Core Principles

1. **Everything is a node** — Types themselves are nodes. A "Type" is just a node that has the meta-type `RENDERING_TYPE` (or other meta-types) applied to it.

2. **Nodes can have multiple types** — A node can be both `#task` and `#urgent`. Types are not mutually exclusive.

3. **Type inheritance** — Types can have supertypes. If `#urgent` is a subtype of `#priority`, then a node with `#urgent` implicitly has `#priority` behavior too.

## Planned Type Categories

### Rendering Types
Types that affect how a node is rendered in the UI. Examples:
- Title
- Paragraph (default)
- List item
- Heading levels
- Code block

A node gets a rendering type by having a type applied that itself has the `RENDERING_TYPE` meta-type.

### Semantic Types (future)
User-defined types for organizing content:
- `#task`, `#project`, `#person`, `#meeting`
- These don't affect rendering directly but enable filtering, queries, and structured views

## Tuples

Tuples are structured relationships between nodes with defined roles. A TupleType defines the schema (positions, constraints), and Tuple instances store actual relationships.

**Example: IS_CHECKED**
```
IS_CHECKED(subject: Node, value: Boolean)
```
A checkbox uses this tuple to store its checked state. Position 0 = the checkbox node, position 1 = TRUE or FALSE.

**Tuple Tables:**
- `tuple_type_roles` — Schema definitions (position, name, required)
- `tuple_type_role_allowed_types` — Type constraints per position
- `tuples` — Tuple instances (id, tupleTypeId)
- `tuple_members` — Member values (tupleId, position, nodeId)

**Service API (`TupleT`):**
- `addRole()` — Define a position in a TupleType schema
- `addAllowedType()` — Add type constraint to a position
- `create()` — Create tuple instance with members
- `findByPosition()` — Find tuples where position has value
- `subscribeByPosition()` — Stream of tuples matching criteria

## Type Display Configuration

Types can have their visual appearance configured via tuples.

### Color Configuration

**Tuple Types:**
- `TYPE_HAS_COLOR(type: Node, color: Node)` — Links a type to its display color
- `COLOR_HAS_BACKGROUND(color: Node, value: Node)` — Links color node to background CSS
- `COLOR_HAS_FOREGROUND(color: Node, value: Node)` — Links color node to foreground CSS

**Full Color Node** (explicit bg + fg):
```
System.COLOR_GREEN
  ├─ COLOR_HAS_BACKGROUND ──▶ node("oklch(0.92 0.05 145)")
  └─ COLOR_HAS_FOREGROUND ──▶ node("oklch(0.35 0.12 145)")

System.LIST_ELEMENT ──TYPE_HAS_COLOR──▶ System.COLOR_GREEN
```

**Direct Value** (single color, derive complement):
```
TYPE_HAS_COLOR(MyType, node("oklch(0.92 0.05 250)"))
```
When only background is specified, foreground is derived: `oklch(0.35 0.12 H)` where H is the hue from the background.

**Fallback Chain:**
1. Look up `TYPE_HAS_COLOR(typeId, ?)` for the type
2. If not found → use `System.DEFAULT_TYPE_COLOR` (green hue 145)

**Service:** `TypeColorT` provides `getColors(typeId)` and `subscribeColors(typeId)` for resolving type colors.

## Implementation Status

- [x] Basic type assignment to nodes
- [ ] Type inheritance (supertypes)
- [x] Meta-types (types that classify other types)
- [x] Rendering type → component mapping (BlockType registry)
- [x] Tuples and TupleTypes
- [x] Type color configuration

---

## Reference: Previous Schema

The schema below is from a previous iteration of the project. It used a command/event pattern (before LiveStore). Preserved here as reference for the concepts, not as implementation guidance.

### Primitives and Core Types

```typescript
import { Schema } from "effect";

export const PRIMITIVES = {
  commandId: Schema.String.pipe(
    Schema.annotations({
      description: "Unique identifier for command",
    }),
  ),
  eventId: Schema.String.pipe(
    Schema.annotations({
      description: "Unique identifier for an event",
    }),
  ),
  nodeId: Schema.String.pipe(
    Schema.annotations({
      description:
        "Unique identifier for any node (Node, Type, Tuple, TupleType)",
    }),
  ),
  docType: Schema.Literal(
    "node",
    "tuple",
    "type",
    "tupleType",
    "reference",
  ).pipe(
    Schema.annotations({ description: "The fundamental category of the node" }),
  ),
  timestamp: Schema.Number.pipe(
    Schema.annotations({ description: "Unix timestamp in milliseconds" }),
  ),
  schemaVersion: Schema.Number.pipe(
    Schema.annotations({ description: "Version number for the event schema" }),
  ),
  roleName: Schema.String.pipe(
    Schema.annotations({
      description: "Name of a role/position within a tuple",
    }),
  ),
  roleId: Schema.String.pipe(
    Schema.annotations({
      description: "Unique identifier for a role/position",
    }),
  ),
  hasTypes: Schema.Array(Schema.String),
  hasTuples: Schema.Array(Schema.String),
  hasSupertypes: Schema.Array(Schema.String),
} as const;

export const referenceLocationSchema = Schema.Struct({
  instanceId: PRIMITIVES.nodeId,
  parentId: Schema.Union(PRIMITIVES.nodeId, Schema.Null),
});
export type ReferenceLocation = typeof referenceLocationSchema.Type;

export namespace PRIMITIVES {
  export type CommandId = Schema.Schema.Type<typeof PRIMITIVES.commandId>;
  export type EventId = Schema.Schema.Type<typeof PRIMITIVES.eventId>;
  export type NodeId = Schema.Schema.Type<typeof PRIMITIVES.nodeId>;
  export type DocType = Schema.Schema.Type<typeof PRIMITIVES.docType>;
  export type Timestamp = Schema.Schema.Type<typeof PRIMITIVES.timestamp>;
  export type SchemaVersion = Schema.Schema.Type<typeof PRIMITIVES.schemaVersion>;
  export type RoleName = Schema.Schema.Type<typeof PRIMITIVES.roleName>;
  export type RoleId = Schema.Schema.Type<typeof PRIMITIVES.roleId>;
  export type HasTypes = Schema.Schema.Type<typeof PRIMITIVES.hasTypes>;
  export type HasSupertypes = Schema.Schema.Type<typeof PRIMITIVES.hasSupertypes>;
}
```

### TupleType Schema Definition

```typescript
export const cardinalitySchema = Schema.Struct({
  min: Schema.optionalWith(Schema.Number, { default: () => 0 }),
  max: Schema.optionalWith(Schema.Union(Schema.Number, Schema.Literal("*")), {
    default: () => "*",
  }),
});

export const memberConfigSchema = Schema.Struct({
  roleName: PRIMITIVES.roleName,
  required: Schema.Boolean,
  allowedTypes: Schema.optional(Schema.Array(PRIMITIVES.nodeId)),
  description: Schema.optional(Schema.String),
  cardinality: Schema.optional(cardinalitySchema),
});

export const tupleTypeSchemaDefinitionSchema = Schema.Struct({
  members: Schema.Record({
    key: PRIMITIVES.roleId,
    value: memberConfigSchema,
  }),
}).pipe(
  Schema.annotations({
    description:
      "Defines the structure (roles, constraints) for a specific type of Tuple, keyed by stable Role IDs.",
  }),
);
```

### Rich Text Content (Slate-like)

```typescript
const TextBlockSchema = Schema.Struct({
  text: Schema.String,
}).pipe(
  Schema.extend(Schema.Record({ key: Schema.String, value: Schema.Unknown })),
  Schema.annotations({ identifier: "TextBlock" }),
);

const InlineNodeSchema = Schema.Struct({
  type: Schema.Literal("inline_node"),
  id: PRIMITIVES.nodeId,
  children: Schema.Array(TextBlockSchema),
}).pipe(Schema.annotations({ identifier: "InlineNode" }));

const RichTextElementSchema = Schema.Union(TextBlockSchema, InlineNodeSchema);

export const RichTextContentSchema = Schema.Array(RichTextElementSchema).pipe(
  Schema.annotations({
    description: "Slate-like rich text content structure",
  }),
);
```

### Node Repository Types

```typescript
export const getNodeSchema = Schema.Struct({
  id: PRIMITIVES.nodeId,
  ownerId: PRIMITIVES.nodeId,
  docType: PRIMITIVES.docType,
  createdAt: PRIMITIVES.timestamp,
  textContent: RichTextContentSchema,
  modifiedAt: PRIMITIVES.timestamp,
  hasTypes: Schema.Array(PRIMITIVES.nodeId),
  hasSupertypes: Schema.Array(PRIMITIVES.nodeId),
});
```

### Events (Command/Event Pattern)

The old system used explicit events for all mutations. Key events included:

**Node Events:**
- `nodeCreated` — New node with textContent, ownerId
- `nodeDeleted` — Permanent deletion
- `nodeOwnerSet` — Change node's owner
- `nodeTextContentUpdated` — Update rich text content
- `nodeMoved` — Move node to new parent with sibling positioning
- `referenceNodeCreated` — Create a reference to another node

**Type Events:**
- `typeCreated` — Create a new Type node
- `typeDeleted` — Delete a Type node
- `typeAddedToNode` — Associate a type with a node
- `typeRemovedFromNode` — Disassociate a type from a node
- `baseNodeTypeChanged` — Change the primary type of a node
- `supertypeAddedToType` — Establish inheritance relationship
- `supertypeRemovedFromType` — Remove inheritance relationship

**TupleType Events:**
- `tupleTypeCreated` — Create a new TupleType with schema definition
- `tupleTypeDeleted` — Delete a TupleType
- `tupleTypeSchemaUpdated` — Modify the schema (roles, constraints)

**Tuple Events:**
- `tupleCreated` — Create tuple instance with tupleTypeId and members
- `tupleDeleted` — Delete tuple instance
- `tupleMemberSet` — Set/update a member in a role

### Key Concepts from Old Schema

1. **Stable Role IDs** — Tuple roles use stable IDs rather than names, allowing role renaming without breaking references.

2. **Owner vs Parent** — `ownerId` is about ownership/permissions, `parentId` (in nodeMoved) is about document structure.

3. **Reference Nodes** — A reference node points to an original, allowing the same content to appear in multiple places.

4. **Member Cardinality** — Tuple roles can specify min/max for how many nodes can fill that role.
