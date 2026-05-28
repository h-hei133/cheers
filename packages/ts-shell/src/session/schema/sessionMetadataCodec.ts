import type { WorkspaceRootMode } from "../projectBindingPolicy.js";
import type { Session } from "./sessionRecord.js";

export interface SessionMetadata {
  id: string;
  projectRoot: string;
  rootMode?: WorkspaceRootMode;
  requestedWorkspaceRoot?: string;
  targetPathBase?: string;
  gitRoot?: string | null;
  title?: string;
  createdAt: string;
  updatedAt: string;
}

export function projectSessionMetadata(session: Session): SessionMetadata {
  return {
    id: session.id,
    projectRoot: session.projectRoot,
    ...(session.rootMode ? { rootMode: session.rootMode } : {}),
    ...(session.requestedWorkspaceRoot
      ? { requestedWorkspaceRoot: session.requestedWorkspaceRoot }
      : {}),
    ...(session.targetPathBase ? { targetPathBase: session.targetPathBase } : {}),
    ...(Object.prototype.hasOwnProperty.call(session, "gitRoot")
      ? { gitRoot: session.gitRoot ?? null }
      : {}),
    title: session.title,
    createdAt: session.createdAt,
    updatedAt: session.updatedAt,
  };
}
