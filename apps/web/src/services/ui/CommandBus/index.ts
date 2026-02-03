/**
 * CommandBusT - Central command execution service.
 *
 * Receives command objects and executes their handlers.
 * Commands yield services from Effect context; this layer captures
 * those services and provides them during execution.
 */

import { bufferCommands, type BufferCommand } from "@/commands/buffer";
import { chatCommands, type ChatCommand } from "@/commands/chat";
import { editorCommands, type EditorCommand } from "@/commands/editor";
import { Id, System } from "@/schema";
import { NodeT } from "@/services/domain/Node";
import { TupleT } from "@/services/domain/Tuple";
import { TypeT } from "@/services/domain/Type";
import { AutomergeT } from "@/services/external/Automerge";
import { StoreT } from "@/services/external/Store";
import { BlockT } from "@/services/ui/Block";
import { BufferT } from "@/services/ui/Buffer";
import { ChatT } from "@/services/ui/Chat";
import { EditorT } from "@/services/ui/Editor";
import { NavigationT } from "@/services/ui/Navigation";
import { ViewNavigationT } from "@/services/ui/ViewNavigation";
import { makeChatViewNavigation } from "@/services/ui/ViewNavigation/chat";
import { WindowT } from "@/services/ui/Window";
import { Context, Effect, Layer, Option } from "effect";

// ============================================================================
// Command Type
// ============================================================================

export type Command = EditorCommand | BufferCommand | ChatCommand;

// ============================================================================
// Handler Registry
// ============================================================================

type Handler<C extends Command> = (
  command: C,
) => Effect.Effect<void, unknown, unknown>;

const handlers: Record<string, Handler<Command>> = Object.fromEntries([
  ...editorCommands.map((C) => [C.tag, C.handle as Handler<Command>]),
  ...bufferCommands.map((C) => [C.tag, C.handle as Handler<Command>]),
  ...chatCommands.map((C) => [C.tag, C.handle as Handler<Command>]),
]);

// ============================================================================
// Service Definition
// ============================================================================

export class CommandBusT extends Context.Tag("CommandBusT")<
  CommandBusT,
  {
    /**
     * Dispatch a command for execution.
     * Finds the handler and runs it with all required services provided.
     */
    dispatch: (command: Command) => Effect.Effect<void>;
  }
>() {}

export const CommandBusLive = Layer.effect(
  CommandBusT,
  Effect.gen(function* () {
    // Capture services that commands need
    const Editor = yield* EditorT;
    const Window = yield* WindowT;
    const Buffer = yield* BufferT;
    const Automerge = yield* AutomergeT;
    const Node = yield* NodeT;
    const Store = yield* StoreT;
    const Block = yield* BlockT;
    const Navigation = yield* NavigationT;
    const Type = yield* TypeT;
    const Tuple = yield* TupleT;
    const Chat = yield* ChatT;
    const PageViewNavigation = yield* ViewNavigationT;

    // Build base context (without ViewNavigationT — added dynamically per dispatch)
    const baseContext = Context.empty().pipe(
      Context.add(EditorT, Editor),
      Context.add(WindowT, Window),
      Context.add(BufferT, Buffer),
      Context.add(AutomergeT, Automerge),
      Context.add(NodeT, Node),
      Context.add(StoreT, Store),
      Context.add(BlockT, Block),
      Context.add(NavigationT, Navigation),
      Context.add(TypeT, Type),
      Context.add(TupleT, Tuple),
      Context.add(ChatT, Chat),
    );

    // Pre-build the chat ViewNavigation (captured once, reused per dispatch)
    const chatViewNavContext = Context.empty().pipe(
      Context.add(StoreT, Store),
      Context.add(TupleT, Tuple),
      Context.add(TypeT, Type),
    );
    const ChatViewNavigation = yield* makeChatViewNavigation.pipe(
      Effect.provide(chatViewNavContext),
    );

    return {
      dispatch: (command: Command): Effect.Effect<void> =>
        Effect.gen(function* () {
          const handler = handlers[command._tag];
          if (!handler) {
            yield* Effect.logWarning(`No handler for command: ${command._tag}`);
            return;
          }

          yield* Effect.logDebug("CommandBus dispatching").pipe(
            Effect.annotateLogs({ command: command._tag }),
          );

          // Resolve the right ViewNavigation for the active view
          const viewNav = yield* resolveViewNavigation(
            Window,
            Type,
            Store,
            PageViewNavigation,
            ChatViewNavigation,
          );

          const commandContext = baseContext.pipe(
            Context.add(ViewNavigationT, viewNav),
          );

          yield* handler(command).pipe(
            Effect.provide(commandContext),
            Effect.catchAll((error) =>
              Effect.logError("Command execution failed").pipe(
                Effect.annotateLogs({
                  command: command._tag,
                  error: String(error),
                }),
              ),
            ),
          ) as Effect.Effect<void>;
        }),
    };
  }),
);

// ================================ Internal ==================================

/**
 * Resolve the ViewNavigationT implementation based on the active buffer's view type.
 * Returns the chat implementation if the active view is a CHAT_VIEW, otherwise page (default).
 */
const resolveViewNavigation = (
  Window: WindowT["Type"],
  Type: TypeT["Type"],
  Store: StoreT["Type"],
  pageNav: ViewNavigationT["Type"],
  chatNav: ViewNavigationT["Type"],
): Effect.Effect<ViewNavigationT["Type"]> =>
  Effect.gen(function* () {
    const activeElement = yield* Window.getActiveElement();
    if (Option.isNone(activeElement)) return pageNav;

    const el = activeElement.value;

    // Resolve buffer ID from active element
    let bufferId: Id.Buffer | null = null;
    if (el.type === "block") {
      const ctx = Id.parseBlockContextSync(el.id);
      if (ctx.type === "buffer") bufferId = ctx.bufferId;
    } else if (el.type === "buffer") {
      bufferId = el.id;
    }

    if (!bufferId) return pageNav;

    // Get the buffer's activeViewId
    const bufferDoc = yield* Store.getDocument("buffer", bufferId);
    if (Option.isNone(bufferDoc)) return pageNav;

    const activeViewId = bufferDoc.value.activeViewId as Id.Node | null;
    if (!activeViewId) return pageNav;

    // Check if the view has CHAT_VIEW type
    const isChatView = yield* Type.hasType(activeViewId, System.CHAT_VIEW);
    if (isChatView) return chatNav;

    return pageNav;
  }).pipe(
    // If resolution fails for any reason, fall back to page navigation
    Effect.catchAll(() => Effect.succeed(pageNav)),
  );
