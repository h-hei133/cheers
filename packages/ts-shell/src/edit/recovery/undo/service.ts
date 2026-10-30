import type { CommandContext } from '../../../core/commands/types.js';
import { restoreAccess } from '../../../core/commands/restore/access.js';
import { markContextUnknown } from '../../../observability/usageTelemetry.js';
import { captureOperationScope, scanOperations } from '../operation/store.js';
import { latestOperation, previewOperation, type UndoPreview } from '../operation/preview.js';
import { restoreOperation, type UndoResult } from '../operation/restore.js';
import type { OperationAccess } from '../operation/access.js';
import type { OperationScope, OperationReceipt } from '../operation/model.js';
import { pageUndoHistory, pageUndoHistoryAsync } from './history.js';

export interface UndoHost {
  context(): CommandContext;
  busy?(): boolean;
  publish?(result: UndoResult, receipt: OperationReceipt): void;
}

export interface UndoSelection {
  readonly preview?: UndoPreview;
  readonly note: string;
}

export function undoScope(context: CommandContext): OperationScope {
  const blocked = context.admission?.();
  if (blocked) throw new Error(blocked);
  if (!context.sessionId) throw new Error('Undo requires the current saved session.');
  return captureOperationScope({ sessionId: context.sessionId, workspaceRoot: context.projectRoot ?? context.cwd });
}

export function undoAccess(context: CommandContext, abortSignal?: AbortSignal): OperationAccess {
  return { workspaceRoots: context.workspaceRoots, admission: context.admission, assertFileAccess: restoreAccess(context), abortSignal };
}

/** Only the current scoped ledger participates; unresolved newer operations remain barriers. */
export async function prepareUndo(context: CommandContext, signal?: AbortSignal): Promise<UndoSelection> {
  signal?.throwIfAborted();
  const scope = undoScope(context);
  const receipt = latestOperation(scope);
  if (!receipt) return { note: 'Nothing to undo. No un-restored committed file operation belongs to this session and workspace.' };
  const preview = await previewOperation(receipt, undoAccess(context, signal));
  signal?.throwIfAborted();
  if (JSON.stringify(undoScope(context)) !== JSON.stringify(scope)) throw new Error('Undo context changed during preview.');
  return { preview, note: preview.canRestore ? 'Review every file before confirming restoration.'
    : 'This operation requires inspection. Its blocked or unknown results cannot be replayed automatically.' };
}

/**
 * Every operation one turn recorded, newest first.
 *
 * A turn is the prompt that caused the edits: the writer stamps each receipt
 * with that prompt's entry id, so two edits from one request share it. This is
 * a selection over the existing ledger, not a second one — the receipts, their
 * previews and their restorations are the same objects `/undo` already uses.
 *
 * A receipt without a correlation id belongs to no turn and is never selected;
 * treating "unknown" as "the turn you meant" would restore something the user
 * did not name.
 */
export function operationsForTurn(context: CommandContext, turnId: string): readonly OperationReceipt[] {
  // `scanOperations` yields; spreading first is what makes the selection an
  // array rather than a generator that has no `filter`.
  return [...scanOperations(undoScope(context))].filter(receipt => receipt.correlationId === turnId);
}

export function undoHistory(context: CommandContext, operationId?: string): readonly OperationReceipt[] {
  const receipts: OperationReceipt[] = [];
  for (const receipt of scanOperations(undoScope(context))) {
    if (operationId === undefined || receipt.operationId === operationId) receipts.push(receipt);
  }
  return receipts;
}

export function readUndoHistoryPage(context: CommandContext, cursor?: string) {
  const scope = undoScope(context);
  return pageUndoHistory(scope, scanOperations(scope), cursor);
}

export async function readUndoHistoryPageAsync(context: CommandContext, cursor?: string, signal?: AbortSignal) {
  signal?.throwIfAborted();
  const scope = undoScope(context);
  const identity = JSON.stringify(scope);
  const check = (): void => {
    signal?.throwIfAborted();
    if (JSON.stringify(undoScope(context)) !== identity) throw new Error('Undo context changed during inspection.');
  };
  const page = await pageUndoHistoryAsync(scope, scanOperations(scope, check), cursor, signal);
  check();
  return page;
}

export async function executeUndo(host: UndoHost, preview: UndoPreview, confirmed: boolean): Promise<{ readonly result: UndoResult; readonly warning?: string }> {
  const original = preview.receipt;
  let result: UndoResult;
  try {
    const context = host.context();
    const scope = undoScope(context);
    if (host.busy?.() || scope.sessionId !== original.sessionId || scope.workspace.path !== original.workspace.path
      || scope.workspace.identity !== original.workspace.identity) throw new Error('Undo context changed.');
    result = await restoreOperation(preview, confirmed ? { operationId: original.operationId, sessionId: original.sessionId,
      workspaceIdentity: original.workspace.identity, revision: preview.revision } : undefined, undoAccess(context));
  } catch {
    result = { status: confirmed ? 'blocked' : 'denied', operationId: original.operationId,
      files: original.files.map(file => ({ path: file.path, status: file.undo })) };
  }
  const warning = publishUndoResult(host, result, original);
  return { result, ...(warning ? { warning } : {}) };
}

/** File evidence survives context publication failure for single and batch restores. */
export function publishUndoResult(host: UndoHost, result: UndoResult, receipt: OperationReceipt): string | undefined {
  if (['restored-verified', 'partial', 'unknown'].includes(result.status)) {
    try { markContextUnknown(receipt.sessionId); host.publish?.(result, receipt); }
    catch { return 'File results remain in the operation receipt; the model context update could not be confirmed.'; }
  }
  return undefined;
}
