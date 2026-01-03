import { Attest } from "@/attest";
import { useContext } from "solid-js";
import { BrowserRuntimeContext } from "./browserRuntime";

export const useBrowserRuntime = () => {
  const runtime = useContext(BrowserRuntimeContext);
  Attest.existence(runtime);

  return runtime;
};
