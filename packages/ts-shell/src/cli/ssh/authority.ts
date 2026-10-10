import { collaborationHosts } from '../collaboration/state.js';
import { collaborationAdmissionFor } from '../collaboration/policy.js';
import { readGoalEdit } from '../../planning/goal/store.js';
import { goalMatchesScope } from '../../planning/goal/codec.js';
import { sameValue } from '../../config/values.js';
import type { SshComposition } from './model.js';
import type { JobOrigin } from '../../workflow/jobs/model.js';
import { configurationAdmission } from '../../core/shell/configuration.js';

export const sshAuthority = { mode: 'approved-for-write', source: 'tool-runtime-approval', reason: 'Exact separately approved SSH operation, including remote journal observations' } as const;

export function captureOrigin(host: SshComposition): JobOrigin {
  const goal = readGoalEdit(host.manager, host.context.session); const active = collaborationHosts.get(host.context)?.active;
  const prompt = host.manager.getSession(host.context.session.id)?.turns.findLast(turn => turn.role === 'user');
  const sourceEntryId = prompt?.id;
  const note = prompt?.metadata?.source === 'advisor-application' ? prompt.metadata.noteId : undefined;
  const parentId = typeof note === 'string' && note.length > 0 && note.length <= 256 && !/[\x00-\x1f\x7f-\x9f]/.test(note) ? note : undefined;
  const goalId = goal.goal && goal.goal.phase === 'active' && goalMatchesScope(goal.goal, goal.scope) ? goal.goal.id : undefined;
  return { kind: active ? 'collaboration' : goalId ? 'goal' : parentId ? 'advisor' : 'local', ...(goalId ? { goalId } : {}),
    ...(parentId ? { parentId } : {}), ...(sourceEntryId ? { sourceEntryId } : {}),
    ...(active ? { principal: active.acceptance.principal, acceptanceId: active.acceptance.acceptanceId,
      roomId: active.acceptance.roomId, serviceEpoch: active.acceptance.epoch, hostGeneration: active.acceptance.generation } : {}) };
}
export function operationAdmission(host: SshComposition, bindProfile = true, bindWork = true, bindPending = true): () => string | undefined {
  const scope = host.jobs.scope(); const profile = host.profile;
  const collab = bindWork ? collaborationAdmissionFor(host.context) : () => undefined;
  const pending = bindPending ? host.pending?.signal : undefined;
  const cancellationRevision = bindPending ? host.cancellationRevision : undefined;
  const configuration = configurationAdmission(host.context); const capability = host.gate('ssh').admission;
  const goal = bindWork ? readGoalEdit(host.manager, host.context.session).goal : undefined;
  const acceptance = bindWork ? collaborationHosts.get(host.context)?.active : undefined;
  return () => {
    try {
      if (pending?.aborted || bindPending && (host.closing || cancellationRevision !== host.cancellationRevision))
        return 'SSH operation was cancelled locally; remote outcome remains separate.';
      const blocked = configuration() ?? capability?.() ?? collab(); if (blocked) return blocked;
      if (!sameValue(host.jobs.scope(), scope) || bindProfile && host.profile !== profile) return 'SSH session, workspace or profile changed.';
      if (bindWork) {
        const current = readGoalEdit(host.manager, host.context.session).goal;
        if (current?.id !== goal?.id || current?.phase !== goal?.phase || current?.controlRevision !== goal?.controlRevision
          || collaborationHosts.get(host.context)?.active !== acceptance) return 'SSH parent goal or remote acceptance changed.';
      }
      if (bindProfile) profile?.check(); return undefined;
    } catch { return 'SSH authority or source is unavailable or changed.'; }
  };
}
