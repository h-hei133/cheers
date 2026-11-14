import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, expect, it, vi } from 'vitest';
import { createAgentSession } from './agentSession.js';
import { SessionManager } from '../session/SessionManager.js';
import type { AgentMessage } from '../core/agent/state.js';
import type { ProviderMessage } from '../model-adapters/message.js';

const roots: string[] = [];
afterEach(() => { vi.unstubAllEnvs(); for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true }); });

function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'cheers-sdk-messages-')); roots.push(root);
  const home = path.join(root, 'home'); const workspace = path.join(root, 'work'); fs.mkdirSync(home); fs.mkdirSync(workspace);
  vi.stubEnv('HOME', home); vi.stubEnv('USERPROFILE', home); vi.stubEnv('CHEERS_TEST_ROOT', home); vi.stubEnv('CHEERS_PROVIDER_MODE', 'synthetic');
  return workspace;
}

it('persists SDK custom messages and calls the captured converter on a real session turn and resume', async () => {
  const workspace = fixture();
  const message = { customType: 'artifact', content: 'Saved result', data: { path: 'result.json' }, display: false };
  const convertToLlm = vi.fn(async (messages: readonly any[]) => messages.flatMap(item => item.role === 'custom'
    ? [{ role: 'user', content: `Saved artifact ${item.data.path}` }] : [item]));
  const created = await createAgentSession({ cwd: workspace, noTools: 'all', convertToLlm } as unknown as Parameters<typeof createAgentSession>[0]);
  const native = created.session as typeof created.session & { appendCustomMessage: (payload: typeof message) => void };
  let id = '';
  try {
    expect(typeof native.appendCustomMessage).toBe('function');
    native.appendCustomMessage(message);
    id = native.sessionId;
    await native.prompt('Continue.');
    expect(convertToLlm.mock.calls.some(([messages]) => messages.some(item => item.role === 'custom' && item.data.path === 'result.json'))).toBe(true);
    expect(new SessionManager().getSession(id)!.turns[0]).toMatchObject({ role: 'custom', ...message });
  } finally { await native.dispose(); }
  const resumed = await createAgentSession({ cwd: workspace, sessionId: id, noTools: 'all', convertToLlm } as unknown as Parameters<typeof createAgentSession>[0]);
  try {
    convertToLlm.mockClear();
    await resumed.session.prompt('Continue after resume.');
    expect(convertToLlm.mock.calls.some(([messages]) => messages.some(item => item.role === 'custom' && item.data.path === 'result.json'))).toBe(true);
  } finally { await resumed.session.dispose(); }
});

it('cancels a pending SDK converter, rejects a concurrent append, and reuses the session afterward', async () => {
  const workspace = fixture();
  let entered!: () => void;
  const started = new Promise<void>(resolve => { entered = resolve; });
  let reject!: (error: Error) => void;
  const pending = new Promise<readonly ProviderMessage[]>((_resolve, fail) => { reject = fail; });
  let count = 0;
  const convertToLlm = async (messages: readonly AgentMessage[]) => {
    if (++count === 1) { entered(); return pending; }
    return messages.flatMap(message => message.role === 'custom' ? [{ role: 'user' as const, content: message.content }] : [message]);
  };
  const options = { cwd: workspace, noTools: 'all' as const, convertToLlm };
  const created = await createAgentSession(options);
  options.convertToLlm = async () => { throw new Error('replacement converter must not run'); };
  const native = created.session;
  try {
    const run = native.prompt('Wait for conversion.').catch(error => error);
    await started;
    expect(() => native.appendCustomMessage({ customType: 'artifact', content: 'Late.', display: false })).toThrow('active turn');
    await native.abort();
    await run;
    reject(new Error('late conversion failure'));
    await new Promise(resolve => setImmediate(resolve));
    expect(count).toBe(1);
    native.appendCustomMessage({ customType: 'artifact', content: 'Recovered context.', display: false });
    await native.prompt('Continue after cancellation.');
    expect(count).toBe(2);
    expect(native.getState().turns.some(message => message.role === 'custom' && message.content === 'Recovered context.')).toBe(true);
  } finally { await native.dispose(); }
  expect(() => native.appendCustomMessage({ customType: 'artifact', content: 'Disposed.', display: false })).toThrow('disposed');
});

it('does not execute SDK payload accessors before custom message admission', async () => {
  const native = (await createAgentSession({ cwd: fixture(), noTools: 'all' })).session;
  try {
    const getter = vi.fn(() => 'unsafe');
    const payload = Object.defineProperty({ customType: 'artifact', display: false }, 'content', { enumerable: true, get: getter });
    expect(() => native.appendCustomMessage(payload as Parameters<typeof native.appendCustomMessage>[0])).toThrow();
    expect(getter).not.toHaveBeenCalled();
    expect(native.getState().turns).toEqual([]);
  } finally { await native.dispose(); }
});

it('refuses a custom append until prompt settlement has finished', async () => {
  const native = (await createAgentSession({ cwd: fixture(), noTools: 'all' })).session;
  const deps = (native.sessionRuntime as unknown as { deps: { promptSettled?: (...args: any[]) => Promise<void> } }).deps;
  const original = deps.promptSettled;
  let entered!: () => void; const started = new Promise<void>(resolve => { entered = resolve; });
  let release!: () => void; const pending = new Promise<void>(resolve => { release = resolve; });
  deps.promptSettled = async (...args) => { await original?.(...args); entered(); await pending; };
  const run = native.prompt('Finish, then settle.');
  try {
    await started;
    expect(() => native.appendCustomMessage({ customType: 'artifact', content: 'Too early.', display: false })).toThrow('active turn');
    release(); await run;
    native.appendCustomMessage({ customType: 'artifact', content: 'Settled.', display: false });
    expect(native.getState().turns.some(message => message.role === 'custom' && message.content === 'Settled.')).toBe(true);
  } finally { release(); await run.catch(() => {}); deps.promptSettled = original; await native.dispose(); }
});
