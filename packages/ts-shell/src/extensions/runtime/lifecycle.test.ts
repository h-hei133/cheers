import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { catalogContributions } from '../../core/catalog/contributions.js';
import type { PackageRecord, VersionRecord } from '../model.js';
import { digest } from '../registry/validation.js';
import { storageIdentity, versionPath } from '../store/state.js';
import { executeInProcessScript } from './inProcessLoader.js';
import { registerPackage } from './registration.js';

let root: string;
let unpublish: (() => void) | undefined;
beforeEach(() => {
  const scratch = path.join(os.tmpdir(), 'cheers-test');
  fs.mkdirSync(scratch, { recursive: true });
  root = fs.mkdtempSync(path.join(scratch, 'extension-lifecycle-'));
});
afterEach(() => {
  unpublish?.(); unpublish = undefined;
  fs.rmSync(root, { recursive: true, force: true });
});

async function workerEvent(name: string, body: string, payload: unknown) {
  const file = path.join(root, 'fixture.ts');
  fs.writeFileSync(file, `export default api => { ${body} };`);
  const sendMessage = vi.fn();
  const result = await executeInProcessScript({ root, scriptFile: file,
    record: { manifest: { name: 'lifecycle', version: '1' }, source: 'fixture', digest: 'a'.repeat(64) } as VersionRecord,
    argv: [], denyRules: () => [], context: { workspaceRoot: root, taskId: 'lifecycle' }, host: { sendMessage },
    invoke: { kind: 'event', event: name, payload },
  });
  return { result, sendMessage };
}

it.each(['session_before_switch', 'session_before_fork'])(
  'preserves worker cancellation for %s without invoking later handlers', async name => {
    const { result, sendMessage } = await workerEvent(name, `
      api.on('${name}', async event => {
        if (!Object.isFrozen(event) || event.sessionId !== 'current') throw new Error('Changed event');
        return { cancel: true };
      });
      api.on('${name}', async () => { await api.sendMessage('later handler'); return { cancel: false }; });
    `, { type: name, sessionId: 'current', workspaceRoot: root });
    expect(result.success).toBe(true);
    expect(JSON.parse(String(result.metadata?.eventOutput))).toEqual({ cancel: true });
    expect(sendMessage).not.toHaveBeenCalled();
  },
);

it('refuses a non-inert worker cancellation without reading an accessor', async () => {
  const name = 'session_before_switch';
  const { result, sendMessage } = await workerEvent(name, `
    api.on('${name}', () => ({ get cancel() { void api.sendMessage('accessor'); return false; } }));
    api.on('${name}', async () => { await api.sendMessage('later handler'); });
  `, { type: name, sessionId: 'current', workspaceRoot: root });
  expect(result.success).toBe(false);
  expect(sendMessage).not.toHaveBeenCalled();
});

it('retains immutable worker notifications through failures and ignored returns', async () => {
  const name = 'agent_start';
  const { result, sendMessage } = await workerEvent(name, `
    api.on('${name}', () => { throw new Error('observer failed'); });
    api.on('${name}', () => ({ type: 'replaced', source: { id: 'wrong' } }));
    api.on('${name}', async event => {
      if (!Object.isFrozen(event) || !Object.isFrozen(event.source)) throw new Error('Mutable event');
      await api.sendMessage(event.type + ':' + event.source.id);
    });
  `, { type: name, source: { id: 'original' } });
  expect(result.success).toBe(true);
  expect(result.metadata?.eventOutput).toBe('');
  expect(sendMessage).toHaveBeenCalledExactlyOnceWith('agent_start:original');
});

it('preserves cancellation and notification semantics across installed scripts', async () => {
  const registry = path.join(root, 'registry.json');
  const name = 'lifecycle';
  const active = { digest: digest(name), manifest: { name, scripts: ['one', 'two', 'three'].map(script => ({ name: script, path: `${script}.ts` })),
    commands: [], tools: [], skills: [] } } as unknown as VersionRecord;
  const owned = versionPath(active, registry);
  fs.mkdirSync(owned, { recursive: true });
  Object.assign(active, { files: {}, directories: [], storage: storageIdentity(owned) });
  const record = { name, active, activation: { [root]: { enabled: true, grants: ['script:one', 'script:two', 'script:three'] } } } as unknown as PackageRecord;
  const observers = vi.fn(async (_record: PackageRecord, script: string, event: string, _payload: unknown) => {
    if (event === 'session_before_fork') return { cancel: script === 'one' };
    if (script === 'one') throw new Error('observer failed');
    return { type: 'replaced' };
  });
  unpublish = registerPackage({ root, sessionId: name, file: registry, current: () => {}, withheld: () => {},
    run: async () => '', tool: () => { throw new Error('No tool'); }, event: observers }, record);
  const publish = catalogContributions(root, name)[0]!.onEvent!;
  const transition = Object.freeze({ type: 'session_before_fork', sessionId: name });
  expect(await publish(transition.type, transition)).toEqual({ cancel: true });
  expect(observers).toHaveBeenCalledExactlyOnceWith(record, 'one', transition.type, transition, undefined, expect.any(AbortSignal));
  observers.mockClear();
  const notice = Object.freeze({ type: 'session_start', sessionId: name });
  expect(await publish(notice.type, notice)).toBeUndefined();
  expect(observers.mock.calls.map(([, script, event, payload]) => [script, event, payload])).toEqual([
    ['one', notice.type, notice], ['two', notice.type, notice], ['three', notice.type, notice],
  ]);
});
