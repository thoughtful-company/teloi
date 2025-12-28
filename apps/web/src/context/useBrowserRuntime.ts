import { Attest } from "@/attest";
import { useContext } from "solid-js";
import { BrowserRuntimeContext } from "./browserRuntime";

export const useBrowserRuntime = () => {
  const runtime = useContext(BrowserRuntimeContext);
  Attest.isDefined(runtime);

  return runtime;
};
