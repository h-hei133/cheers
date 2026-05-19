import type { WorkspaceRootMode } from "./projectBindingPolicy.js";
import type { Session } from "./SessionManager.js";
import type { CurrentSessionSelectionRecord } from "./currentSessionSelection.js";

export interface SessionMetadataProjection {
  readonly id: string;
  readonly projectRoot: string;
  readonly rootMode?: WorkspaceRootMode;
  readonly requestedWorkspaceRoot?: string;
  readonly targetPathBase?: string;
  readonly gitRoot?: string | null;
  readonly title?: string;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export function projectSessionMetadata(
  session: Session,
): SessionMetadataProjection {
  return {
    id: session.id,
    projectRoot: session.projectRoot,
    rootMode: session.rootMode,
    requestedWorkspaceRoot: session.requestedWorkspaceRoot,
    targetPathBase: session.targetPathBase,
    gitRoot: session.gitRoot,
    title: session.title,
    createdAt: session.createdAt,
    updatedAt: session.updatedAt,
  };
}

export function projectCurrentSessionMetadata(input: {
  readonly sessionId: string;
  readonly updatedAt: string;
}): CurrentSessionSelectionRecord {
  return {
    sessionId: input.sessionId,
    updatedAt: input.updatedAt,
  };
}
