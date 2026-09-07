import { Effect } from "effect";
import { HttpApiBuilder } from "effect/unstable/httpapi";
import { Api } from "../api/Api.ts";
import { Workspaces } from "../services/Workspaces.ts";

export const WorkspacesHandlers = HttpApiBuilder.group(
  Api,
  "workspaces",
  (handlers) =>
    Effect.gen(function* () {
      const workspaces = yield* Workspaces;
      return handlers.handleAll({
        create: ({ payload }) => workspaces.create(payload.name),
        list: () => workspaces.list(),
      });
    }),
);
