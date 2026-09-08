import { useParams } from "@solidjs/router";
import {
  type ModelObject,
  type Workspace,
  WorkspaceId,
} from "@teloi/entel/api";
import { Cause, Effect, Option } from "effect";
import { type Accessor, type Component, type JSX, Show } from "solid-js";
import type { AppProps } from "../App.tsx";
import { createPolled } from "../poll.ts";
import { Empty, Failure } from "../ui.tsx";

// What a page inside a workspace reads on every poll. Two requests and not
// one snapshot, since entel has no endpoint that gives both; they are sent
// together, so a poll waits one round trip and not two.
export interface Picture {
  readonly workspaces: ReadonlyArray<Workspace>;
  readonly objects: ReadonlyArray<ModelObject>;
}

// The frame of every page under /workspaces/:workspaceId. Polls the picture,
// answers a workspace entel does not know with a sentence, shows the last
// failure beside whatever is still on the page, and hands the picture and the
// id to the page once there is one.
export const InWorkspace: Component<
  AppProps & {
    readonly children: (
      picture: Accessor<Picture>,
      workspaceId: Accessor<WorkspaceId>,
    ) => JSX.Element;
  }
> = (props) => {
  const params = useParams<{ workspaceId: string }>();
  const workspaceId = () => WorkspaceId.make(params.workspaceId);
  const page = createPolled(
    () =>
      Effect.all(
        {
          workspaces: props.client.workspaces.list(),
          objects: props.client.objects.list({
            params: { workspaceId: workspaceId() },
          }),
        },
        { concurrency: "unbounded" },
      ),
    props.pollEvery,
  );
  const notFound = () =>
    Option.exists(page.failure(), (cause) =>
      Option.exists(
        Cause.findErrorOption(cause),
        (error) => error._tag === "WorkspaceNotFound",
      ),
    );
  return (
    <Show
      when={!notFound()}
      fallback={<Empty text={`No workspace with id ${params.workspaceId}.`} />}
    >
      <Failure of={page.failure} />
      <Show when={Option.getOrUndefined(page.latest())}>
        {(picture) => props.children(picture, workspaceId)}
      </Show>
    </Show>
  );
};
