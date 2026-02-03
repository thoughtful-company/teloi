# Chat View Specification

## Overview

Chat is an alternative **view** for a node. It displays the node's children as a conversation between participants: system, user, and assistant (aengel). Messages are ordered, visually grouped when consecutive same-role, and validated for correct ordering.

## Type System

### Meta-Type: `#message-role`

Follows the `#boolean` → `#true`/`#false` pattern.

| System ID | User-facing name | Notes |
|-----------|-----------------|-------|
| `system:message-role` | `message-role` | Meta-type (like `boolean`) |
| `system:msg-system` | `msg:system` | System prompt |
| `system:msg-user` | `msg:user` | User message |
| `system:msg-aengel` | `msg:aengel` | Assistant message |

All three are children of `SCHEMA`, typed with `message-role`.

### Chat Type

| System ID | Name | Purpose |
|-----------|------|---------|
| `system:chat` | `chat` | Applied to nodes that should render as chat |

When `#chat` is added to a node → auto-create a chat view (same as table view creation flow).

**Non-removable**: Once `#chat` is applied, it cannot be removed from the node. The type picker should prevent deletion (e.g., skip it during remove-type actions).

### Tuple Type: `CHAT_HAS_MESSAGE`

| Position | Role | Description |
|----------|------|-------------|
| 0 | chat | The chat node |
| 1 | message | The message node |

Messages are **children of the chat node** linked via `CHAT_HAS_MESSAGE` tuples. Ordering uses tuple member fractional indices on position 1.

Query pattern:
```ts
// Find messages for a chat, sorted by position-1 fractional index
Tuple.findByPosition(CHAT_HAS_MESSAGE, 0, chatNodeId, /* sortByPosition: */ 1)

// Create a message tuple with ordering index on position 1
Tuple.create(CHAT_HAS_MESSAGE, [chatNodeId, messageNodeId], ["", nextIdx])
// Position 0 gets "" (no ordering needed), position 1 gets the fractional index

// Fractional indices via `fractional-indexing` package
import { generateKeyBetween } from "fractional-indexing"
const nextIdx = generateKeyBetween(lastIdx, null) // append after last
```

> **Note**: Tuple ordering per-position already exists in the system (fractional-indexing on `tuple_members`). This is the first feature to rely on it for display order.

## Chat View Rendering

### Layout

```
┌─────────────────────────────────────┐
│ [Page] [Chat]          (view tabs)  │
├─────────────────────────────────────┤
│ [Send ⌘↵]             (action bar) │
├─────────────────────────────────────┤
│                                     │
│  ┌─ system ────────────────────┐    │
│  │ You are a helpful assistant │    │
│  └─────────────────────────────┘    │
│                                     │
│  ┌─ user ──────────────────────┐    │
│  │ What is 2+2?                │    │
│  └─────────────────────────────┘    │
│                                     │
│  ┌─ aengel ────────────────────┐    │
│  │ 4                           │    │
│  └─────────────────────────────┘    │
│                                     │
└─────────────────────────────────────┘
```

- Action bar with **Send** button sits below the chat node title (above messages).
- Each message group has a **role label** (system / user / aengel).
- Messages are rendered as Block components (same editing as page view).
- `ChatView` receives `childBlockIds` from `BufferView` but does **not** use it — messages are fetched independently via `ChatT.getMessages` (tuple-based, not tree-based). The prop exists for potential future use (e.g., showing orphan blocks that lack tuples).

### Visual Grouping

Consecutive messages with the **same role type** are displayed as one visual group (single role label, no gap between blocks). The nodes remain separate — grouping is display-only.

```
user:  "Hello"        ┐
user:  "How are you?" ┘ → rendered as one "user" group
```

### Wrong-Place Highlighting

A message is highlighted with **pink background + "wrong place" label** when any of these rules are violated:

| Rule | Description |
|------|-------------|
| System first | `msg:system` nodes must come before any non-system node |
| No early aengel | `msg:aengel` cannot appear before the first `msg:user` |
| No consecutive same-role | Two adjacent messages with same role = second is wrong place |

Validation runs on the ordered message list. "Wrong place" is a **visual indicator only** — the user can fix it by reordering or re-typing the message.

### Untyped Messages

A `CHAT_HAS_MESSAGE` tuple may point to a node with no role type. Behavior:

- **Has preceding message**: Treat as continuation of the previous message's role (inherit role for display and sending).
- **First message, no role**: Auto-assign `msg:user` type to the node.
- **Only message and untyped**: Show a virtual warning (e.g., "no role assigned") — don't silently skip it.

Untyped messages should never be excluded from the chat view.

## Sending Messages (Cmd+Enter)

### Trigger
- **Keyboard**: `Cmd+Enter` (new command: `chat:send`)
- **Button**: "Send ⌘↵" in action bar below title

### Behavior
1. Collect all `CHAT_HAS_MESSAGE` tuples for this chat, ordered by position-1 fractional index
2. For each message: read role type (`msg:system` / `msg:user` / `msg:aengel`) and Automerge text. Role resolution priority: system → user → assistant (first match wins when a node has multiple role types).
3. Map to provider-agnostic message array: `{ role: "system" | "user" | "assistant", content: string }[]`
4. Call LLM provider
5. Create new child node of the chat: `nodeCreated({ parentId: chatNodeId, position: "" })`. The empty `position` is intentional — tree ordering doesn't matter for chat; display order comes from the tuple's fractional index.
6. Write response text to new node's Automerge doc
7. Apply `msg:aengel` type to the new node
8. Compute next fractional index: `generateKeyBetween(lastExistingIdx, null)`
9. Create `CHAT_HAS_MESSAGE` tuple with `["", nextIdx]` (position 0 = chat, position 1 = new node)

### LLM Provider Architecture

Provider-agnostic interface:

```ts
interface ChatProvider {
  send(messages: ChatMessage[]): Effect.Effect<string, ChatError>
  // Future: stream(messages: ChatMessage[]): Stream<string>
}

interface ChatMessage {
  role: "system" | "user" | "assistant"
  content: string
}
```

- First implementation: buffer full response, insert at once
- Future: streaming tokens into Automerge in real-time
- API key storage: TBD (env var or settings — separate concern)

### Service: `ChatT`

```ts
interface ChatT {
  send(chatNodeId: Id.Node): Effect.Effect<Id.Node, ChatError>
  getMessages(chatNodeId: Id.Node): Effect.Effect<ChatMessage[]>
}
```

Located in `services/ui/Chat/`.

## Auto-View Creation

When `#chat` type is applied to a node:
1. Hook in `TypePickerT.applyType` (or a new `onTypeApplied` callback)
2. If type is `system:chat` → call `View.getOrCreateView(nodeId)` with chat view type
3. Set `activeViewId` to the new view

This mirrors how `#table` could trigger table view creation.

### View Auto-Activation on Navigation

When a buffer navigates to a node (`activeViewId` starts as null), `BufferView` checks if the node has a view typed with `CHAT_VIEW`. If found, it auto-activates that view via `Buffer.setActiveView`. This ensures navigating to a chat node shows the chat view without requiring the user to click the tab.

Flow: `BufferView.createEffect` → query `View.getViewsForPage` → check each for `CHAT_VIEW` type → `Buffer.setActiveView`.

When a buffer changes to a different node (`setAssignedNodeId`), `activeViewId` is cleared to null, restarting the detection cycle.

### Message List Reactivity

The message list **must be reactive** — new messages created by `chat:send` should appear without remounting the component. Use a stream subscription (same pattern as `PropertySection`), not `onMount` + `runPromise`.

## Data Model

```
Chat Node (has type #chat)
├── HAS_VIEW tuple → Chat View Node (shadow child, type sys:type:chat-view)
├── CHAT_HAS_MESSAGE tuple → Message Node 1 (has type #msg:system)
├── CHAT_HAS_MESSAGE tuple → Message Node 2 (has type #msg:user)
├── CHAT_HAS_MESSAGE tuple → Message Node 3 (has type #msg:aengel)
└── ... ordered by position-1 fractional index

Buffer Document
└── activeViewId → Chat View Node ID
```

## Bootstrap Additions

New entries in `System` constant and bootstrap:

```ts
// system.ts
MESSAGE_ROLE: "system:message-role" as Id.Node,
MSG_SYSTEM: "system:msg-system" as Id.Node,
MSG_USER: "system:msg-user" as Id.Node,
MSG_AENGEL: "system:msg-aengel" as Id.Node,
CHAT: "system:chat" as Id.Node,
CHAT_VIEW: "system:chat-view" as Id.Node,
CHAT_HAS_MESSAGE: "system:chat-has-message" as Id.Node,
```

Bootstrap creates:
- `MESSAGE_ROLE` node under SCHEMA, typed as meta-type
- `MSG_SYSTEM`, `MSG_USER`, `MSG_AENGEL` under SCHEMA, each typed with `MESSAGE_ROLE`
- `CHAT` node under SCHEMA (rendering type that triggers view creation)
- `CHAT_HAS_MESSAGE` tuple type with 2 roles (chat, message)

## Parked / Future

- [ ] Streaming LLM responses (token-by-token into Automerge)
- [ ] Auto-assign `#msg:user` to new blocks in chat context
- [ ] Message reordering (drag & drop)
- [ ] Multi-turn conversation branching
- [ ] Provider configuration UI (model picker, temperature, etc.)
- [ ] API key management (settings panel)
- [ ] Tool use / function calling
- [ ] Image/file attachments in messages

## Implementation Order

1. **Types & Bootstrap**: Add `MESSAGE_ROLE`, `MSG_*`, `CHAT`, `CHAT_HAS_MESSAGE` to system.ts + bootstrap
2. **ChatView component**: Render ordered messages with role labels and grouping
3. **Wrong-place validation**: Highlight rule violations
4. **`ChatT` service**: Message collection, role mapping
5. **`chat:send` command**: Cmd+Enter binding, LLM call, response insertion
6. **Auto-view creation**: Hook `#chat` type → create chat view
7. **Send button UI**: Action bar below title
