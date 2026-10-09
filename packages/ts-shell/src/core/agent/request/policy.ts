import { confirmRequestUnsent, dispatchRequest, reserveRequest, settleRequest } from './ledger.js';
import type { ModelAttempt, RequestLedgerStore, RequestPolicy } from './model.js';
import { ModelAdmissionError } from './model.js';

/** The durable store is the authority; an attempt handle carries no mutable balance. */
export function createRequestPolicy(store: RequestLedgerStore, scopeId: string, completionReserve?: () => number, admission?: () => void): RequestPolicy {
  const available = (cap: number | undefined): number | undefined => {
    admission?.();
    if (cap === undefined) return undefined;
    const held = completionReserve?.() ?? 0;
    if (!Number.isSafeInteger(held) || held < 0 || held > cap) throw new ModelAdmissionError('exhausted');
    return cap - held;
  };
  return {
    withCompletionReserve: tokens => createRequestPolicy(store, scopeId, tokens, admission),
    withAdmission: admit => createRequestPolicy(store, scopeId, completionReserve, () => { admission?.(); admit(); }),
    reserve: request => {
      const sequence = store.transaction(true, (ledger, constraint) => reserveRequest(ledger, scopeId, request, available(constraint.cap)));
      const attempt: ModelAttempt = {
        id: `${scopeId}/${sequence}`,
        dispatch: () => store.transaction(true, (ledger, constraint) => ({ ledger: dispatchRequest(ledger, scopeId, sequence, available(constraint.cap)), value: undefined })),
        confirmUnsent: () => store.transaction(false, ledger => ({ ledger: confirmRequestUnsent(ledger, scopeId, sequence), value: undefined })),
        settle: usage => {
          const breached = store.transaction(false, ledger => {
            const next = settleRequest(ledger, scopeId, sequence, usage);
            return { ledger: next, value: next.scopes[scopeId]!.breach !== undefined };
          });
          if (breached) throw new ModelAdmissionError('breach', 'persisted');
        },
      };
      return Object.freeze(attempt);
    },
  };
}
