# Frame

A Frame is the top-level interaction container. It holds an assigned khora and manages focus, selection, and view state around it.

## Anatomy

```
┌─ Frame ─────────────────────────┐
│ ┌─ Header ────────────────────┐ │
│ │ Title                       │ │
│ │ Types + Commands bar        │ │
│ │ View Tabs (when 2+ views)   │ │
│ └─────────────────────────────┘ │
│ ┌─ Body ──────────────────────┐ │
│ │ View-specific content       │ │
│ └─────────────────────────────┘ │
└─────────────────────────────────┘
```

### Header

The header is shared across all views. It contains:

- **Title** — the node's name, rendered as an editable text field.
- **Types + Commands bar** — displays the node's types and available commands.
- **View Tabs** — when a node has two or more views, tabs appear so the user can switch between them. Hidden when there is only one view.

### Body

The body is entirely owned by the active view. Each view type implements its own way of rendering the node's content:

- **Page view** — the default hierarchical outline. Renders the node's children as blocks, with properties shown above the outline.
- **Table view** — renders children as rows with typed columns.
- **Chat view** — renders children as a conversation with role labels and visual grouping.

## Parts

A frame is divided into **parts** — regions that can independently hold focus. The frame tracks which part is active via `activePart`.

The only part is `"khora"` — the body region rooted at the frame's assigned khora. Widgets (e.g., side panels) will be additional parts in the future; the parts model supports them but they are deferred.

`activePart` works the same way as the world's `activeFrameId` — it's a reference to which region has focus, not a mode enum.

## Focus

There is no `focusMode` field. Mode is derived from state:

- **Editing** — a khora has text selection (`textSelection != null`)
- **Khora selection** — one or more khoras are selected (`selectedKhoras.length > 0`)

These are mutually exclusive. If multiple khoras are selected, none is "active" in the editing sense.

### Khora Part

The khora part owns selection state for the body region:

- **`selectedKhoras`** — which khoras are currently selected (one for single selection, multiple for contiguous range selection)
- **`anchor` / `focus`** — define the endpoints of a range selection

Text selection lives on individual khora (block) documents, not on the frame. Each khora tracks its own cursor state (`anchor`, `head`, `assoc`, `goalX`, `goalLine`).

See `docs/concepts/khora.md` for what a khora is and how khora URIs work.

## Assigned Khora

`assignedKhoraId` identifies the top-level khora the frame is a container for. Both frame and khora are containers for a node, but at different levels — the frame is the interaction shell, the khora is the selectable vessel.

## Views

A frame can display its node in different views. The frame always has at least the default page view. Additional views (table, chat) are created explicitly and stored as view nodes linked to the page via `HAS_VIEW` tuples.

The active view is tracked per-khora, not per-frame — the khora's `activeViewId` determines how its content is presented. The frame provides the interaction shell; the khora decides the view. Switching views changes only the body — the header remains the same.

See `docs/views.md` for the data model and service API behind views.
