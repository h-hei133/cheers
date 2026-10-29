import type { RecoverySnapshot } from './types.js';
import { hasContinuationEvidence } from '../sessionContinuationProjection.js';

/** Idle metadata alone is not unfinished work; retain actual recovery evidence. */
export function hasUnfinishedSessionWork(snapshot: RecoverySnapshot): boolean {
  return hasContinuationEvidence(snapshot)
    || snapshot.interruptedKind !== undefined
    || snapshot.durableStatus === 'stopped'
    || snapshot.terminalClassification === 'stopped'
    || snapshot.terminalReason !== undefined && snapshot.terminalReason !== 'completed'
    || Boolean(snapshot.taskState?.unverifiedFiles.length);
}
