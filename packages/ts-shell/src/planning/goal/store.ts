import { lstatSync } from 'node:fs';
import path from 'node:path';
import { captureWorkspaceRoot } from '../../core/workspace/roots.js';
import { freezeDeep } from '../../core/values/freeze.js';
import { sameValue } from '../../config/values.js';
import type { Session } from '../../session/schema/sessionRecord.js';
import { projectSessionFileLayout, validateSessionId, type SessionFileLayout } from '../../session/store/sessionFileLayout.js';
import { readSessionFileVersion } from '../../session/store/version.js';
import { readSessionMetadataRecord } from '../../session/store/sessionStore.js';
import { readStateSnapshotRequired } from '../../session/store/sessionStateStore.js';
import { withFileLock, writeJsonFileAtomic } from '../../session/store/sessionFileStore.js';
import { decodeGoal, goalMatchesScope } from './codec.js';
import { GoalWriteError, type GoalAction, type GoalScope, type GoalWriteState, type SessionGoal } from './model.js';
import { transitionGoal } from './state.js';
import { decodeRequestLedger } from '../../core/agent/request/codec.js';
import { createRequestLedger, initializeRequestScope } from '../../core/agent/request/ledger.js';

export interface GoalStoreHost {
  readonly getSessionDirPath: (sessionId: string) => string;
}

class GoalEdit {
  constructor(readonly layout: SessionFileLayout, readonly directoryIdentity: string, readonly scope: GoalScope,
    readonly goal: SessionGoal | undefined, readonly rawGoal: unknown, readonly requestLedger?: unknown) { freezeDeep(this); }
}
export type SessionGoalEdit = GoalEdit;

export function readGoalEdit(host: GoalStoreHost, session: Session): SessionGoalEdit {
  try {
    const layout = layoutFor(host, session.id);
    const version = readSessionFileVersion(layout);
    const current = readCurrent(layout, session);
    if (readSessionFileVersion(layout) !== version) throw new GoalWriteError('conflict');
    return new GoalEdit(layout, directoryIdentity(layout), current.scope, current.goal, current.state.goal, current.state.requestLedger);
  } catch (error) {
    throw error instanceof GoalWriteError ? error : new GoalWriteError('unavailable');
  }
}

/** Change only the goal under the store's existing lock, preserving the latest other fields. */
export function writeGoal(host: GoalStoreHost, session: Session, baseline: SessionGoalEdit, action: GoalAction): SessionGoalEdit {
  if (!(baseline instanceof GoalEdit)) throw new GoalWriteError('invalid');
  let outcome: GoalWriteState = 'unchanged';
  let failure: GoalWriteError['code'] = 'lock-failed';
  let confirmed = baseline;
  try {
    const layout = layoutFor(host, session.id);
    if (layout.sessionDir !== baseline.layout.sessionDir) throw new GoalWriteError('conflict');
    withFileLock(layout.stateLockPath, () => {
      failure = 'unavailable';
      const current = readCurrent(layout, session);
      if (directoryIdentity(layout) !== baseline.directoryIdentity || !sameValue(current.scope, baseline.scope)
        || !sameValue(current.state.goal, baseline.rawGoal)) throw new GoalWriteError('conflict');
      const goal = transitionGoal(current.goal, current.scope, action);
      if (sameValue(goal, current.goal)) return;
      let requestLedger = current.state.requestLedger;
      if (goal && (action.type === 'set' || action.type === 'import')) {
        const binding = { sessionId: session.id, sessionCreatedAt: session.createdAt, directoryIdentity: baseline.directoryIdentity };
        const ledger = requestLedger === undefined ? createRequestLedger(binding) : decodeRequestLedger(requestLedger);
        if (!ledger || ledger.sessionId !== binding.sessionId || ledger.sessionCreatedAt !== binding.sessionCreatedAt
          || ledger.directoryIdentity !== binding.directoryIdentity) throw new GoalWriteError('invalid');
        requestLedger = initializeRequestScope(ledger, { id: goal.id, workspacePath: goal.workspace.path, workspaceIdentity: goal.workspace.identity }, false);
      }
      const next = { ...current.state, goal, ...(requestLedger !== undefined ? { requestLedger } : {}) };
      const beforeWrite = readSessionFileVersion(layout);
      // Recheck the durable identity immediately before publication; deletion
      // and root migration must not be repaired by recreating an old session.
      const latest = readCurrent(layout, session);
      if (readSessionFileVersion(layout) !== beforeWrite || !sameValue(latest.state, current.state)
        || !sameValue(latest.scope, current.scope) || directoryIdentity(layout) !== baseline.directoryIdentity
        || layoutFor(host, session.id).sessionDir !== layout.sessionDir) throw new GoalWriteError('conflict');
      outcome = 'unknown'; failure = 'write-failed';
      writeJsonFileAtomic(layout.statePath, next);
      failure = 'verification-failed';
      const persisted = readCurrent(layout, session);
      if (!sameValue(persisted.state, next) || !sameValue(persisted.scope, current.scope)
        || directoryIdentity(layout) !== baseline.directoryIdentity) throw new GoalWriteError('verification-failed', 'unknown');
      confirmed = new GoalEdit(layout, baseline.directoryIdentity, persisted.scope, persisted.goal, persisted.state.goal, persisted.state.requestLedger);
      outcome = 'persisted'; failure = 'lock-failed';
    }, { createParent: false, recovery: 'local-dead' });
    return confirmed;
  } catch (error) {
    throw new GoalWriteError(error instanceof GoalWriteError ? error.code : failure, outcome);
  }
}

export function goalIsDetached(edit: SessionGoalEdit): boolean {
  return edit.goal !== undefined && !goalMatchesScope(edit.goal, edit.scope);
}

function layoutFor(host: GoalStoreHost, sessionId: string): SessionFileLayout {
  if (validateSessionId(sessionId) !== sessionId || sessionId === '.' || sessionId === '..') throw new GoalWriteError('invalid');
  const directory = host.getSessionDirPath(sessionId);
  const layout = projectSessionFileLayout({ sessionsDir: path.dirname(directory), sessionId });
  if (layout.sessionDir !== directory) throw new GoalWriteError('invalid');
  return layout;
}

function readCurrent(layout: SessionFileLayout, expected: Session) {
  const metadata = readSessionMetadataRecord(layout.metadataPath);
  const state = readStateSnapshotRequired(layout.statePath);
  if (!metadata || metadata.id !== expected.id || metadata.createdAt !== expected.createdAt
    || !state || typeof state !== 'object' || Array.isArray(state)
    || !['active', 'interrupted', 'completed', 'error', 'terminated'].includes(state.status)
    || typeof metadata.projectRoot !== 'string' || typeof state.projectRoot !== 'string') throw new GoalWriteError('unavailable');
  const workspace = captureWorkspaceRoot(metadata.projectRoot, metadata.projectRoot, 'read');
  const supplied = captureWorkspaceRoot(expected.projectRoot, expected.projectRoot, 'read');
  const stateWorkspace = captureWorkspaceRoot(state.projectRoot, state.projectRoot, 'read');
  if (workspace.path !== supplied.path || workspace.identity !== supplied.identity || workspace.path !== stateWorkspace.path
    || workspace.identity !== stateWorkspace.identity) throw new GoalWriteError('conflict');
  const goal = state.goal === undefined ? undefined : decodeGoal(state.goal);
  if (state.goal !== undefined && !goal) throw new GoalWriteError('invalid');
  const scope: GoalScope = { sessionId: metadata.id, sessionCreatedAt: metadata.createdAt,
    workspace: { path: workspace.path, identity: workspace.identity } };
  return { scope, goal, state };
}

function directoryIdentity(layout: SessionFileLayout): string {
  const stat = lstatSync(layout.sessionDir, { bigint: true });
  if (!stat.isDirectory()) throw new GoalWriteError('unavailable');
  return `${stat.dev}:${stat.ino}:${stat.birthtimeMs}`;
}
