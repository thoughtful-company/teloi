import { Effect } from "effect";
import { HttpApiBuilder } from "effect/unstable/httpapi";
import { Api } from "../api/Api.ts";
import { Signs } from "../services/Signs.ts";

export const SignsHandlers = HttpApiBuilder.group(Api, "signs", (handlers) =>
  Effect.gen(function* () {
    const signs = yield* Signs;
    return handlers.handleAll({
      list: ({ params }) => signs.list(params.workspaceId),
      listAll: () => signs.listAll(),
    });
  }),
);
