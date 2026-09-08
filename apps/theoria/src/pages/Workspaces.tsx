import { A } from "@solidjs/router";
import { Option } from "effect";
import { type Component, For, Show } from "solid-js";
import type { AppProps } from "../App.tsx";
import { createPolled } from "../poll.ts";
import { Card, Empty, Failure, Id } from "../ui.tsx";

export const WorkspacesPage: Component<AppProps> = (props) => {
  const workspaces = createPolled(
    () => props.client.workspaces.list(),
    props.pollEvery,
  );
  return (
    <>
      <h1 class="text-3xl font-semibold tracking-tight">Workspaces</h1>
      <Failure of={workspaces.failure} />
      <Show when={Option.getOrUndefined(workspaces.latest())}>
        {(list) => (
          <Show
            when={list().length > 0}
            fallback={<Empty text="No workspaces yet." />}
          >
            <ul class="mt-8 space-y-2">
              <For each={list()}>
                {(workspace) => (
                  <Card>
                    <A
                      href={`/workspaces/${workspace.id}`}
                      class="font-medium hover:text-accent"
                    >
                      {workspace.name}
                    </A>
                    <Id value={workspace.id} />
                  </Card>
                )}
              </For>
            </ul>
          </Show>
        )}
      </Show>
    </>
  );
};
