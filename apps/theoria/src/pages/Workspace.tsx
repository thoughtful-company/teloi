import { type Component, For, Show } from "solid-js";
import type { AppProps } from "../App.tsx";
import { byKind, kindPlural, kinds, workspaceName } from "../model.ts";
import { Empty, Id, ObjectCard, Section } from "../ui.tsx";
import { InWorkspace } from "./InWorkspace.tsx";

export const WorkspacePage: Component<AppProps> = (props) => (
  <InWorkspace {...props}>
    {(picture, workspaceId) => {
      const grouped = () => byKind(picture().objects);
      return (
        <>
          <h1 class="text-3xl font-semibold tracking-tight">
            {workspaceName(picture().workspaces, workspaceId())}
          </h1>
          <p class="mt-1">
            <Id value={workspaceId()} />
          </p>
          <For each={kinds}>
            {(kind) => (
              <Section
                title={kindPlural[kind]}
                aside={
                  <span
                    data-testid="count"
                    class="text-xs text-text-placeholder"
                  >
                    {grouped()[kind].length}
                  </span>
                }
              >
                <Show
                  when={grouped()[kind].length > 0}
                  fallback={<Empty text="None yet." />}
                >
                  <ul class="space-y-2">
                    <For each={grouped()[kind]}>
                      {(object) => (
                        <ObjectCard
                          workspaceId={workspaceId()}
                          object={object}
                        />
                      )}
                    </For>
                  </ul>
                </Show>
              </Section>
            )}
          </For>
        </>
      );
    }}
  </InWorkspace>
);
