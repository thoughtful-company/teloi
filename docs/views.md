# Views

Views control how a node's content is displayed. A node can have multiple views (e.g., page view, table view), each with its own configuration.

## How Views Work

A view is a node linked to a page via `HAS_VIEW(page, viewNode)` tuple. View nodes live as shadow children of the page by default. The view node stores configuration like column order, visibility settings, and which properties to display.

The buffer tracks which view is active via `activeViewId`. When `activeViewId` is null, the default page/tree view is shown.

View tabs appear automatically when a node has 2+ views. Clicking a tab updates the buffer's `activeViewId`.

## View Types

**Page view**: The default hierarchical outline. No view node is required, but one can be added to configure properties or other settings. When `activeViewId` is null, page view is rendered.

**Table view** (`system:table-view`): Renders children as rows with columns derived from tuple relationships. See `docs/specs/table-feature.md`.

**Chat view** (`system:chat-view`): Renders children as a conversation with role labels, visual grouping, and ordering validation. See `docs/specs/chat-feature.md`.

## Views and Properties

Views link to properties via `Has_Property(view, property)` tuples. This determines which property sections appear when that view is active. Different views on the same page can show different sets of properties.

When a property is created (via `> ` syntax), the system finds or creates a view for the current page and links the property to it.

## Data Model

View nodes are regular nodes stored as shadow children of their page. They have:
- A title (stored in Y.Text, e.g., "Table View", "Projects Overview")
- A type (optional, e.g., `system:table-view`)
- Configuration stored via tuples or shadow children (view-type specific)

The `HAS_VIEW` tuple links pages to views:
- Position 0: The page node
- Position 1: The view node

Buffer documents store the active view:
- `activeViewId: Id.Node | null`
- null means default page view
- Otherwise references a view node

## Creating Views

Views are created through commands or UI actions. For example, the "Create Table View" command:
1. Creates a view node as a shadow child of the current page
2. Sets its type to `system:table-view`
3. Creates `HAS_VIEW(currentPage, viewNode)` tuple
4. Sets buffer's `activeViewId` to the new view

## Querying Views for a Node

To find all views for a node, query `HAS_VIEW` tuples where position 0 = the node. The view nodes are at position 1.
