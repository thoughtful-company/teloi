import { useBrowserRuntime } from "@/context/useBrowserRuntime";
import { Id, System } from "@/schema";
import { TupleT, Tuple } from "@/services/domain/Tuple";
import { Effect, Fiber, Stream } from "effect";
import { createSignal, onCleanup, onMount } from "solid-js";
import { BlockTypeDefinition } from "../types";

interface CheckboxDecorationProps {
  nodeId: Id.Node;
}

const CheckboxDecoration = (props: CheckboxDecorationProps) => {
  const runtime = useBrowserRuntime();
  const [isChecked, setIsChecked] = createSignal(false);
  const [currentTuple, setCurrentTuple] = createSignal<Tuple | null>(null);

  onMount(() => {
    const tuplesFiber = runtime.runFork(
      Effect.gen(function* () {
        const TupleService = yield* TupleT;
        const stream = yield* TupleService.subscribeByPosition(
          System.IS_CHECKED,
          0,
          props.nodeId,
        );
        yield* Stream.runForEach(stream, (tuples) =>
          Effect.sync(() => {
            const checkedTuple = tuples.find(
              (t) => t.members[1] === System.TRUE,
            );
            setIsChecked(!!checkedTuple);
            setCurrentTuple(checkedTuple ?? null);
          }),
        );
      }),
    );

    onCleanup(() => {
      runtime.runFork(Fiber.interrupt(tuplesFiber));
    });
  });

  const handleToggle = (e: MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();

    runtime.runPromise(
      Effect.gen(function* () {
        const TupleService = yield* TupleT;
        const tuple = currentTuple();

        if (tuple) {
          yield* TupleService.delete(tuple.id);
        } else {
          yield* TupleService.create(System.IS_CHECKED, [
            props.nodeId,
            System.TRUE,
          ]);
        }
      }),
    );
  };

  return (
    <button
      type="button"
      class="h-[var(--text-block)] flex items-center justify-center w-4 cursor-pointer select-none"
      onClick={handleToggle}
      onMouseDown={(e) => e.preventDefault()}
    >
      <span
        class="w-3.5 h-3.5 rounded border flex items-center justify-center transition-colors"
        classList={{
          "border-neutral-400 bg-transparent": !isChecked(),
          "border-blue-500 bg-blue-500 text-white": isChecked(),
        }}
      >
        {isChecked() && (
          <svg
            class="w-2.5 h-2.5"
            viewBox="0 0 12 12"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
          >
            <path d="M2 6l3 3 5-5" />
          </svg>
        )}
      </span>
    </button>
  );
};

export const checkboxDefinition: BlockTypeDefinition = {
  id: System.CHECKBOX,

  renderDecoration: (props) => <CheckboxDecoration nodeId={props.nodeId} />,

  trigger: {
    pattern: /^\[[\s]?\]$/,
    consume: [2, 3],
  },

  enter: {
    propagateToNewBlock: true,
    removeOnEmpty: true,
  },

  backspace: {
    removeTypeAtStart: true,
  },
};
