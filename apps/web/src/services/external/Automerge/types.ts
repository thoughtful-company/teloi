/**
 * Types for Automerge workspace document structure.
 *
 * A single Automerge document per workspace stores all text content,
 * keyed by nodeId. This enables collaborative editing across all blocks
 * while LiveStore handles the structural data (hierarchy, metadata, etc.).
 */

/** Text content storage: one entry per node */
export interface WorkspaceTexts {
  texts: {
    [nodeId: string]: string;
  };
}
