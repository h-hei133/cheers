/**
 * Restoring every file operation one turn recorded.
 *
 * A turn can touch several files through several calls, and undoing them one
 * at a time is a sequence of decisions the user already made once. The batch
 * is the same decision, taken for the set.
 *
 * It is not one transaction, and nothing here pretends otherwise. The existing
 * restore path verifies each operation, writes its intent, restores its files
 * and reads the result back — per operation, under its own locks. Running them
 * in order is what makes the set undoable; running them as one atomic step
 * would require a rollback the ledger does not have, and claiming atomicity
 * that does not exist is worse than reporting what actually happened.
 *
 * Order matters and is not the caller's to choose: the ledger only restores the
 * newest outstanding operation, because an older one may have been written on
 * top of it. So the batch walks newest first and stops at the first operation
 * that cannot be restored — continuing past it would restore older content over
 * a file the failed step left in an unknown state.
 */

import type { CommandContext } from '../../../core/commands/types.js';
import type { OperationReceipt } from '../operation/model.js';
import { previewOperation, type UndoPreview } from '../operation/preview.js';
import { restoreOperation, type UndoResult } from '../operation/restore.js';
import type { OperationAccess } from '../operation/access.js';
import { operationsForTurn, undoScope } from './service.js';

export interface TurnRestoreStep {
  readonly operationId: string;
  readonly status: UndoResult['status'];
  readonly files: UndoResult['files'];
}

export interface TurnRestoreOutcome {
  /** What happened, newest operation first. */
  readonly steps: readonly TurnRestoreStep[];
  /** Operations the turn recorded that the run never reached. */
  readonly skipped: readonly string[];
  /**
   * True only when every operation of the turn was restored and verified.
   *
   * Deliberately not "no error": a partial restore is the outcome most worth
   * reporting clearly, and a boolean that means "did not throw" would flatten
   * it into success.
   */
  readonly complete: boolean;
  /** Why the run stopped early, when it did. */
  readonly stoppedBecause?: string;
}

export interface TurnRestoreHost {
  context(): CommandContext;
  busy?(): boolean;
  publish?(result: UndoResult, receipt: OperationReceipt): void;
}

/**
 * Restore every outstanding operation of `turnId`, newest first.
 *
 * `confirmed` gates the write exactly as the single-operation path does: this
 * function previews and then restores, and without confirmation it only
 * reports what it would have done.
 */
export async function restoreTurn(
  host: TurnRestoreHost,
  turnId: string,
  confirmed: boolean,
  access: OperationAccess = {},
): Promise<TurnRestoreOutcome> {
  const context = host.context();
  if (host.busy?.()) return { steps: [], skipped: [], complete: false, stoppedBecause: 'A run is in progress.' };
  const scope = undoScope(context);
  // Newest first, and only what is still outstanding: a receipt already
  // restored or failed has nothing left to undo and would stop the walk.
  const outstanding = operationsForTurn(context, turnId)
    .filter(receipt => receipt.undo !== 'restored-verified' && receipt.status !== 'failed' && receipt.status !== 'restored');
  if (outstanding.length === 0) {
    return { steps: [], skipped: [], complete: false, stoppedBecause: `No outstanding operation belongs to turn \`${turnId}\`.` };
  }

  const steps: TurnRestoreStep[] = [];
  for (let index = 0; index < outstanding.length; index++) {
    const receipt = outstanding[index]!;
    let preview: UndoPreview;
    try {
      preview = await previewOperation(receipt, access);
    } catch {
      return { steps, skipped: outstanding.slice(index).map(entry => entry.operationId), complete: false,
        stoppedBecause: `Operation ${receipt.operationId} could not be previewed.` };
    }
    if (!preview.canRestore) {
      return { steps, skipped: outstanding.slice(index).map(entry => entry.operationId), complete: false,
        stoppedBecause: `Operation ${receipt.operationId} cannot be restored: ${preview.blockers.join(', ') || 'inspection required'}.` };
    }
    if (JSON.stringify(undoScope(host.context())) !== JSON.stringify(scope)) {
      return { steps, skipped: outstanding.slice(index).map(entry => entry.operationId), complete: false,
        stoppedBecause: 'The undo context changed during the restore.' };
    }
    const result = await restoreOperation(preview, confirmed ? {
      operationId: receipt.operationId, sessionId: receipt.sessionId,
      workspaceIdentity: receipt.workspace.identity, revision: preview.revision,
    } : undefined, access);
    steps.push({ operationId: receipt.operationId, status: result.status, files: result.files });
    if (result.status === 'restored-verified') {
      try { host.publish?.(result, receipt); } catch { /* The step's own result stands; a publish failure must not invent another. */ }
      continue;
    }
    // Anything else leaves this operation's files in a state the next step
    // would build on without knowing it.
    return { steps, skipped: outstanding.slice(index + 1).map(entry => entry.operationId), complete: false,
      stoppedBecause: `Operation ${receipt.operationId} ended as ${result.status}; the operations older than it were not attempted.` };
  }
  return { steps, skipped: [], complete: steps.every(step => step.status === 'restored-verified') };
}
