import fs from 'node:fs';
import path from 'node:path';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { HookTrustStore, hookFingerprint } from '../trust.js';
import * as files from '../../../session/store/sessionFileStore.js';

let scratch: string, file: string, source: string;
beforeEach(() => {
  fs.mkdirSync('/tmp/cheers-test', { recursive: true }); scratch = fs.mkdtempSync('/tmp/cheers-test/hook-withdrawal-');
  file = path.join(scratch, 'hook-trust.json'); source = path.join(scratch, 'project/.agents/hooks.json');
});
afterEach(() => { vi.restoreAllMocks(); fs.rmSync(scratch, { recursive: true, force: true }); });
const fingerprint = () => hookFingerprint({ event: 'SessionStart', command: 'public-fixture', sourcePath: source });

it('rotates the source token even after a previous withdrawal removed every known grant', () => {
  const store = new HookTrustStore(file); expect(store.sourceRevision(source)).toBe('');
  expect(store.forgetSource(source).status).toBe('saved'); const first = store.sourceRevision(source);
  expect(first).toBeTruthy(); expect(store.forgetSource(source).status).toBe('saved');
  expect(store.sourceRevision(source)).not.toBe(first);
});

it('retires a session fallback held in another open store', () => {
  const store = new HookTrustStore(file), token = store.sourceRevision(source)!;
  const write = vi.spyOn(files, 'writeTextFileAtomic').mockImplementation(() => { throw new Error('PRIVATE_IO_FAILURE'); });
  expect(store.recordTrust(fingerprint(), 'public-fixture', source, token)).toBe(true);
  expect(store.isTrusted(fingerprint(), source)).toBe(true); expect(store.isTrusted(fingerprint())).toBe(true); write.mockRestore();
  expect(new HookTrustStore(file).forgetSource(source).status).toBe('saved');
  expect(store.isTrusted(fingerprint(), source)).toBe(false);
  expect(store.isTrusted(fingerprint())).toBe(false);
});

it('does not grant a memory fallback over unreadable state', () => {
  const store = new HookTrustStore(file);
  const write = vi.spyOn(files, 'writeTextFileAtomic').mockImplementation(() => { throw new Error('PRIVATE_IO_FAILURE'); });
  expect(store.recordTrust(fingerprint(), '', source, '')).toBe(true); write.mockRestore();
  fs.writeFileSync(file, '{PRIVATE_BROKEN_STATE');
  expect(store.sourceRevision(source)).toBeUndefined(); expect(store.isTrusted(fingerprint(), source)).toBe(false);
  expect(store.forgetSource(source).status).toBe('unverified');
  expect(fs.readFileSync(file, 'utf8')).toBe('{PRIVATE_BROKEN_STATE');
});

it('reports a suppressed publication as unverified without losing the durable grant', () => {
  const store = new HookTrustStore(file); store.recordTrust(fingerprint(), '', source, ''); const raw = fs.readFileSync(file);
  vi.spyOn(files, 'writeTextFileAtomic').mockImplementation(() => {});
  expect(store.forgetSource(source)).toEqual({ status: 'unverified', removed: [] });
  expect(store.isTrusted(fingerprint(), source)).toBe(true); expect(fs.readFileSync(file)).toEqual(raw);
});

it('does not invent a session grant when lock acquisition never admitted the answer', () => {
  vi.spyOn(files, 'withFileLock').mockImplementation(() => { throw new Error('PRIVATE_LOCK_FAILURE'); });
  const store = new HookTrustStore(file);
  expect(store.recordTrust(fingerprint(), '', source, '')).toBe(false);
  expect(store.isTrusted(fingerprint(), source)).toBe(false);
});

it('does not shadow an actually published grant after lock cleanup fails', () => {
  const store = new HookTrustStore(file), lock = files.withFileLock;
  const failure = vi.spyOn(files, 'withFileLock').mockImplementation((name, action, options) => {
    lock(name, action, options); throw new Error('PRIVATE_RELEASE_FAILURE');
  });
  expect(store.recordTrust(fingerprint(), 'public', source, '')).toBe(true); failure.mockRestore();
  expect(new HookTrustStore(file).forgetTrust(fingerprint())).toBe(true);
  expect(store.isTrusted(fingerprint(), source)).toBe(false);
});

it('does not recreate a published grant withdrawn by another store before cleanup failure is reported', () => {
  const store = new HookTrustStore(file), lock = files.withFileLock;
  const failure = vi.spyOn(files, 'withFileLock').mockImplementation((name, action, options) => {
    lock(name, action, options); failure.mockRestore();
    expect(new HookTrustStore(file).forgetTrust(fingerprint())).toBe(true);
    throw new Error('PRIVATE_RELEASE_FAILURE');
  });
  expect(store.recordTrust(fingerprint(), 'public', source, '')).toBe(false);
  expect(store.isTrusted(fingerprint(), source)).toBe(false);
});

it.each(['empty-token', 'relative-source', 'relative-attribution'] as const)('fails closed over malformed %s metadata', kind => {
  const state = { version: 2, approved: { [fingerprint()]: 'old' }, sources: {}, withdrawals: {} } as {
    version: number; approved: Record<string, string>; sources: Record<string, unknown>; withdrawals: Record<string, string> };
  if (kind === 'empty-token') state.withdrawals[source] = '';
  else if (kind === 'relative-source') state.withdrawals['project/.agents/hooks.json'] = 'withdrawn';
  else state.sources[fingerprint()] = { sourcePath: 'project/.agents/hooks.json', revision: '' };
  const raw = JSON.stringify(state); fs.writeFileSync(file, raw); const store = new HookTrustStore(file);
  expect(store.isTrusted(fingerprint(), source)).toBe(false); expect(store.forgetSource(source).status).toBe('unverified');
  expect(fs.readFileSync(file, 'utf8')).toBe(raw);
});

it('rechecks the captured generation inside the write lock and preserves another source grant', () => {
  const store = new HookTrustStore(file), token = store.sourceRevision(source)!;
  const other = path.join(scratch, 'other/.agents/hooks.json'); store.recordTrust('other', 'other', other, '');
  const lock = files.withFileLock;
  vi.spyOn(files, 'withFileLock').mockImplementation((name, action, options) => lock(name, () => {
    const state = JSON.parse(fs.readFileSync(file, 'utf8')); state.withdrawals[source] = 'new-withdrawal';
    fs.writeFileSync(file, JSON.stringify(state)); return action();
  }, options));
  expect(store.recordTrust(fingerprint(), 'stale', source, token)).toBe(false);
  expect(store.isTrusted(fingerprint(), source)).toBe(false); expect(store.isTrusted('other', other)).toBe(true);
});

it('reads v1 hashes without inferring source from their author-controlled description', () => {
  fs.writeFileSync(file, JSON.stringify({ version: 1, approved: { [fingerprint()]: 'SessionStart:./check.sh', user: 'same', other: 'same' } }));
  const store = new HookTrustStore(file); expect(store.isTrusted(fingerprint(), source)).toBe(true);
  expect(store.forgetSource(source).status).toBe('saved');
  expect(store.isTrusted(fingerprint(), source)).toBe(false); expect(store.isTrusted('user')).toBe(true); expect(store.isTrusted('other')).toBe(true);
  const revision = store.sourceRevision(source)!; expect(store.recordTrust(fingerprint(), '', source, revision)).toBe(true);
  expect(store.isTrusted(fingerprint(), source)).toBe(true);
});

it('preserves attributed grants for a prefix-neighbour source during historical withdrawal', () => {
  const store = new HookTrustStore(file), other = source + '-other';
  store.recordTrust(fingerprint(), 'old', source, ''); store.recordTrust('neighbour', 'other', other, '');
  expect(store.forgetSource(source).removed.map(entry => entry.fingerprint)).toEqual([fingerprint()]);
  expect(store.isTrusted('neighbour', other)).toBe(true);
  expect(JSON.parse(fs.readFileSync(file, 'utf8')).version).toBe(2);
});

it.each(['unsupported', 'malformed', 'dangling'] as const)('refuses mutation over %s storage without replacing it', kind => {
  if (kind === 'dangling') fs.symlinkSync(path.join(scratch, 'absent'), file);
  else fs.writeFileSync(file, JSON.stringify(kind === 'unsupported' ? { version: 3, approved: {} }
    : { version: 2, approved: {}, sources: { invalid: null }, withdrawals: {} }));
  const before = fs.lstatSync(file), store = new HookTrustStore(file);
  expect(store.recordTrust(fingerprint(), '', source, '')).toBe(false);
  expect(store.forgetSource(source).status).toBe('unverified');
  expect(store.sourceRevision(source)).toBeUndefined();
  expect(fs.lstatSync(file).ino).toBe(before.ino);
});
