import type { DocHandle } from "@automerge/automerge-repo";
import { createContext, useContext, type ParentProps } from "solid-js";
import type { WorkspaceTexts } from "./types";

/**
 * Context value providing access to the workspace Automerge document.
 *
 * Components use this to get the handle for TextEditor's automergeSyncPlugin,
 * and for reading text content reactively.
 */
export interface WorkspaceContextValue {
  /** The DocHandle for the workspace texts document */
  handle: DocHandle<WorkspaceTexts>;
}

const WorkspaceContext = createContext<WorkspaceContextValue | null>(null);

/**
 * Provider component for workspace Automerge document access.
 *
 * Wrap your app (or the part that needs text editing) with this provider,
 * passing the handle obtained from AutomergeT service.
 */
export function WorkspaceProvider(
  props: ParentProps<{ handle: DocHandle<WorkspaceTexts> }>,
) {
  return (
    <WorkspaceContext.Provider value={{ handle: props.handle }}>
      {props.children}
    </WorkspaceContext.Provider>
  );
}

/**
 * Hook to access the workspace Automerge document handle.
 *
 * @throws Error if used outside WorkspaceProvider
 */
export function useWorkspace(): WorkspaceContextValue {
  const ctx = useContext(WorkspaceContext);
  if (!ctx) {
    throw new Error("useWorkspace must be used within WorkspaceProvider");
  }
  return ctx;
}
