import { decodeWorkspaceRoots } from '../../core/workspace/model.js';
import { decodeContextEntries } from '../../context/attachment/entry.js';
import { recoverUsageSnapshot } from '../../observability/usage/recovery.js';
import type { SessionMessage } from '../schema/sessionMessage.js';
import type { SessionMetadata } from '../schema/sessionMetadataCodec.js';
import type { Session } from '../schema/sessionRecord.js';
import type { SessionStateSnapshot } from '../schema/sessionStateSnapshot.js';

export function projectLoadedSession(input: {
  readonly metadata: SessionMetadata | undefined;
  readonly state: SessionStateSnapshot;
  readonly turns: SessionMessage[];
  readonly cwd: string;
}): Session {
  const metadata = input.metadata;
  if (!metadata) {
    throw new Error('Session metadata missing');
  }
  return {
    id: metadata.id,
    ...(input.state.contextSelection === undefined ? {} : { contextSelection: input.state.contextSelection }),
    ...(input.state.contextAttachments === undefined ? {} : { contextAttachments: decodeContextEntries(input.state.contextAttachments) }),
    ...([input.state.goal, input.state.plan, input.state.goalDraft, input.state.goalAcceptance, input.state.advisor, input.state.research, input.state.gitWorkflow, input.state.security, input.state.jobs].some(value => value !== undefined)
      ? { hasPlanningState: true } : {}),
    ...(input.state.workspaceRoots !== undefined ? { workspaceRoots: decodeWorkspaceRoots(input.state.workspaceRoots) } : {}),
    projectRoot: metadata.projectRoot?.trim() || input.state.projectRoot?.trim() || input.cwd,
    ...(metadata.rootMode ? { rootMode: metadata.rootMode } : {}),
    ...(metadata.requestedWorkspaceRoot?.trim() ? { requestedWorkspaceRoot: metadata.requestedWorkspaceRoot.trim() } : {}),
    ...(metadata.targetPathBase?.trim() ? { targetPathBase: metadata.targetPathBase.trim() } : {}),
    ...(Object.prototype.hasOwnProperty.call(metadata, 'gitRoot') ? { gitRoot: metadata.gitRoot?.trim() || null } : {}),
    title: metadata.title,
    ...(metadata.pinned === true ? { pinned: true } : {}),
    ...(metadata.parentSession ? { parentSession: metadata.parentSession } : {}),
    createdAt: metadata.createdAt,
    updatedAt: metadata.updatedAt,
    status: input.state.status,
    usage: recoverUsageSnapshot(input.state.usage),
    pendingPrompt: input.state.pendingPrompt,
    lastError: input.state.lastError,
    turns: input.turns,
  };
}
