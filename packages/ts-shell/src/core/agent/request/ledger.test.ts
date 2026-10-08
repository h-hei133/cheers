import { describe, expect, it } from 'vitest';
import { createRequestLedger, initializeRequestScope, reserveRequest, dispatchRequest, settleRequest, confirmRequestUnsent } from './ledger.js';
import { decodeRequestLedger } from './codec.js';
import { requestLedgerFacts } from './projection.js';
import type { PreparedRequest } from './model.js';

const scope = { id: 'goal', workspacePath: '/project', workspaceIdentity: '1:2' };
const request: PreparedRequest = { requestId: 'logical', bodyDigest: '0'.repeat(64), provider: 'test', model: 'm', endpoint: 'test', purpose: 'turn',
  bound: { inputTokens: 10, outputTokens: 10, source: 'test-authority', version: '1' } };
const fresh = () => initializeRequestScope(createRequestLedger({ sessionId: 's', sessionCreatedAt: '2026-10-08', directoryIdentity: '1:2' }), scope, false);

describe('durable request accounting', () => {
  it('reserves before sends, releases only confirmed-unsent and preserves unknown reservations', () => {
    const first = reserveRequest(fresh(), scope.id, request, 20);
    expect(() => reserveRequest(first.ledger, scope.id, request, 20)).toThrow(/exhausted/);
    const sent = dispatchRequest(first.ledger, scope.id, first.value, 20);
    expect(() => dispatchRequest(sent, scope.id, first.value, 20)).toThrow(/replay/);
    expect(() => confirmRequestUnsent(sent, scope.id, first.value)).toThrow(/replay/);
    const unknown = settleRequest(sent, scope.id, first.value);
    expect(requestLedgerFacts(unknown.scopes.goal!)).toMatchObject({ retainedTokens: 20, unknownAttempts: 1 });
    expect(() => reserveRequest(unknown, scope.id, request, 20)).toThrow(/exhausted/);
    const unsent = confirmRequestUnsent(first.ledger, scope.id, first.value);
    expect(reserveRequest(unsent, scope.id, request, 20).value).toBe(2);
  });

  it('compacts finalized identities, preserves a sparse unknown, and rejects replay after restart', () => {
    let ledger = fresh();
    for (let index = 0; index < 8; index++) {
      const reserved = reserveRequest(ledger, scope.id, request);
      ledger = dispatchRequest(reserved.ledger, scope.id, reserved.value);
      if (index !== 2) ledger = settleRequest(ledger, scope.id, reserved.value, { version: 1, inputTokens: 10, outputTokens: 2, cacheReadTokens: 8, complete: true });
    }
    expect(ledger.scopes.goal).toMatchObject({ finalized: [[1, 2], [4, 8]], inputTokens: 70, outputTokens: 14, cacheReadTokens: 56 });
    expect(Object.keys(ledger.scopes.goal!.pending)).toEqual(['3']);
    ledger = decodeRequestLedger(JSON.parse(JSON.stringify(ledger)))!;
    expect(settleRequest(ledger, scope.id, 1, { version: 1, inputTokens: 999, outputTokens: 0, complete: true })).toEqual(ledger);
    expect(() => dispatchRequest(ledger, scope.id, 1)).toThrow(/replay/);
    ledger = settleRequest(ledger, scope.id, 3, { version: 1, inputTokens: 10, outputTokens: 2, complete: true });
    expect(ledger.scopes.goal!.finalized).toEqual([[1, 8]]);
    expect(decodeRequestLedger(ledger)).toBeDefined();
  });

  it('retains off-cap unknown history and reports exhausted before unsupported for lowered caps', () => {
    let ledger = reserveRequest(fresh(), scope.id, { ...request, bound: undefined }).ledger;
    ledger = dispatchRequest(ledger, scope.id, 1);
    expect(() => reserveRequest(ledger, scope.id, request, 100)).toThrow(/history-unknown/);
    let known = reserveRequest(fresh(), scope.id, request).ledger;
    known = dispatchRequest(known, scope.id, 1);
    known = settleRequest(known, scope.id, 1, { version: 1, inputTokens: 10, outputTokens: 2, complete: true });
    expect(() => reserveRequest(known, scope.id, { ...request, bound: undefined }, 10)).toThrow(/exhausted/);
    expect(() => reserveRequest(known, scope.id, { ...request, bound: undefined }, 100)).toThrow(/unsupported/);
    expect(() => reserveRequest(fresh(), scope.id, { ...request, bound: undefined }, 0)).toThrow(/exhausted/);
  });

  it('blocks a proven partial or complete bound breach without truncating actual values', () => {
    for (const usage of [{ version: 1 as const, inputTokens: 11, complete: false },
      { version: 1 as const, inputTokens: 11, outputTokens: 2, complete: true }]) {
      const reserved = reserveRequest(fresh(), scope.id, request, 100);
      const settled = settleRequest(dispatchRequest(reserved.ledger, scope.id, 1, 100), scope.id, 1, usage);
      expect(settled.scopes.goal!.breach).toMatchObject({ sequence: 1, actualTokens: usage.inputTokens + ('outputTokens' in usage ? usage.outputTokens : 0), boundTokens: 20 });
      expect(() => reserveRequest(settled, scope.id, request, 100)).toThrow(/breach/);
      expect(() => reserveRequest(settled, scope.id, request)).toThrow(/breach/);
    }
  });

  it('retains partial category facts across sparse snapshots and flags conflicting cumulative values', () => {
    const reserved = reserveRequest(fresh(), scope.id, request);
    let ledger = dispatchRequest(reserved.ledger, scope.id, 1);
    ledger = settleRequest(ledger, scope.id, 1, { version: 1, inputTokens: 10, reportedTotalTokens: 12, complete: false });
    ledger = settleRequest(ledger, scope.id, 1, { version: 1, outputTokens: 2, complete: false });
    ledger = settleRequest(ledger, scope.id, 1);
    expect(ledger.scopes.goal!.pending['1']!.usage).toMatchObject({ inputTokens: 10, outputTokens: 2, reportedTotalTokens: 12, complete: false });
    ledger = settleRequest(ledger, scope.id, 1, { version: 1, inputTokens: 9, outputTokens: 2, complete: true });
    expect(ledger.scopes.goal!.pending['1']!.usage).toMatchObject({ inputTokens: 10, outputTokens: 2, complete: false, inconsistent: true });
    expect(ledger.scopes.goal!.breach).toBeDefined();
  });

  it('reconciles larger trusted inclusive counts after a missing native cache category', () => {
    const prepared = { ...request, bound: { ...request.bound!, inputTokens: 100 } };
    const reserved = reserveRequest(fresh(), scope.id, prepared);
    let ledger = dispatchRequest(reserved.ledger, scope.id, 1);
    ledger = settleRequest(ledger, scope.id, 1, { version: 1, inputTokens: 10, outputTokens: 2, complete: false });
    ledger = settleRequest(ledger, scope.id, 1, { version: 1, inputTokens: 70, outputTokens: 2, cacheReadTokens: 60, complete: true });
    expect(ledger.scopes.goal).toMatchObject({ inputTokens: 70, outputTokens: 2, pending: {}, finalized: [[1, 1]] });
    expect(ledger.scopes.goal!.breach).toBeUndefined();
  });
});
