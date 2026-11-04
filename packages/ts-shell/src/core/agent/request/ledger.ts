import { sameValue } from '../../../config/values.js';
import { freezeDeep } from '../../values/freeze.js';
import { ModelAdmissionError, type LedgerBinding, type ModelUsage, type PreparedRequest,
  type RequestLedger, type RequestScope, type ScopeLedger } from './model.js';
import { finalizedSequence, finalizeSequence } from './ranges.js';
import { validModelUsage, validRequestBound } from './codec.js';
import { refineRequestUsage } from './usage.js';

export function createRequestLedger(binding: LedgerBinding): RequestLedger {
  return freezeDeep({ ...binding, schemaVersion: 1, meteringVersion: 1, scopes: {} });
}

export function initializeRequestScope(ledger: RequestLedger, scope: RequestScope, historyUnknown: boolean): RequestLedger {
  if (Object.hasOwn(ledger.scopes, scope.id)) {
    if (!sameValue(ledger.scopes[scope.id]!.scope, scope)) throw new ModelAdmissionError('unavailable');
    return ledger;
  }
  return replaceScope(ledger, { scope, nextSequence: 1, finalized: [], pending: {}, inputTokens: 0,
    outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0, historyUnknown });
}

export function reserveRequest(ledger: RequestLedger, scopeId: string, request: PreparedRequest, cap?: number) {
  const scope = requiredScope(ledger, scopeId);
  assertBudget(scope, cap, request.bound ? boundTotal(request) : undefined);
  if (!Number.isSafeInteger(scope.nextSequence + 1)) throw new ModelAdmissionError('unavailable');
  const sequence = scope.nextSequence;
  const { bound: _bound, ...prepared } = request;
  const next = { ...scope, nextSequence: sequence + 1,
    pending: { ...scope.pending, [sequence]: { ...prepared, ...(request.bound !== undefined ? { bound: request.bound } : {}), sequence, dispatched: false } } };
  return { ledger: replaceScope(ledger, next), value: sequence };
}

export function dispatchRequest(ledger: RequestLedger, scopeId: string, sequence: number, cap?: number): RequestLedger {
  const scope = requiredScope(ledger, scopeId);
  const attempt = scope.pending[sequence];
  if (!attempt || attempt.dispatched || finalizedSequence(scope.finalized, sequence)) throw new ModelAdmissionError('replay');
  assertBudget(scope, cap, 0);
  return replaceScope(ledger, { ...scope, pending: { ...scope.pending, [sequence]: { ...attempt, dispatched: true } } });
}

export function confirmRequestUnsent(ledger: RequestLedger, scopeId: string, sequence: number): RequestLedger {
  const scope = requiredScope(ledger, scopeId);
  if (finalizedSequence(scope.finalized, sequence)) return ledger;
  const attempt = scope.pending[sequence];
  if (!attempt || attempt.dispatched) throw new ModelAdmissionError('replay');
  return removeAttempt(ledger, scope, sequence);
}

export function settleRequest(ledger: RequestLedger, scopeId: string, sequence: number, usage?: ModelUsage): RequestLedger {
  const scope = requiredScope(ledger, scopeId);
  if (finalizedSequence(scope.finalized, sequence)) return ledger;
  const attempt = scope.pending[sequence];
  if (!attempt?.dispatched) throw new ModelAdmissionError('replay');
  if (usage !== undefined && !validModelUsage(usage)) throw new ModelAdmissionError('unavailable');
  usage = refineRequestUsage(attempt.usage, usage);
  const exceeded = attempt.bound && usage && ((usage.inputTokens !== undefined && usage.inputTokens > attempt.bound.inputTokens)
    || (usage.outputTokens !== undefined && usage.outputTokens > attempt.bound.outputTokens));
  if (!usage?.complete || usage.inconsistent) {
    return replaceScope(ledger, { ...scope, pending: { ...scope.pending, [sequence]: { ...attempt, ...(usage ? { usage } : {}) } },
      ...(usage && (usage.inconsistent || exceeded) ? { breach: { sequence, actualTokens: (usage.inputTokens ?? 0) + (usage.outputTokens ?? 0),
        boundTokens: attempt.bound ? boundTotal(attempt) : 0 } } : {}) });
  }
  const actualTokens = usage.inputTokens! + usage.outputTokens!;
  const over = exceeded || usage.inconsistent;
  const next = { ...scope, inputTokens: add(scope.inputTokens, usage.inputTokens!), outputTokens: add(scope.outputTokens, usage.outputTokens!),
    cacheReadTokens: add(scope.cacheReadTokens, usage.cacheReadTokens ?? 0), cacheWriteTokens: add(scope.cacheWriteTokens, usage.cacheWriteTokens ?? 0),
    ...(over ? { breach: { sequence, actualTokens, boundTokens: boundTotal(attempt) } } : {}) };
  return removeAttempt(replaceScope(ledger, next), next, sequence);
}

export function assertBudget(scope: ScopeLedger, cap: number | undefined, additional: number | undefined): void {
  if (scope.breach) throw new ModelAdmissionError('breach');
  if (cap === undefined) return;
  if (!Number.isSafeInteger(cap) || cap < 0) throw new ModelAdmissionError('unavailable');
  if (cap === 0) throw new ModelAdmissionError('exhausted');
  if (scope.historyUnknown || Object.values(scope.pending).some(attempt => !attempt.bound)) throw new ModelAdmissionError('history-unknown');
  const retained = Object.values(scope.pending).reduce((total, attempt) => total + boundTotal(attempt), 0);
  const committed = scope.inputTokens + scope.outputTokens + retained;
  if (committed >= cap && (additional === undefined || additional > 0 || committed > cap)) throw new ModelAdmissionError('exhausted');
  if (additional === undefined) throw new ModelAdmissionError('unsupported');
  if (committed + additional > cap) throw new ModelAdmissionError('exhausted');
}

export function requiredScope(ledger: RequestLedger, scopeId: string): ScopeLedger {
  if (!Object.hasOwn(ledger.scopes, scopeId)) throw new ModelAdmissionError('unavailable');
  return ledger.scopes[scopeId]!;
}

function boundTotal(request: Pick<PreparedRequest, 'bound'>): number {
  const bound = request.bound;
  if (!validRequestBound(bound)) {
    throw new ModelAdmissionError('unsupported');
  }
  return bound.inputTokens + bound.outputTokens;
}

function replaceScope(ledger: RequestLedger, scope: ScopeLedger): RequestLedger {
  return freezeDeep({ ...ledger, scopes: { ...ledger.scopes, [scope.scope.id]: scope } });
}

function removeAttempt(ledger: RequestLedger, scope: ScopeLedger, sequence: number): RequestLedger {
  const pending = { ...scope.pending }; delete pending[sequence];
  return replaceScope(ledger, { ...scope, pending, finalized: finalizeSequence(scope.finalized, sequence) });
}

function add(first: number, second: number): number {
  const total = first + second;
  if (!Number.isSafeInteger(total) || total < 0) throw new ModelAdmissionError('unavailable');
  return total;
}
