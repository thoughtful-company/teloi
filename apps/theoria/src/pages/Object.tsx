import { A, useParams } from "@solidjs/router";
import { type ModelObject, ObjectId, type WorkspaceId } from "@teloi/entel/api";
import { type Component, createMemo, For, Show } from "solid-js";
import type { AppProps } from "../App.tsx";
import { appearsIn, titleOf, workspaceName } from "../model.ts";
import { Empty, Id, Kind, ObjectCard, Section } from "../ui.tsx";
import { InWorkspace } from "./InWorkspace.tsx";

// Reads the whole list and not the one object, because where the object
// appears is written on the other objects.
export const ObjectPage: Component<AppProps> = (props) => {
  const params = useParams<{ objectId: string }>();
  return (
    <InWorkspace {...props}>
      {(picture, workspaceId) => {
        const objectId = () => ObjectId.make(params.objectId);
        const objects = () => picture().objects;
        // Indexed once per picture, since every place and element looks its
        // object up and a large set would otherwise scan the list per element.
        const index = createMemo(
          () => new Map(objects().map((o) => [o.id, o] as const)),
        );
        const find = (id: ObjectId) => index().get(id);
        const object = () => find(objectId());
        return (
          <>
            <nav class="mb-6 text-sm text-text-secondary">
              <A
                href={`/workspaces/${workspaceId()}`}
                class="hover:text-text-primary"
              >
                {workspaceName(picture().workspaces, workspaceId())}
              </A>
            </nav>
            <Show
              when={object()}
              fallback={
                <Empty
                  text={`No object with id ${params.objectId} in this workspace.`}
                />
              }
            >
              {(object) => {
                const where = () => appearsIn(objects(), object().id);
                return (
                  <>
                    <Kind kind={object().kind} />
                    <h1 class="mt-1 text-3xl font-semibold tracking-tight">
                      {titleOf(object())}
                    </h1>
                    <p class="mt-1">
                      <Id value={object().id} />
                    </p>

                    <Section title="Signs">
                      <ul class="space-y-1">
                        <For each={object().signs}>
                          {(sign) => (
                            <li class="flex items-baseline justify-between gap-4">
                              <span>{sign.title}</span>
                              <Id value={sign.id} />
                            </li>
                          )}
                        </For>
                      </ul>
                    </Section>

                    <Show when={object().kind === "tuple"}>
                      <Section title="Places">
                        <ol class="space-y-2">
                          <For each={object().places}>
                            {(placeId) => (
                              <Related
                                workspaceId={workspaceId()}
                                object={find(placeId)}
                                id={placeId}
                              />
                            )}
                          </For>
                        </ol>
                      </Section>
                    </Show>

                    <Show
                      when={
                        object().kind === "set" || object().kind === "tupleSet"
                      }
                    >
                      <Section title="Elements">
                        <Show
                          when={object().elements.length > 0}
                          fallback={<Empty text="None yet." />}
                        >
                          <ul class="space-y-2">
                            <For each={object().elements}>
                              {(elementId) => (
                                <Related
                                  workspaceId={workspaceId()}
                                  object={find(elementId)}
                                  id={elementId}
                                />
                              )}
                            </For>
                          </ul>
                        </Show>
                      </Section>
                    </Show>

                    <Section title="Appears in">
                      <Show
                        when={
                          where().asPlace.length > 0 ||
                          where().asElement.length > 0
                        }
                        fallback={<Empty text="Nowhere yet." />}
                      >
                        <Show when={where().asPlace.length > 0}>
                          <ul data-testid="as-place" class="space-y-2">
                            <For each={where().asPlace}>
                              {(place) => (
                                <ObjectCard
                                  workspaceId={workspaceId()}
                                  object={place.tuple}
                                  note={`place ${place.position}`}
                                />
                              )}
                            </For>
                          </ul>
                        </Show>
                        <Show when={where().asElement.length > 0}>
                          <ul data-testid="as-element" class="mt-2 space-y-2">
                            <For each={where().asElement}>
                              {(set) => (
                                <ObjectCard
                                  workspaceId={workspaceId()}
                                  object={set}
                                />
                              )}
                            </For>
                          </ul>
                        </Show>
                      </Show>
                    </Section>
                  </>
                );
              }}
            </Show>
          </>
        );
      }}
    </InWorkspace>
  );
};

// ================================ Internal ===================================

// A place or an element. The list always has it, since entel checks a place
// or element exists before it commits; the id stands in if a list arrives
// between two answers that disagree.
const Related: Component<{
  readonly workspaceId: WorkspaceId;
  readonly object: ModelObject | undefined;
  readonly id: ObjectId;
}> = (props) => (
  <Show
    when={props.object}
    fallback={
      <li>
        <Id value={props.id} />
      </li>
    }
  >
    {(object) => (
      <ObjectCard workspaceId={props.workspaceId} object={object()} />
    )}
  </Show>
);
