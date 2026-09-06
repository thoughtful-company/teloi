# Web app architecture

How apps/web is put together today. Rules that follow from this live in apps/web/CLAUDE.md. The view system has its own document, docs/views.md.

## Components

App holds a Sidebar for navigation and the page list, and a FrameView. FrameView renders one node. It subscribes to the frame shell state and the root khora's view state, then renders the title, view tabs, properties and content. Depending on the root khora's activeViewId it renders the default outline page view or an alternate view such as TableView.

Title and Block behave the same way. Unfocused, they render plain text. Focused, they render the Editor, a thin wrapper around CodeMirror. A Block renders its child blocks below it.

## Action handling

Two systems exist. The new one is the target, the old one is being migrated.

New: KeyEventBus maps key events to Command objects through layered keymaps (plain, meta, shift, alt, blockSelection). CommandBus dispatches a command to its static handle method. Events arrive from two sources, "editor" for CodeMirror and "app" for window keydown while in khora selection mode. Commands live in commands/.

Legacy: components emit primitives (KeyDown, SelectionChange, Blur, Focus, Click) through createDispatch(runtime). ActionT in services/ui/Action/ reads model state, decides what the primitive means, and applies the change. It runs synchronously with runSync because preventDefault needs an immediate decision.

## Focus

Focus follows state, the DOM never leads. A handler calls Frame.enterBlockEditing(khoraId) or Frame.enterKhoraSelection(frameId). KhoraT.subscribe emits a view with isActive true. The khora component renders the Editor. The Editor calls view.focus() on mount. Nothing else calls focus.

Two focus modes have two owners. Editing focus is frame.activeKhoraId together with the khora document's textSelection. Khora-selection focus is frame.khoraSelectionAnchor and frame.khoraSelectionFocus. frame.selectedKhoras is persisted as a derived cache.

Text selection is held by one khora at a time. Frame.getSelection and Frame.setSelection use ActiveKhoraSelection, which is { khoraId, selection: { anchor, head, assoc }, goalX, goalLine }.

## Text content

LiveStore holds structure (nodes, parent_links, ordering), focus state and UI state. Automerge holds the text of each node, through the AutomergeT service and automerge-repo. Split and merge write to both. Typing writes only to Automerge.

## Ghost blocks

Automerge text does not depend on LiveStore, so an Editor can bind to the Automerge text of a node id that has no LiveStore row yet. That is a ghost. On the first structural mutation the ghost is materialized, meaning a LiveStore node is created with the same id, and the typed text is kept because the real Block binds to the same Automerge text.

Today ghosts are used for expand and collapse (services/ui/Khora/expand.ts). Expanding a block with no children shows a ghost child for typing, created by expandOneLevel and materialized by Khora.materialize. PropertySection (ui/PropertySection.tsx) used to plan a ghost path, but property quick-create now makes a real linked block at once from ArrowRight on the property title.

Key files: services/ui/Khora/materialize.ts, services/ui/Khora/getKhoraDoc.ts, services/ui/Khora/expand.ts.

## Services

- KeyEventBusT routes keyboard events to commands through keymaps.
- CommandBusT dispatches command objects to handlers.
- ActionT is the legacy interpretation of keyboard and mouse input.
- PickerT holds type picker state, open or closed and the query.
- KhoraT.subscribe is one stream combining all khora state.
- ViewT queries and creates views (services/ui/View/).
- ChatT collects chat messages and maps roles (services/ui/Chat/).
- StoreT wraps LiveStore with typed queries and Effect streams.
- AutomergeT owns text content.

## LiveStore

Local-first SQLite with event sourcing. The schema is in src/livestore/schema.ts. Events materialize into tables, nodes, parent_links and client documents. StoreT exposes them as typed queries and subscriptions.

## Schema

Domain models use Effect Schema, in src/schema/. Model.DocumentName lists document types (World, Pane, Frame, Khora). Id provides branded id types. Entity holds reusable structures.

## Runtime

src/runtime.ts builds a ManagedRuntime from the full layer, KhoraLive, FrameLive, WorldLive, NodeLive, StoreLive, composed with Layer.provideMerge. LiveStore is initialized in livestore/store.ts. The runtime is exported as BrowserRuntime and provided through SolidJS context.

## Navigation

URLs are /workspace/<nodeId>. The workspace name is hardcoded for now. URLServiceB (services/browser/URLService.ts) gives getPath, setPath and a popstate stream. NavigationT (services/ui/Navigation/) keeps the URL and the frame in sync.
