import type { WorkspaceRootMode } from "../store/projectBindingPolicy.js";
import type { SessionMessage } from "./sessionMessage.js";

export interface Session {
  id: string;
  projectRoot: string;
  rootMode?: WorkspaceRootMode;
  requestedWorkspaceRoot?: string;
  targetPathBase?: string;
  gitRoot?: string | null;
  title?: string;
  /**
   * The session this one was forked from, when it was.
   *
   * A fork's conversation begins as a copy of another's, and nothing in the
   * transcript says so: the events are the source's, verbatim. Recording the
   * origin here is what keeps a copied conversation traceable to what it was
   * copied from, the way the transcript's own entries record their parent.
   */
  parentSession?: string;
  createdAt: string;
  updatedAt: string;
  status: "active" | "interrupted" | "completed" | "error" | "terminated";
  turns: SessionMessage[];
  pendingPrompt?: string;
  lastError?: string;
}
