# App Redesign Spec

Working document capturing decisions for the redesign described by the
`teloi-handoff` bundle (Claude Design export, May 2026). The bundle's HTML/JSX
prototypes are the visual reference; this file is the source of truth for
how we map the prototype onto our domain model.

> **Status:** in progress — being filled in question-by-question through
> discussion. Each section ends with **Decision** (locked) or **Open** (still
> to settle). Update this file whenever a decision lands.

---

## 1. Tab model

The prototype treats a "tab" as a composite view: a primary identity (chat or
note) plus a list of attached pane "object pips". We're collapsing that
asymmetry — a tab is just an ordered set of buffers.

### Decision

A tab is:

```ts
Tab = { id: TabId, buffers: BufferId[] }   // buffers[0] is "main"
```

- A tab holds nothing else of its own — no stored title, icon, or dirty
  flag. The tab's display identity is **derived from `buffers[0]`'s
  document** (title, icon, dirty state). Renaming the underlying node
  renames the tab.
- Panes in `<main>` are rendered one per entry in `buffers`. Switching tabs
  swaps the whole pane row.
- In the top-bar tab UI, `buffers[1..]` render as pips inside the tab.
  Closing a pip removes that buffer from the tab's array (dismissing its
  pane); opening a new pane (split-right) appends to the array.

### Decision — chat is a node, not a special buffer kind

There is no separate `ChatBuffer` type. An AI chat is **a regular node
whose primary type is `ai-chat`**. The `EditorBuffer` component dispatches
on the node's primary type to render the appropriate view (note editor vs
chat view vs other future types).

This means:

- The pipeline stays uniform: tabs → buffers → nodes.
- The chat pane visuals from the prototype need to be re-skinned to fit
  the normal node-pane frame (breadcrumb header, etc.). We'll do that as
  a follow-up — chat-as-tab is **not in this redesign pass**.
- Tool-call rendering (Query/Read) becomes a renderer for chat-node
  content; it's not a tab-level concept.

### Open

- **URL encoding.** Today: `/workspace/<nodeId>`. With multi-buffer tabs the
  URL needs a story. Working assumption (not yet confirmed): tabs are
  persisted state in LiveStore, and the URL points at the active tab's
  main buffer's node — i.e. URL shape stays `/workspace/<nodeId>` and the
  rest of the tab state is restored from store. To confirm before
  implementing.
- **Persistence.** Whether tabs are persisted at all, and at what scope
  (per workspace? per device?). To discuss.

---

## 2. ChatPane / AI chat

Deferred. The prototype's `ChatPane` lives as a sibling pane inside
`<main>` with its own header (assistant pill + chat title) and tool-call
rendering. Because we've decided chat is just a node with primary type
`ai-chat`, this becomes "render an ai-chat node inside a regular pane
frame" — visuals will need redesign in a later pass.

Out of scope for this redesign pass; revisit after tabs + node panes land.

---

## 3. Properties block ↔ existing Property / PropertySection

We already have a Property model: see `docs/specs/properties.md` (lives on
the `feature/property-enter-ordering` / `refactor/khora-active-view`
branches, not yet on this branch). Recap:

- **Property** is its own node (system type `#property`) under
  `workspace:schema`, with `title`, `hostPosition`, `displayPosition`,
  bound to a tuple type via `PROPERTY_USES_TUPLE(property, tupleType)`.
- A **View** on a page references properties via
  `HAS_PROPERTY(view, property)`.
- The right-hand side of a property is **0..N linked blocks** — real
  nodes from tuple instances of the bound tuple type, fractional order.
- Rendered as `PropertySection`, not as page children. ID scheme:
  `frame:.../node:.../property:.../tuple:...`.

### Decisions

- **Design first against the current branch, then merge.** We design the
  redesign within current capabilities (no Property/Khora/View code on
  this branch yet). Merging the Property branches into the redesign
  baseline is a separate step that happens after the visual/structural
  redesign work is settled.
- **Single Property model with a presentation-kind hint (option (a)).**
  We do **not** introduce a parallel "scalar property" mode. Every
  property in the design — `select`, `text`, `date`, `check`, `num`,
  `link`, `user` — is just a `PropertySection` with a presentation hint
  that controls how its linked tuple data is rendered. The existing
  N-linked-blocks rendering (e.g. Projects ↔ Tasks) is one of those
  presentation kinds (default / `list`).
  - `check` → linked node is `TRUE` / `FALSE` (system Boolean nodes).
  - `select` → linked node carries a type with `TYPE_HAS_COLOR` for tone.
  - `text` / `num` / `date` → linked node whose title is the literal
    value. Date/number formatting is a presentation concern, not a
    storage concern.
  - `link` / `user` → linked node is whatever the relationship resolves
    to.
- **Hidden + recommended properties** are configured on the node's view,
  via a tuple linking the view to property nodes that are
  "hidden-but-recommended" for that view. This is the source for the
  `+ Areas / + Owner / + Linked refs` chip row in the prototype.
- The full UI for managing this lives on a **node view settings page**
  that doesn't exist yet — that's a separate design task we'll come back
  to. For now, the chip row's data source is defined; the editor for it
  isn't.

### Open

- **Where does the presentation kind live on a Property?** Either a
  meta-type applied to the property node (matches how `RENDERING_TYPE`
  works on rendering types), or a config tuple (matches how
  `PROPERTY_CONFIG` and `TYPE_HAS_COLOR` work). Picking one is a small
  decision but worth doing once.
- **Arity / max linked blocks.** The single-value kinds (`check`,
  `select`, etc.) imply at most one linked block. Do we enforce that
  via the property config, via the tuple type's role constraints, or
  purely as a UI affordance ("after one block is added, the + button
  disappears")?

---

## 4. Tag chips ↔ node types

The prototype renders a band of `#tag` chips below the note title (e.g.
`#living-systems` green, `#reference` blue). In our model these are
simply the **page node's types**, displayed as chips. There is no
separate tag store.

### Decisions

- The design's `tags: [{name, tone}]` data is a fixture-only shape; the
  real source is the node's applied types. We already have `TypeBadge`
  / `TypeList`. We extend their visuals to match the chip look (hash
  icon, tone background) rather than introducing a new entity.
- Editing tags (the `+ Add` / `×` UI in the RefsPane Tags tab, and any
  inline tag editor on the note) delegates to the existing
  add/remove-type machinery.
- The Property *named* `Type` in the prototype (e.g. `Type = Field
  synthesis`) is **unrelated** to tags or to our type system. It's just
  a Property that happens to be named "Type." Confusing prototype
  naming; safe to rename in our copy.
- Tone resolution stays canonical: chip color comes from
  `TYPE_HAS_COLOR` (full OKLCH via `COLOR_HAS_BACKGROUND` /
  `COLOR_HAS_FOREGROUND`, or a direct color value). The prototype's
  named palette (`green` / `blue` / `amber` / `pink` / `neutral`) is
  presentational only — we don't store named tones, we store colors.

---

## 5. Inline links inside block text — deferred

The prototype encodes inline cross-note references as ad-hoc shapes
inside list items (`{ text, link, text2 }` with a clickable chip
inlined between text spans). This is the only inline-reference
mechanism the prototype has.

### Decisions

- **Deferred.** Not in scope for this redesign pass.
- The prototype's inline-link design is **underdesigned** — the chip
  shape, the trigger affordance, the editing semantics (how cursor
  treats the chip, what `Backspace` does, how the picker works) and
  the relationship to backlinks/RefsPane are all missing. Before we
  implement inline links we need a proper design pass.
- Adding a separate design-todo entry below for this. Implementation
  decisions (inline-marker vs. wikilink syntax, backlinks index, click
  behavior) are deliberately not locked here.

---

## 6. Callout blocks — not in scope

The prototype defines a `callout` block kind with `q` (open question)
and `note` variants, but the renderer in `main.jsx` filters out `q`
callouts and there are no `note` callouts in the fixtures — nothing
actually renders. The user has confirmed callouts should have been
fully erased from the design file; we don't support them yet.

### Decision

Callouts are **out of scope**. The fixture entries and renderer branch
are leftovers; we don't carry the concept into our model.

---

## 7. Sidebar Home tree — sections, kinds, icons

The prototype's left sidebar Home view is structured into fixed
system surfaces at the top, then user content (Favorites, Spaces).

### Decisions

- **Top-level sections are fixed workspace concepts**, backed by
  system nodes created at bootstrap:
  - `Inbox` — where captured items land (voice memos, clippings,
    "notes from Mira").
  - `Calendar` — calendar surface.
  - `The box` — a deliberate "add-for-later" pile. Items inside
    remind themselves of their existence by drifting back into
    `Inbox` or by showing visible "signs of rotting" if they sit
    too long. (Distinct mechanic; details to design separately.)
- **Space vs Object** is just a type. `space` is a system type
  marker; a node with that type renders as a space (space icon,
  sidebar grouping, etc.). "Objects" is just "any node that isn't a
  space" — no separate `#object` type needed.
- **`Spaces` section is itself a node** — a search/query node that
  yields all nodes with type `space` transitively (including nested
  spaces). It's not a UI-only grouping. The same model presumably
  applies to other "computed" sections.
- **`Favorites` mechanism** — the prototype's `fav: true` flag is
  visual-only and not the real model. The actual mechanism for
  marking and querying favorites needs to be specified (likely a
  tuple like `IS_FAVORITE(workspace, node)`, or a `favorite` type,
  or a `Favorites` search node analogous to `Spaces`). Open.
- **Icon family** — the prototype's `cluster` / `polygon` / `planet`
  / `hexagon` tweak is dev experimentation. We ship **Phosphor**
  icons exclusively, one chosen set. The tweak is dropped.

### Open

- **Search/query node concept.** "Spaces is a search node" implies
  we have (or want to introduce) a node kind that produces a derived
  result list from a query. Is this its own first-class type
  (`#search`? `#query`?), or does it overlap with our existing
  `View` concept (a View already specifies what to show on a page)?
  Worth settling before we implement any of the fixed top-level
  sections.
- **Favorites mechanism** — see above.
- **"The box" mechanic** — the rot/reminder behavior needs its own
  small spec.

---

## 8. Sidebar nav pills + Chat / Search views

The left sidebar swaps its body between three views via three nav
pills (Home / Chat / Search). Home was settled in section 7.

### Decisions

- **Chat view is a lens, not a separate domain.** It's a custom
  sidebar that renders filtered subsets of nodes — pinned chats,
  chats grouped by project, and recent chats. The underlying data
  is the same node graph; the Chat view just queries and groups
  ai-chat nodes. "Projects" are spaces that contain chats.
- **Search view is underdesigned** — the scope chips, grouped
  results, and full-text snippets need a real spec before we
  implement them. **Skip search view for this pass.** The third nav
  pill effectively has no body until search is designed.
- **Nav pill UI state** follows whatever existing convention we use
  for fleeting UI state (sidebar collapse state, etc.). To verify
  against the codebase when implementing.
- **Active-row sync between sidebar and main area** is purely
  visual reflection: when the relevant item happens to be visible
  in the active sidebar view, it gets the active style. It's not a
  global "active chat" / "active node" signal that drives the
  sidebar — the sidebar just observes what's loaded and highlights
  rows that match. If the user switches to the Home tree, the
  active chat row no longer needs to be reflected anywhere.

### Open

- **Pinning a chat to Favorites.** Same open question as Q7's
  Favorites mechanism — needs a real model.
- **Recent chats ordering signal.** Likely `updatedAt` on the
  chat node, but worth confirming when we wire it.

---

## 9. Command palette (⌘K) and quick-open (⌘O)

The prototype collapses everything into one ungrouped CmdK
(notes + tags + commands). We're splitting that into two distinct
surfaces.

### Decisions

- **⌘K = Command palette, commands only.** Linear-style. We keep
  our existing `CommandPalette` model — just a list of named
  commands filterable by label. Visual treatment updates to match
  the prototype's CmdK chrome (input with leading icon, item rows
  with icon + label + meta, footer hint strip). Built on Kobalte
  `Dialog` as today, for accessibility.
- **`Search` is a command inside ⌘K.** Picking it opens whatever
  search affordance we eventually design (currently deferred). No
  notes / tags appear directly inside ⌘K's result list — they live
  behind that command.
- **⌘O = Quick-open**, Obsidian-style. Type a few characters,
  pick a note, open it. Separate surface from ⌘K. Needs its own
  small spec — keeping it on the deferred list.
- **First item selected on open** — confirmed. ⏎ immediately
  acts on the first item.
- **Default open behavior when picking a node** (applies to ⌘O
  quick-open, sidebar tree click, and any future search result
  click):
  - ⏎: open in **current tab** (replaces `buffers[0]`).
  - ⌘⏎: open in **new tab** (new tab with the picked node as
    `buffers[0]`).
  This is Q1's tab model in action: opening a node either updates
  the current tab or appends a new tab.

### Open

- **⌘O quick-open** — details (matches titles only vs. snippets,
  recency boost, etc.). Needs a short spec when we get there.

---

## 10. Workspace switcher — visual only

The prototype's left sidebar header shows a workspace switcher with a
letter glyph, a color, a name, a dropdown of other workspaces, and a
`+ New workspace` action. Today our workspace is hardcoded.

### Decisions

- **Visual only for this pass.** We render the switcher chrome with
  the current (single, hardcoded) workspace; the dropdown can show a
  stub or just the one entry. Real multi-workspace support is
  deferred.
- **Workspace data model is not in scope yet.** No decision on root
  node vs separate database vs partitioned table. Revisit when
  multi-workspace becomes real work.
- **URL shape is not in scope yet.** Stays `/workspace/<nodeId>` for
  now.
- **Per-workspace state (tabs, sidebar nav, etc.) is not in scope
  yet.** Falls out of the data-model decision; same revisit.
- **Glyph + color**: derived automatically by default. Glyph = first
  letter of the workspace name, color = hashed from the name. Users
  can override with a **custom image**.
- **Settings cog** next to the switcher opens **global** app
  settings (not per-workspace).

---

## 11. Block row chrome — drag handle + multi-select

The prototype wraps every block in a `BlockRow` that adds a hover-
revealed six-dot drag handle at the left margin and supports
Cmd/Ctrl-click multi-select with a soft blue row wash.

### Decisions (visual / structural only)

- **Drag handle is visual-only for the redesign pass.** Render the
  six-dot handle (Phosphor icon), fade-in on row hover, calibrated
  per-kind top offsets so it aligns with the first visible line of
  each block kind. No drag-to-reorder behavior wired in this pass
  — reordering stays on its current paths (keyboard moves, etc.).
- **One unified block-selection model.** Cmd/Ctrl-click is a new
  input into the same per-pane / per-buffer block-selection state
  we already maintain for Shift+Arrow keyboard selection. No
  parallel "multi-select mode" — just another way to mutate the
  same `Set<BlockId>`.
- **Multi-selection actions are not in scope for this pass.** We
  render the visual state; the consequences of having a selection
  (delete-all, indent-all, drag-all, …) are separate work.
- **Selection color** uses the prototype's soft blue wash. We pull
  the exact tone from our theme tokens once the theming question
  lands.

### Note

The broader principle the user has now restated several times:
**the prototype is purely visual**. For every remaining redesign
question, decisions are about visual treatment and structural
intent. Interaction semantics and behavior are settled separately
— the redesign doesn't lock them in.

---

## 12. Top-bar chrome

The redesign packs sidebar toggles, back/forward, tabs, and (in the
prototype) a fake sync indicator into one strip. Each piece is
decided independently.

### Decisions

- **Tab fusion with the body** — we adopt the technique (zero gap +
  feet pseudo-elements + matching fills, so the active tab reads as
  the body extruded into the chrome). Inactive tabs are flush-flat.
  Note: a more thorough implementation than the prototype's is
  needed when we build this for real — the prototype works
  but is not airtight across all cases (e.g. split panes, hover,
  reordering).
- **Current one-tab bridge** — until the persisted Tab model exists,
  render the current `Window.panes` as a single active tab. The first
  pane's first buffer supplies the tab identity; remaining panes render
  as attached pips. This is a compatibility mapping for the existing
  window model, not a competing tab model.
- **Back / Forward** — lean is **per-pane history**, not unified
  app-wide. Each pane keeps its own visit stack; the topbar's
  back/forward acts on the currently-focused pane. **Not in scope
  for this pass.** Skip wiring and any specific data flow; we can
  render the buttons but they're decorative until per-pane history
  is designed.
- **Sync indicator** — the prototype's 9s flicker is a leftover.
  **No sync indicator in the UI.** The `syncing` prop/state is
  removed; the topbar doesn't render anything for it.
- **Traffic lights** — do not visually move. The prototype's
  apparent "traffic lights migrate into the topbar when the sidebar
  collapses" was just an artifact of how the design tool positioned
  them. We treat traffic lights as fixed OS chrome at the
  application window's top-left; our app shouldn't redraw or
  re-position them. (Whether we render custom traffic lights or
  defer to native is a separate Electron-side decision; the
  redesign doesn't ask us to relocate them.)

### Open

- **Tab + pane unified shadow.** The active tab and the pane below
  it read as one elevated card; ideally their elevation comes from a
  single soft shadow tracing the combined tab+feet+pane silhouette.
  Today they're separate elements with separate shadows: the pane
  carries the elevation via `--shadow-pane`, the tab carries only an
  inset top-edge highlight, and the feet (curved nested-div arcs)
  cast no shadow of their own. This works visually because the pane's
  shadow alone is enough to lift the composite, and we sidestepped
  every attempt to give the tab its own outer drop shadow — every
  multi-element shadow technique we tried (per-element `box-shadow`,
  `corner-shape: scoop`/`superellipse`, dedicated shadow-caster
  spans) ran into cross-element bleeding because each element casts
  its own shadow and they paint on top of each other.

  Future approach: **shadow ghost layer.** An absolutely-positioned
  div behind everything, sized and shaped to the combined
  (tab + feet + pane) silhouette, carrying the elevation shadow on
  behalf of all three. The tab and pane themselves cast no shadow;
  the ghost casts one. Two viable shapings: (a) `filter:
  drop-shadow(...)` on a wrapper whose children's combined alpha
  forms the silhouette, or (b) a single shaped element
  (`corner-shape` + `box-shadow`, or SVG path + `feDropShadow`)
  sized to the union shape. Requires either CSS anchor positioning
  (`position: anchor()`, Chromium-only) or JS-measured geometry to
  size the ghost dynamically as the tab moves / the pane resizes —
  defer until the simpler "pane-shadow only" approach proves
  insufficient.

---

## 13. Design system foundations

The prototype's tokens are not the final answer — we take inspiration
from the structure, design our own.

### Decisions

- **OKLCH is the canonical color space.** All color tokens use the
  full `oklch(L C H)` form, no HSL fallback.
- **Color tokens** — we **adopt the prototype's surface model and its
  OKLCH values directly** (the ivory family on hue `106.75`), mapped
  onto our primitive `--ivory-*` / `--ink-*` ramp plus a dedicated
  `--surface-sidebar`. The prototype deliberately distinguishes
  several surfaces — near-white doc (`--c-doc` → `--surface-pane`),
  darker ivory backdrop (`--c-bg` → `--surface-app`), and the
  most-saturated ivory sidebar (`--c-sidebar` → `--surface-sidebar`,
  rendered as a radial corner gradient). We keep the primitive →
  semantic layering, but the *values* come from the prototype rather
  than being re-derived. (An earlier draft said to design our own
  values from scratch; that drifted the palette off the prototype's
  hue and flattened the sidebar — corrected.)
- **Token layering** — colors are defined as `primitive palette →
  semantic roles`. Primitive names use familiar numeric scales such
  as `--ivory-100`, not one-off literals scattered through semantic
  tokens. Components should generally consume semantic roles
  (`--surface-pane`, `--text-primary`, etc.) rather than primitives
  directly; we intentionally avoid keeping legacy/component color
  aliases like `--sidebar` or `--card`.
- **Typography tokens** — the prototype's primitive sizes (`--text-xs`
  / `--text-sm` / `--text-md` at 12 / 13 / 16) are mostly right and
  serve as the starting point. The final ladder is ours to tune;
  the prototype's comfy-density variant (13 / 15 / 18) is set aside
  with density itself.
- **Shadow tokens** are semantic material roles, not ordinal names or
  component aliases:
  - `--shadow-pane` — lifted panes, including the sidebar and main
    panes.
  - `--shadow-overlay` — floating surfaces such as command palettes,
    pickers, and menus.
  - `--shadow-control` — elevated controls when needed.
  Shadow colors derive from a semantic helper (`--shadow-color`) that
  can differ between light and dark mode; components should not use
  raw black/white shadow literals.
- **One font: Fixel Variable.** UI, body, headings — everything.
  No Geist, no Geist Mono. (Monospace, if needed for inline code,
  is a separate question to revisit when it comes up.)
- **Icons: Phosphor.** Already settled in Q7.
- **Density modes are not a user setting.** Neither is hue, lift,
  ivory chroma, gradient stop, pane gap, pane radius, control
  height, etc. These become internal design tokens with a single
  shipped value, not user-controllable.
- **Dark mode is the only user-facing theming preference.**
  Implemented via `data-dark` on `<html>` (or equivalent), with
  separate token values for light and dark.
- **The tweaks panel is dropped entirely.** Not user-facing, not
  dev-only, just gone. We tune tokens by editing them in source.

---

## 14. Pane chrome (shared header)

Every pane in `<main>` wears the same header: identity on the left,
actions on the right. Specific decisions for the NotePane variant:

### Decisions

- **Breadcrumb crumbs are clickable.** Each crumb opens that ancestor
  using the standard open-node rule (⏎ = current tab, ⌘⏎ = new
  tab). Full ancestry up to the workspace root; overflow handled by
  flex-shrink + ellipsis on individual crumbs.
- **⋯ more button** stays in the chrome as a visual slot. Menu
  contents are stubbed for this pass.
- **× close button** is **always present**, including on the only
  pane. Closing the only pane in `<main>` is allowed (no `isOnly`
  suppression).
- **ChatPane header design is deferred**, consistent with the Q1/Q2
  decision to redesign the chat pane to fit the standard node-pane
  frame later. NotePane chrome is the pattern for this pass.
- **RefsPane is dropped from the redesign pass.** Its three tabs
  (outline / backlinks / tags) each fall in deferred territory or
  are already handled elsewhere. No dedicated inspector pane.

### Open

- **Empty `<main>` state.** With the only-pane close allowed, we
  need a story for an empty main area: a placeholder "open a node"
  affordance, an auto-redirect to a workspace home, or closing the
  tab when its last pane is closed. Needs a small design pass.

---

## 15. NotePane body interior anatomy (visual)

Vertical stack inside the scrollable pane body:

```
  H1 title
  [tag chips band]      ← grows the gap above the separator when present
  ────────────────────   ← keep the existing header/content separator
  property block
  block rows
  …
```

### Decisions (visual)

- **Strict canonical order: title → tags → separator → property
  block → blocks.** Every NotePane follows this.
- **The existing header/content separator stays.** When the tag
  band is present, the space between the title and the separator
  grows to make room for the band; the separator itself remains
  the same visual rule.
- **Single density: tight.** The comfy variant is dropped.

### Note (process)

For the rest of the redesign discussion: the prototype is a
source for **visuals only**, not structure. Structural decisions
(which component owns the title, where the tag-add affordance
lives in our code, how editing flows are wired, etc.) are out of
scope here and live in their own designs / specs / TODOs.

---

## 16. Pane materiality (visual)

### Decisions

- Panes are **rounded rectangles** with a small-but-distinct corner
  radius (not sharp, not pillowy).
- Adjacent panes inside `<main>` are separated by a **uniform gap**.
- Panes are separated from the backdrop by both a small inset
  margin and a faint shadow / chromatic step — the "lift" effect.
  One consistent value across the app, not user-toggleable. The lift
  is expressed through semantic shadow tokens (`--shadow-pane` for
  panes and `--shadow-overlay` for floating surfaces), not ordinal
  names or component-specific aliases.
- All panes share the same chrome — same radius, same lift,
  regardless of pane kind.
- The **left sidebar is a lifted pane** sharing the same radius,
  inset, and shadow lift as panes in `<main>` — but it is **not the
  same surface**. The sidebar is its own ivory surface
  (`--surface-sidebar`, the most-saturated ivory) painted as a soft
  **radial corner gradient** (`--gradient-sidebar`), deliberately
  distinct from the near-white document surface (`--surface-pane`)
  used by `<main>` panes and the active tab. (An earlier draft
  collapsed these into one flat material — wrong: the prototype's
  `.sidebar` is a saturated-ivory gradient while `--c-doc` is
  near-white.)
- Lifted panes and overlays may use slight translucency with backdrop
  blur when it supports the material effect. The token role still
  remains the semantic surface (`--surface-pane` / `--surface-overlay`);
  the alpha/backdrop treatment is a visual material treatment, not a
  new color role.
- Sub-pane visual details (e.g., how the property block frames
  itself inside a note pane) are tuning details, not part of the
  redesign contract.

---

## 17. Block-type visual ladder — deferred

Block types (H1 / H2 / H3 / p / ul / ol / …) aren't designed yet. We
don't lock a visual ladder in this pass and don't implement
redesigned block-type visuals here.

---

## 18. Prototype audit — explicit leftovers / non-goals

These are present in the handoff files but should **not** be treated as
active design requirements.

- **`BottomBar` is dead code.** `chrome.jsx` defines `BottomBar` and
  `styles.css` still contains bottom-bar / crumb / status styles, but
  `app.jsx` does not render it. Do not reintroduce a bottom bar from
  this prototype.
- **Sync UI is leftover.** `app.jsx` has fake periodic sync state and
  `styles.css` has `.sync-dot` / avatar sync styling. The user
  confirmed there should be no visible sync indicator.
- **`ChatFab` is dead/deferred.** `right.jsx` defines it, comments
  refer to it, but `app.jsx` does not render it. Since ChatPane itself
  is deferred, the floating chat FAB is also not part of this pass.
- **`RefsPane` is dead/deferred.** Defined in `main.jsx`, not rendered
  by `app.jsx`, and explicitly ignored for this redesign pass.
- **Sidebar Search is prototype-only for now.** `SearchView` is fully
  implemented in `left.jsx` and wired to the Search nav pill, but the
  user confirmed search is underdesigned. Do not port its grouped
  results / scope chips as-is.
- **Mixed-content CmdK is rejected.** Prototype CmdK mixes notes,
  tags, and commands. Our `⌘K` stays commands-only; `⌘O` quick-open
  is separate and still needs a small spec.
- **TweaksPanel is dropped.** `tweaks-panel.jsx`, `TWEAK_DEFAULTS`,
  live token sliders, density/hue/lift toggles, and node-icon style
  switches are all prototype tooling, not product UI.
- **Callout and quote block fixtures are not requirements.** The
  prototype fixture includes `callout` and `quote` entries; current
  `main.jsx` filters/skips at least some of them. Block-type visuals
  are not designed yet, so don't infer new block types from these
  fixtures.
- **Inline-link fixture shape is not a design.** `{ text, link,
  text2 }` list items are underdesigned and deferred.
- **Prototype icon experimentation is rejected.** We use one Phosphor
  icon set. Custom cluster/node icon families and icon-style toggles
  are not requirements.
- **Old v1/header comments are stale.** Some file comments still
  describe an older layout with bottom bar, right AI sidebar, recents,
  etc. The active decisions in this spec override those comments.

---

## Pending design work

- **ChatPane / `ai-chat` node renderer** — redesign to fit the normal
  node-pane frame; tool-call rendering belongs there later.
- **Empty `<main>` state** — what shows when a tab has no panes
  (placeholder / redirect / close tab?).
- **Block-type visual ladder** — H1/H2/H3/body/list/quote/etc. needs
  a real visual design before implementation.
- **Per-pane back/forward history** — visit stack per pane,
  focus-aware topbar buttons, modifier behaviors.
- **Node view settings page** — where hidden+recommended properties
  are managed.
- **Inline cross-note references** — chip shape, trigger, editing
  semantics, backlinks index, click behavior.
- **Sidebar Search view** — scopes, snippets, ranking, and relation
  to quick-open/search command.
- **⌘O quick-open** — matching, ranking, scope, and open modifiers.
- **Multi-workspace data model + URL + per-workspace state** —
  deferred until multi-workspace becomes real work.
- **Search/query node concept** — first-class type or overlap with
  View.
- **Favorites mechanism** — tuple / type / search node.
- **"The box" rot/reminder mechanic** — needs its own spec.
