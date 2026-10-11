import type { WorkspaceRootMode } from "../store/projectBindingPolicy.js";
import type { Session } from "./sessionRecord.js";

export interface SessionMetadata {
  id: string;
  projectRoot: string;
  rootMode?: WorkspaceRootMode;
  requestedWorkspaceRoot?: string;
  targetPathBase?: string;
  gitRoot?: string | null;
  title?: string;
  pinned?: boolean;
  /** The session this one was forked from, when it was. */
  parentSession?: string;
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
    ...(session.pinned === true ? { pinned: true } : {}),
    ...(session.parentSession ? { parentSession: session.parentSession } : {}),
    createdAt: session.createdAt,
    updatedAt: session.updatedAt,
  };
}
