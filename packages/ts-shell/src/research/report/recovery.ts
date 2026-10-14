import path from 'node:path';
import { processOwnerDisposition } from '../../core/state/owner.js';
import { readOperation } from '../../edit/recovery/operation/store.js';
import type { ResearchRun } from '../run/model.js';
import { runEvent, updateRun, type RunBinding } from '../run/state.js';

/** A target's existence cannot establish the original writer's outcome. */
export function savedOperationOutcome(run: ResearchRun): 'committed' | 'failed' | 'unknown' {
  if (!run.save.operationId || !run.save.callId || !run.save.path) return 'unknown';
  try {
    const receipt = readOperation(run, run.save.operationId);
    const file = receipt.files[0];
    if (receipt.callId !== run.save.callId || receipt.files.length !== 1 || !file
      || file.workspace.path !== run.workspace.path || file.workspace.identity !== run.workspace.identity
      || path.resolve(file.workspace.path, file.path) !== run.save.path || file.kind !== 'create'
      || file.before.state !== 'absent' || file.after.state !== 'exists' || receipt.undo !== 'none' || file.undo !== 'none') return 'unknown';
    if (receipt.status === 'committed' && file.status === 'committed' && !file.compensation) return 'committed';
    if (receipt.status === 'failed' && file.status === 'unchanged'
      || receipt.status === 'restored' && file.compensation === 'restored-verified') return 'failed';
  } catch { /* Missing, unreadable and torn receipts remain unconfirmed. */ }
  return 'unknown';
}

export function recoverResearchSave(binding: RunBinding, run: ResearchRun): boolean {
  if (run.save.status !== 'pending' || !run.save.path) return false;
  // Foreign/unknown and live owners retain their authority and cannot be revoked by inspection.
  if (run.owner && processOwnerDisposition(run.owner) !== 'dead') return false;
  updateRun(binding, current => {
    if (current.revision !== run.revision) throw new Error('Research save changed during recovery.');
    const status = savedOperationOutcome(current);
    return runEvent({ ...current, owner: undefined, save: { ...current.save, status } }, status === 'committed' ? 'saved' : 'stopped',
      status === 'committed' ? 'Original report edit receipt confirms the file committed.'
        : status === 'failed' ? 'Original report edit receipt confirms no retained file change.'
        : 'Report file outcome is unknown after owner loss. Inspect the original edit operation; automatic replay is refused.');
  });
  return true;
}
