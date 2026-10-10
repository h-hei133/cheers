import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { createServer } from 'node:net';
import { ServiceStore } from '../service/store.js';
import { ServiceDispatcher } from '../service/dispatch.js';
import type { ServiceConfig } from '../service/config.js';
import type { ServiceRequest, Snapshot } from '../contract/model.js';
import { hashText, object } from '../contract/value.js';

export const bound = { sessionId: 'session-fixture', sessionCreatedAt: '2026-10-09T00:00:00.000Z', projectId: 'a'.repeat(64) };
export const emptySnapshot: Snapshot = { version: 1, consistency: 'partial', cutover: 0, entries: [], warnings: ['partial source'] };
export function fixture() {
  const parent = path.resolve('.tmp'); fs.mkdirSync(parent, { recursive: true }); const root = fs.mkdtempSync(path.join(parent, 'collaboration-'));
  const tokens = { alice: 'A'.repeat(40), bob: 'B'.repeat(40), carol: 'C'.repeat(40) };
  const config: ServiceConfig = { version: 1, host: '127.0.0.1', port: 24001, stateFile: path.join(root, 'state.json'),
    accounts: Object.entries(tokens).map(([principal, token]) => ({ principal, tokenHash: hashText(token), enabled: true })) };
  const store = new ServiceStore(config.stateFile); let now = Date.now(); const dispatcher = new ServiceDispatcher(store, config, () => now);
  const request = (principal: string, operation: string, input: Partial<ServiceRequest> = {}) => dispatcher.execute(principal,
    { version: 1, principal, operation, ...input, ...(input.requestId ? {} : { requestId: randomUUID() }) });
  const begin = (acl: unknown = { bob: ['observe', 'ask', 'control'] }) => object(request('alice', 'begin', { data: { binding: bound, snapshot: emptySnapshot, acl } }).result);
  return { root, config, tokens, store, dispatcher, request, begin, advance: (milliseconds: number) => { now += milliseconds; }, now: () => now,
    cleanup: () => fs.rmSync(root, { recursive: true, force: true }) };
}
export async function freePort(): Promise<number> {
  const server = createServer(); await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const address = server.address(); if (!address || typeof address === 'string') throw new Error('No fixture port');
  await new Promise<void>(resolve => server.close(() => resolve())); return address.port;
}
