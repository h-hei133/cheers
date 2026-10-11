import type { WorkspaceRootMode } from "../store/projectBindingPolicy.js";
import type { SessionMessage } from "./sessionMessage.js";
import type { SessionUsageSnapshot } from "../../observability/usage/model.js";
import type { SessionReport } from '../reports/model.js';
import type { WorkspaceRoot } from '../../core/workspace/model.js';
import type { ContextEntry } from '../../context/attachment/entry.js';

export interface Session {
  /** Read-only reentry projection; durable planning owners validate the stored payloads. */
  hasPlanningState?: boolean;
  usage?: SessionUsageSnapshot;
  id: string;
  projectRoot: string;
  workspaceRoots?: readonly WorkspaceRoot[];
  rootMode?: WorkspaceRootMode;
  requestedWorkspaceRoot?: string;
  targetPathBase?: string;
  gitRoot?: string | null;
  title?: string;
  pinned?: boolean;
  /** Original turns remain intact; the context owner derives the model-facing view. */
  contextSelection?: unknown;
  /** Explicit, read-only context entries retained by the session owner. */
  contextAttachments?: readonly ContextEntry[];
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
  /** Read-only observations; excluded from model messages and runtime lifecycle. */
  reports?: readonly SessionReport[];
  /** Includes annotations on other branches, so a rewind cannot make data disposable. */
  hasReportHistory?: boolean;
  pendingPrompt?: string;
  lastError?: string;
}
