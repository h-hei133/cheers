import path from 'node:path';
import { inspectWorkspaceFile } from '../../../edit/authority/state.js';
import { readOperations } from '../../../edit/recovery/operation/store.js';
import type { OperationReceipt } from '../../../edit/recovery/operation/model.js';
import type { BoundSessionScope } from '../../../session/store/bound.js';
import type { TargetObservation } from './model.js';

export function observeTargets(root: string, targets: readonly string[], assertAccess: (absolute: string) => void): readonly TargetObservation[] {
  return targets.map(target => {
    const relative = path.relative(root, path.resolve(root, target)); const state = inspectWorkspaceFile(root, relative, assertAccess, 1024 * 1024);
    return { path: relative, version: state.state === 'absent' ? state : { state: 'exists', hash: state.hash, identity: state.identity, mode: state.mode } };
  });
}
export function scopedOperations(scope: BoundSessionScope): readonly OperationReceipt[] {
  return readOperations({ sessionId: scope.sessionId, workspace: scope.workspace });
}
export function operationSequence(operations: readonly OperationReceipt[]): number { return operations.reduce((max, operation) => Math.max(max, operation.sequence), 0); }
/** Only post-approval matching committed receipts from this exact session/workspace count. */
export function matchingOperations(operations: readonly OperationReceipt[], baseline: number, targets: readonly TargetObservation[]): readonly OperationReceipt[] | undefined {
  const result: OperationReceipt[] = [];
  for (const target of targets) {
    const latest = operations.find(operation => operation.files.some(file => file.path === target.path));
    if (!latest || latest.sequence <= baseline || latest.status !== 'committed' || latest.undo !== 'none') return undefined;
    const file = latest.files.find(file => file.path === target.path)!;
    if (file.status !== 'committed' || file.undo !== 'none' || file.after.state !== target.version.state
      || target.version.state === 'exists' && (file.after.state !== 'exists' || file.after.hash !== target.version.hash)) return undefined;
    if (!result.some(item => item.operationId === latest.operationId)) result.push(latest);
  }
  return result;
}
