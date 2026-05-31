import { normalizeProjectBinding, type WorkspaceRootMode } from "./projectBindingPolicy.js";
import type { Session } from "../schema/sessionRecord.js";

export interface SessionWorkspaceBindingInput {
  readonly projectRoot?: string;
  readonly rootMode?: WorkspaceRootMode;
  readonly requestedWorkspaceRoot?: string;
  readonly targetPathBase?: string;
  readonly gitRoot?: string | null;
}

export function applySessionWorkspaceBinding(input: {
  readonly session: Session;
  readonly binding: SessionWorkspaceBindingInput;
  readonly updatedAt: string;
}): Session {
  const decision = normalizeProjectBinding(input.binding);
  if (decision.projectRoot) {
    input.session.projectRoot = decision.projectRoot;
  }
  if (decision.rootMode) {
    input.session.rootMode = decision.rootMode;
  }
  if (decision.requestedWorkspaceRoot) {
    input.session.requestedWorkspaceRoot = decision.requestedWorkspaceRoot;
  }
  if (decision.targetPathBase) {
    input.session.targetPathBase = decision.targetPathBase;
  }
  if (Object.prototype.hasOwnProperty.call(decision, "gitRoot")) {
    input.session.gitRoot = decision.gitRoot ?? null;
  }
  input.session.updatedAt = input.updatedAt;
  return input.session;
}
