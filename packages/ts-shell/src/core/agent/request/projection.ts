import type { ScopeLedger } from './model.js';

export function requestLedgerFacts(scope: ScopeLedger) {
  const attempts = Object.values(scope.pending);
  const knownTokens = scope.inputTokens + scope.outputTokens;
  return {
    knownTokens,
    partialKnownTokens: attempts.reduce((total, attempt) => total + (attempt.usage?.inputTokens ?? 0) + (attempt.usage?.outputTokens ?? 0), 0),
    retainedTokens: attempts.reduce((total, attempt) => total + (attempt.bound ? attempt.bound.inputTokens + attempt.bound.outputTokens : 0), 0),
    unknownAttempts: attempts.filter(attempt => attempt.dispatched).length,
    unboundedAttempts: attempts.filter(attempt => !attempt.bound).length,
    reservedAttempts: attempts.filter(attempt => !attempt.dispatched).length,
    historyUnknown: scope.historyUnknown,
    breach: scope.breach !== undefined,
  };
}
