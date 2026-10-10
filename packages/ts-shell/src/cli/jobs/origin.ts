import { collaborationHosts } from '../collaboration/state.js';
import { readGoalEdit } from '../../planning/goal/store.js';
import { goalMatchesScope } from '../../planning/goal/codec.js';
import type { JobOrigin } from '../../workflow/jobs/model.js';
import type { ShellRuntimeContext } from '../../core/shell/runtimeContext.js';
import type { SessionManager } from '../../session/SessionManager.js';

export function captureOrigin(host: { readonly context: ShellRuntimeContext; readonly manager: SessionManager }): JobOrigin {
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
