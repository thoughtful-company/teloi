import { HttpApi } from "effect/unstable/httpapi";
import { SystemApi } from "./System.ts";

export class Api extends HttpApi.make("entel").add(SystemApi) {}
