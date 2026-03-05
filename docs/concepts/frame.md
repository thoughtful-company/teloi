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

Currently the only part is `"khora"` — the body region rooted at the frame's assigned khora. Widgets (e.g., side panels) will be additional parts in the future.

### Khora Part

The khora part owns the selection state for the body region:

- **`selectedKhoraIds`** — which khoras are currently selected (one for single selection, multiple for range selection)
- **`anchor` / `focus`** — define the endpoints of a range selection

Text selection (cursor position within an active khora) lives on the individual block document, not on the part.

See `docs/concepts/khora.md` for what a khora is and how khora URIs work.

## Views

A frame can display its node in different views. The frame always has at least the default page view. Additional views (table, chat) are created explicitly and stored as view nodes linked to the page via `HAS_VIEW` tuples.

The frame tracks which view is active. When no specific view is selected, the page view is shown. Switching views changes only the body — the header remains the same.

See `docs/views.md` for the data model and service API behind views.
