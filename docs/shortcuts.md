# Keyboard Shortcuts

Two systems handle keyboard shortcuts, with the new system taking priority:

1. **KeyEventBus** (`services/ui/KeyEventBus/`) — maps keys to Command objects via static keymaps
2. **ActionT** (`services/ui/Action/`) — legacy, handles context-dependent logic (e.g., merge at boundary)

KeyEventBus intercepts first. If it handles a key, ActionT never sees it.

## Shortcut Levels

### App-level

Handled in `Action/index.ts` before any mode-specific routing.

| Key | Action |
|-----|--------|
| `Cmd+K` | Open command palette |
| `Cmd+\` | Toggle sidebar |

### Editor mode (cursor in a block)

#### KeyEventBus commands

| Key | Command | Description |
|-----|---------|-------------|
| `Enter` | `Enter` | Split block at cursor |
| `Backspace` | `Backspace` | Delete backward (merge at start) |
| `Delete` | `Delete` | Delete forward (merge at end) |
| `ArrowLeft` | `Left` | Move cursor left |
| `ArrowRight` | `Right` | Move cursor right |
| `ArrowUp` | `Up` | Move cursor up |
| `ArrowDown` | `Down` | Move cursor down |
| `Tab` | `Indent` | Indent block |
| `Escape` | `SelectBlock` | Enter block selection mode |
| `Cmd+ArrowUp` | `Collapse` | Collapse block / navigate to parent |
| `Cmd+ArrowDown` | `Expand` | Expand block (DFS one-level) |
| `Cmd+ArrowLeft` | `MoveToLineStart` | Move cursor to line start |
| `Cmd+ArrowRight` | `MoveToLineEnd` | Move cursor to line end |
| `Cmd+Backspace` | `DeleteToLineStart` | Delete to line start |
| `Cmd+Delete` | `DeleteToLineEnd` | Delete to line end |
| `Cmd+.` | `ZoomIn` | Zoom into block |
| `Cmd+,` | `ZoomOut` | Zoom out |
| `Cmd+Enter` | `ChatSend` | Send chat message |
| `Shift+Tab` | `Outdent` | Outdent block |
| `Alt+ArrowLeft` | `MoveWordLeft` | Move cursor left by word |
| `Alt+ArrowRight` | `MoveWordRight` | Move cursor right by word |
| `Alt+Backspace` | `DeleteWordBackward` | Delete word backward |
| `Alt+Delete` | `DeleteWordForward` | Delete word forward |

#### ActionT (legacy, context-dependent)

| Key | Context | Action |
|-----|---------|--------|
| `Cmd+Enter` | Any | Toggle checkbox |
| `Cmd+Shift+Backspace` | Any | Force delete block |
| `Shift+ArrowUp` | First line, head at 0 | Enter block selection (extend up) |
| `Shift+ArrowDown` | Last line, head at end | Enter block selection (extend down) |
| `Alt+Cmd+ArrowUp` | Any | Move block up |
| `Alt+Cmd+ArrowDown` | Any | Move block down |
| `Alt+Cmd+Shift+ArrowUp` | Any | Move block to first |
| `Alt+Cmd+Shift+ArrowDown` | Any | Move block to last |

### Block selection mode (block highlighted, no cursor)

#### KeyEventBus commands

| Key | Command | Description |
|-----|---------|-------------|
| `#` | `OpenTypePicker` | Open type picker |
| `Cmd+ArrowUp` | `Collapse` | Collapse selected block |
| `Cmd+ArrowDown` | `Expand` | Expand selected blocks |

#### ActionT (legacy)

| Key | Action |
|-----|--------|
| `Escape` | Clear selection |
| `Enter` | Edit block (enter editor mode) |
| `Tab` | Indent selected blocks |
| `Shift+Tab` | Outdent selected blocks |
| `ArrowUp` / `ArrowDown` | Navigate blocks |
| `Shift+ArrowUp` / `Shift+ArrowDown` | Extend selection |
| `ArrowLeft` | Navigate to parent |
| `ArrowRight` | Navigate to first child |
| `Cmd+A` | Select all visible blocks |
| `Cmd+C` | Copy selected blocks |
| `Cmd+X` | Cut selected blocks |
| `Delete` / `Backspace` | Delete selected blocks |
| `Cmd+Shift+Backspace` | Force delete selected blocks |
| `Cmd+Enter` | Toggle checkbox on selected |
| `Alt+Cmd+Arrow` | Move selected blocks |

## Adding new shortcuts

New shortcuts should be added as commands in `commands/` and wired through `KeyEventBus` keymaps. Do not add new handlers to ActionT.
