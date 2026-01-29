/**
 * CommandBusT - Central command execution service.
 *
 * Receives command objects and executes their handlers.
 * Commands yield services from Effect context; this layer captures
 * those services and provides them during execution.
 */

import { Left, handle as leftHandle } from "@/commands/text-editor/left";
import { AutomergeT } from "@/services/external/Automerge";
import { BufferT } from "@/services/ui/Buffer";
import { TextEditorT } from "@/services/ui/TextEditor";
import { WindowT } from "@/services/ui/Window";
import { Context, Effect, Layer } from "effect";

// ============================================================================
// Command Type
// ============================================================================

/**
 * Base type for all commands.
 * Commands are Data.TaggedClass instances with a _tag property.
 */
export type Command = Left; // Union will grow as commands are added

// ============================================================================
// Handler Registry
// ============================================================================

type Handler<C extends Command> = (
  command: C,
) => Effect.Effect<void, unknown, unknown>;

/**
 * Registry mapping command tags to their handlers.
 * Handlers are imported directly — explicit wiring, no magic.
 */
const handlers: Record<string, Handler<Command>> = {
  "editor:left": leftHandle as Handler<Command>,
};

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
    const TextEditor = yield* TextEditorT;
    const Window = yield* WindowT;
    const Buffer = yield* BufferT;
    const Automerge = yield* AutomergeT;

    // Build context to provide to command handlers
    const commandContext = Context.empty().pipe(
      Context.add(TextEditorT, TextEditor),
      Context.add(WindowT, Window),
      Context.add(BufferT, Buffer),
      Context.add(AutomergeT, Automerge),
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
