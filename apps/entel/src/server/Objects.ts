import { Effect } from "effect";
import { HttpApiBuilder } from "effect/unstable/httpapi";
import { Api } from "../api/Api.ts";
import { Objects } from "../services/Objects.ts";

export const ObjectsHandlers = HttpApiBuilder.group(
  Api,
  "objects",
  (handlers) =>
    Effect.gen(function* () {
      const objects = yield* Objects;
      return handlers.handleAll({
        create: ({ params, payload }) =>
          objects.create(params.workspaceId, payload),
        list: ({ params }) => objects.list(params.workspaceId),
        get: ({ params }) => objects.get(params.workspaceId, params.objectId),
        addSign: ({ params, payload }) =>
          objects.addSign(params.workspaceId, params.objectId, payload.title),
        addElement: ({ params, payload }) =>
          objects.addElement(
            params.workspaceId,
            params.objectId,
            payload.elementId,
          ),
      });
    }),
);
