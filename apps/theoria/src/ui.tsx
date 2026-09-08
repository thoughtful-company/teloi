import { A } from "@solidjs/router";
import type { ModelObject, ObjectKind, WorkspaceId } from "@teloi/entel/api";
import { Cause, Option } from "effect";
import {
  type Accessor,
  type Component,
  type JSX,
  type ParentProps,
  Show,
  createUniqueId,
} from "solid-js";
import { kindLabel, titleOf } from "./model.ts";

// An id the way an agent says it, in the monospace face and selected whole
// on one click, so a person can copy it into the next request they watch.
export const Id: Component<{ readonly value: string }> = (props) => (
  <code class="font-mono text-xs text-text-tertiary select-all">
    {props.value}
  </code>
);

// A titled region, so a test and a screen reader find it by the title.
export const Section: Component<
  ParentProps<{ readonly title: string; readonly aside?: JSX.Element }>
> = (props) => {
  const id = createUniqueId();
  return (
    <section aria-labelledby={id} class="mt-10">
      <div class="mb-3 flex items-baseline gap-2">
        <h2
          id={id}
          class="text-xs font-medium tracking-wide text-text-tertiary uppercase"
        >
          {props.title}
        </h2>
        {props.aside}
      </div>
      {props.children}
    </section>
  );
};

export const Kind: Component<{ readonly kind: ObjectKind }> = (props) => (
  <span
    data-testid="kind"
    class={`text-xs font-medium tracking-wide uppercase ${kindColor[props.kind]}`}
  >
    {kindLabel[props.kind]}
  </span>
);

// One row for every list on every page, so a workspace, an object and a
// relation are told apart by what they say and not by how they are drawn.
export const Card: Component<ParentProps> = (props) => (
  <li class="flex items-baseline justify-between gap-4 rounded-lg border border-border-subtle bg-surface-card px-4 py-3">
    {props.children}
  </li>
);

// A card for one object, the title as the link and the id beside it. The id
// stays outside the link so the link's name is the title alone.
export const ObjectCard: Component<{
  readonly workspaceId: WorkspaceId;
  readonly object: ModelObject;
  readonly note?: string | undefined;
}> = (props) => (
  <Card>
    <span class="flex items-baseline gap-3">
      <A
        href={`/workspaces/${props.workspaceId}/objects/${props.object.id}`}
        class="font-medium hover:text-accent"
      >
        {titleOf(props.object)}
      </A>
      <Show when={props.note}>
        <span class="text-sm text-text-secondary">{props.note}</span>
      </Show>
    </span>
    <Id value={props.object.id} />
  </Card>
);

export const Empty: Component<{ readonly text: string }> = (props) => (
  <p class="text-sm text-text-placeholder">{props.text}</p>
);

// The last failed request, beside whatever the page still shows.
export const Failure: Component<{
  readonly of: Accessor<Option.Option<Cause.Cause<unknown>>>;
}> = (props) => (
  <Show when={Option.getOrUndefined(props.of())}>
    {(cause) => (
      <p role="alert" class="mt-4 text-sm text-danger">
        The last request failed: {describe(cause())}
      </p>
    )}
  </Show>
);

// ================================ Internal ===================================

const kindColor: Record<ObjectKind, string> = {
  individual: "text-kind-individual",
  set: "text-kind-set",
  tuple: "text-kind-tuple",
  tupleSet: "text-kind-tuple-set",
};

// The contract's errors and the client's own all carry a tag, and the tag is
// what an agent's log would show for the same request. Anything else is a
// defect, shown as what it says.
const describe = (cause: Cause.Cause<unknown>): string => {
  const error = Cause.squash(cause);
  return typeof error === "object" && error !== null && "_tag" in error
    ? String(error._tag)
    : String(error);
};
