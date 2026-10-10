import { CollaborationError, digest, requireValue, uuid } from '../contract/value.js';
import type { Receipt, ServiceRequest, ServiceState } from '../contract/model.js';
import type { ServiceStore } from './store.js';

/** Persist intent before a structural mutation. Lost replies are queryable, never resent automatically. */
export function mutate(store: ServiceStore, principal: string, request: ServiceRequest,
  action: (state: ServiceState) => unknown): unknown {
  const requestId = uuid(request.requestId); const fingerprint = digest(request);
  const receipt = store.transaction(state => {
    const previous = state.receipts.find(item => item.principal === principal && item.requestId === requestId);
    if (previous) { requireValue(previous.digest === fingerprint && previous.operation === request.operation, 'denied'); return structuredClone(previous); }
    requireValue(state.receipts.length < 1024, 'capacity');
    const next: Receipt = { principal, operation: request.operation, requestId, digest: fingerprint, status: 'intent' };
    state.receipts.push(next); return undefined;
  });
  if (receipt) {
    requireValue(receipt.status === 'committed', 'unknown');
    const saved = receipt.result as { error?: CollaborationError['code']; value?: unknown };
    if (saved.error) throw new CollaborationError(saved.error); return saved.value;
  }
  const result = store.transaction(state => {
    const next = state.receipts.find(item => item.principal === principal && item.requestId === requestId);
    requireValue(next?.status === 'intent', 'unknown');
    // Validate on a copy so a rejected action cannot publish its earlier in-memory changes.
    const working = structuredClone(state);
    try {
      const value = action(working); const updated = working.receipts.find(item => item.principal === principal && item.requestId === requestId)!;
      updated.status = 'committed'; updated.result = { value };
      Object.assign(state, working); return { value };
    } catch (error) {
      const code = error instanceof CollaborationError ? error.code : 'unavailable';
      next.status = 'committed'; next.result = { error: code }; return { error: code };
    }
  });
  if (result.error) throw new CollaborationError(result.error); return result.value;
}
export function readReceipt(state: ServiceState, principal: string, requestId: unknown): unknown {
  const receipt = state.receipts.find(item => item.principal === principal && item.requestId === uuid(requestId));
  return receipt ? { operation: receipt.operation, requestId: receipt.requestId, status: receipt.status, result: receipt.result }
    : { status: 'unknown', requestId };
}
