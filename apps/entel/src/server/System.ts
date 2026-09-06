import { Effect } from "effect";
import { HttpApiBuilder } from "effect/unstable/httpapi";
import { Api } from "../api/Api.ts";
import { Health } from "../api/System.ts";

export const SystemHandlers = HttpApiBuilder.group(Api, "system", (handlers) =>
  handlers.handleAll({
    health: () => Effect.succeed(new Health({ status: "ok" })),
  }),
);
