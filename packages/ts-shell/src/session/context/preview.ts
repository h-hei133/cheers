import path from 'node:path';
import { projectSessionFileLayout } from '../store/sessionFileLayout.js';
import { readSessionFileVersion } from '../store/version.js';
import { readSessionRecordSnapshotAsync } from '../store/sessionStore.js';
import type { BoundSessionHost } from '../store/contract.js';
import type { Session } from '../schema/sessionRecord.js';
import { captureWorkspaceRoot, assertWorkspaceRoot } from '../../core/workspace/roots.js';
import { normalizeLegacyPermissionWorkingMemory } from '../continuation/projectRootRebaseProjection.js';
import { buildSessionContinuitySnapshot } from '../continuation/sessionContinuitySnapshot.js';
import { buildRecoverySnapshotForSession } from '../recovery/sessionRecoveryRuntime.js';
import { SESSION_APPROVAL_AUDIT_HISTORY_LIMIT } from '../approval/sessionApprovalMemory.js';
import { buildSessionResumeContext } from '../continuation/sessionPromptContinuity.js';
import { historyDigest } from '../../context/request/identity.js';
import { decodeGoal, goalMatchesScope } from '../../planning/goal/codec.js';
import { directoryIdentity } from '../store/bound.js';

/** Small, complete read only. Larger histories remain unknown rather than truncated. */
export async function readPromptPreview(host: BoundSessionHost, expected: Session, cwd: string, prompt: string,
  signal?: AbortSignal, onSource?: (target: string) => void) {
  const directory = host.getSessionDirPath(expected.id);
  const layout = projectSessionFileLayout({ sessionsDir: path.dirname(directory), sessionId: expected.id });
  if (layout.sessionDir !== directory) throw new Error('Session preview identity is unavailable.');
  const root = captureWorkspaceRoot(expected.projectRoot, expected.projectRoot, 'read');
  for (const target of [layout.metadataPath, layout.statePath, layout.transcriptPath]) onSource?.(target);
  const version = readSessionFileVersion(layout);
  const capturedDirectoryIdentity = directoryIdentity(layout);
  const expectedTurns = expected.turns;
  if (expectedTurns.length > 4096) throw new Error('Live session exceeds the context preview limit.');
  const expectedHistory = historyDigest(expectedTurns);
  const binding = () => JSON.stringify([expected.id, expected.createdAt, expected.projectRoot,
    expected.workspaceRoots, expected.contextSelection]);
  const expectedBinding = binding();
  const snapshot = await readSessionRecordSnapshotAsync({ sessionId: expected.id, layout, cwd, signal,
    limits: { metadataBytes: 256 * 1024, stateBytes: 2 * 1024 * 1024, transcriptBytes: 4 * 1024 * 1024, transcriptLines: 8192, entries: 4096 } });
  const { session, state, events } = snapshot;
  const verify = () => {
    signal?.throwIfAborted(); assertWorkspaceRoot(root);
    if (host.getSessionDirPath(expected.id) !== directory || readSessionFileVersion(layout) !== version || expected.turns !== expectedTurns
      || historyDigest(expected.turns) !== expectedHistory || binding() !== expectedBinding) {
      throw new Error('Session changed during context preview.');
    }
  };
  verify();
  if (session.id !== expected.id || session.createdAt !== expected.createdAt || session.projectRoot !== expected.projectRoot
    || state.projectRoot !== expected.projectRoot || historyDigest(session.turns) !== expectedHistory
    || JSON.stringify(session.contextSelection) !== JSON.stringify(expected.contextSelection)
    || JSON.stringify(session.workspaceRoots) !== JSON.stringify(expected.workspaceRoots)
    || snapshot.transcriptTruncated || snapshot.warnings.length) {
    throw new Error('No complete current session preview is available.');
  }
  // Match dispatch's legacy projection without its one-time persistence repair.
  const normalized = state.workingMemory ? { ...state, workingMemory: normalizeLegacyPermissionWorkingMemory({
    workingMemory: state.workingMemory, sessionProjectRoot: session.projectRoot }) } : state;
  const continuity = buildSessionContinuitySnapshot({ session, stateSnapshot: normalized,
    recoverySnapshot: buildRecoverySnapshotForSession({ sessionId: session.id, session, state: normalized, transcriptEvents: events }),
    transcriptEvents: events, approvalHistoryLimit: SESSION_APPROVAL_AUDIT_HISTORY_LIMIT });
  verify();
  const scope = { sessionId: session.id, sessionCreatedAt: session.createdAt,
    workspace: { path: root.path, identity: root.identity } };
  const goal = state.goal === undefined ? undefined : decodeGoal(state.goal);
  if (state.goal !== undefined && !goal) throw new Error('Saved goal is invalid.');
  return { session, state, scope, directoryIdentity: capturedDirectoryIdentity,
    goalObjective: goal && goalMatchesScope(goal, scope) && goal.phase === 'active' ? goal.objective : undefined,
    continuityContextFor: (currentPrompt: string) => buildSessionResumeContext({ currentPrompt, snapshot: continuity }),
    continuityContext: buildSessionResumeContext({ currentPrompt: prompt, snapshot: continuity }), verify };
}
