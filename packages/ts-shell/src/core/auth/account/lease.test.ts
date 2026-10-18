import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { acquireRefreshLease, finishRefreshLease, markRefreshDispatched, markRefreshUnknown, readRefreshLease,
  recordRefreshProduction, reserveRefreshLogin, grantRefreshLogin, readRefreshAttempt, captureLeaseStore,
  refreshLeasesPath, refreshLineage, releaseRefreshLease, type RefreshClaim } from './lease.js';
import { accountGeneration, legacyRefreshLineage } from './lineage.js';
import { assertProfileIdentity, createProfileContext, withProfile } from '../../paths/profile/context.js';
import { renewAccountAuthIfExpiring } from '../../../provider/request/authorization.js';
import * as fileStore from '../../../session/store/sessionFileStore.js';
import { mutateLeases } from './lease/state.js';

let home: string;
beforeEach(() => {
  home = fs.mkdtempSync(path.join(os.tmpdir(), 'refresh-lease-'));
  vi.stubEnv('HOME', home); vi.stubEnv('USERPROFILE', home);
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs(); fs.rmSync(home, { recursive: true, force: true }); });

const binding = { owner: 'exact-store-slot-mirror', generation: 'complete-credential-1', storage: 'exact-storage-1' };
const lineage = { provider: 'openai' as const, credentialId: 'openai:a', binding, refreshToken: 'refresh-1' };
const claim = (owner = 'one', now?: number): RefreshClaim => acquireRefreshLease({ ...lineage, owner, now }).claim!;
const saved = { ...binding, generation: 'complete-credential-2', storage: 'exact-storage-2' };

it('grants one attempt per lineage and keeps its grant when unsent preparation is released', () => {
  const first = claim();
  const second = acquireRefreshLease({ ...lineage, owner: 'two' });
  expect(second).toMatchObject({ acquired: false, holder: 'one', claim: { grantId: first.grantId, attemptId: first.attemptId } });
  releaseRefreshLease(first);
  const next = acquireRefreshLease({ ...lineage, owner: 'two' });
  expect(next.acquired).toBe(true); expect(next.claim!.grantId).toBe(first.grantId);
  expect(next.claim!.attemptId).not.toBe(first.attemptId);
  expect(() => markRefreshDispatched(first)).toThrow(/ownership/i);
  releaseRefreshLease(first);
  expect(readRefreshLease(first.key)?.id).toBe(next.claim!.attemptId);
});

it('uses trusted issuer/client and trimmed token identity independently of the slot', () => {
  expect(refreshLineage({ ...lineage, credentialId: 'openai:copy', refreshToken: '  refresh-1  ' })).toBe(refreshLineage(lineage));
  expect(refreshLineage({ ...lineage, clientId: 'fabricated-client' })).toBe(refreshLineage(lineage));
  claim();
  expect(acquireRefreshLease({ ...lineage, credentialId: 'openai:copy', binding: { ...binding, owner: 'copied-slot' } }))
    .toMatchObject({ acquired: false, unknown: true });
});

it('refuses replay after an expired dispatch and retains uncertainty for a changed generation', () => {
  const first = claim('one', 1000); markRefreshDispatched(first, 1000);
  expect(acquireRefreshLease({ ...lineage, owner: 'two', now: 301000 })).toMatchObject({ acquired: false, unknown: true, holder: 'one' });
  expect(readRefreshLease(first.key)?.phase).toBe('unknown');
  expect(acquireRefreshLease({ ...lineage, binding: { ...binding, generation: 'fabricated' }, now: 9999999999999 }))
    .toMatchObject({ acquired: false, unknown: true });
});

it('takes over only expired unsent preparation and fences its exact immutable attempt', () => {
  const first = claim('one', 1000), second = acquireRefreshLease({ ...lineage, owner: 'two', now: 301000 });
  expect(second.acquired).toBe(true);
  expect(() => markRefreshDispatched(first)).toThrow(/ownership/i);
  markRefreshUnknown(first);
  expect(readRefreshLease(first.key)?.id).toBe(second.claim!.attemptId);
});

it.each(['dispatched', 'unknown'] as const)('retains %s through a century of idle time and unrelated cleanup', phase => {
  const first = claim('original', 1000);
  markRefreshDispatched(first, 1000); if (phase === 'unknown') markRefreshUnknown(first, 1000);
  const original = readRefreshLease(first.key);
  for (const years of [1, 10, 100]) {
    const now = 1000 + years * 365 * 24 * 60 * 60_000;
    const other = acquireRefreshLease({ ...lineage, refreshToken: `unrelated-${years}`, now });
    expect(other.acquired).toBe(true); releaseRefreshLease(other.claim!);
    expect(readRefreshLease(first.key)).toEqual(original);
  }
});

it.each([true, false])('retains consumed history and authorizes only the verified successor (rotating: %s)', rotates => {
  const first = claim(); markRefreshDispatched(first);
  const nextToken = rotates ? 'refresh-2' : lineage.refreshToken, nextKey = refreshLineage({ ...lineage, refreshToken: nextToken });
  recordRefreshProduction(first, { ...saved, lineage: nextKey });
  expect(() => finishRefreshLease(first, { ...saved, storage: 'foreign-copy' })).toThrow(/proof/i);
  finishRefreshLease(first, saved);
  expect(readRefreshLease(first.key)?.phase).toBe('rotated-persisted');
  expect(acquireRefreshLease(lineage)).toMatchObject({ acquired: false, unknown: true });
  const next = acquireRefreshLease({ ...lineage, refreshToken: nextToken, binding: saved });
  expect(next.acquired).toBe(true); expect(next.claim!.grantId).not.toBe(first.grantId);
  expect(acquireRefreshLease({ ...lineage, refreshToken: nextToken, binding: { ...saved, generation: 'fabricated' } }))
    .toMatchObject({ acquired: false, unknown: true });
  markRefreshUnknown(first); releaseRefreshLease(first); finishRefreshLease(first, saved);
  expect(readRefreshLease(nextKey)?.id).toBe(next.claim!.attemptId);
});

it('recovers saved native production after an unknown finalization without another dispatch', () => {
  const first = claim(); markRefreshDispatched(first);
  const nextKey = refreshLineage({ ...lineage, refreshToken: 'refresh-2' });
  recordRefreshProduction(first, { ...saved, lineage: nextKey }); markRefreshUnknown(first);
  expect(acquireRefreshLease({ ...lineage, refreshToken: 'refresh-2', binding: saved })).toMatchObject({ acquired: false, recovered: true });
  expect(readRefreshLease(first.key)?.phase).toBe('rotated-persisted');
  expect(acquireRefreshLease({ ...lineage, refreshToken: 'refresh-2', binding: saved }).acquired).toBe(true);
});

it('refuses unproven completion and cannot authorize a copied native response fingerprint', () => {
  const first = claim(); markRefreshDispatched(first);
  expect(() => finishRefreshLease(first, saved)).toThrow(/native/i);
  recordRefreshProduction(first, { ...saved, lineage: refreshLineage({ ...lineage, refreshToken: 'refresh-2' }) });
  expect(acquireRefreshLease({ ...lineage, refreshToken: 'refresh-2', binding: { ...saved, owner: 'another-slot' } }))
    .toMatchObject({ acquired: false, unknown: true });
});

it.each(['dispatched', 'unknown'] as const)('maps only the original opaque V1 key and retains old %s indefinitely', phase => {
  fs.mkdirSync(path.dirname(refreshLeasesPath()), { recursive: true });
  const value = { owner: 'original', phase, generation: 'old-short-digest', expiresAt: 2000, updatedAt: 1000 };
  fs.writeFileSync(refreshLeasesPath(), JSON.stringify({ version: 1, leases: { [legacyRefreshLineage(lineage)]: value } }));
  expect(acquireRefreshLease({ ...lineage, now: 9999999999999 })).toMatchObject({ acquired: false, unknown: true });
  const state = JSON.parse(fs.readFileSync(refreshLeasesPath(), 'utf8'));
  expect(state.version).toBe(2); expect(Object.keys(state.legacy)).toHaveLength(0);
  expect(Object.values(state.leases[refreshLineage(lineage)].attempts)[0]).toMatchObject({ phase, generation: 'old-short-digest' });
});

it.each(['rename', 'delete', 'same-digest'] as const)('keeps unidentified V1 evidence store-wide after %s', scenario => {
  fs.mkdirSync(path.dirname(refreshLeasesPath()), { recursive: true });
  const old = { ...lineage, credentialId: 'openai:removed' };
  fs.writeFileSync(refreshLeasesPath(), JSON.stringify({ version: 1, leases: { [legacyRefreshLineage(old)]: {
    owner: 'original', phase: 'unknown', generation: scenario === 'same-digest' ? binding.generation : 'old',
    expiresAt: 2000, updatedAt: 1000,
  } } }));
  expect(acquireRefreshLease({ ...lineage, now: 9999999999999 })).toMatchObject({ acquired: false, unknown: true });
  expect(Object.keys(JSON.parse(fs.readFileSync(refreshLeasesPath(), 'utf8')).legacy)).toHaveLength(1);
});

it('reports corrupt V1/V2 files instead of treating them as empty', () => {
  fs.mkdirSync(path.dirname(refreshLeasesPath()), { recursive: true });
  for (const value of [{ version: 1, leases: { x: { owner: 1 } } }, { version: 2, leases: { x: { attempts: { bad: {} } } }, legacy: {} }]) {
    fs.writeFileSync(refreshLeasesPath(), JSON.stringify(value));
    expect(() => acquireRefreshLease(lineage)).toThrow(/invalid entry/i);
  }
});


it('expires only unsent legacy preparation without forgetting older dispatch uncertainty', () => {
  fs.mkdirSync(path.dirname(refreshLeasesPath()), { recursive: true });
  fs.writeFileSync(refreshLeasesPath(), JSON.stringify({ version: 1, leases: { [legacyRefreshLineage(lineage)]: {
    owner: 'old', phase: 'prepared', generation: 'old', expiresAt: 1, updatedAt: 1,
  } } }));
  expect(acquireRefreshLease({ ...lineage, now: 9999999999999 }).acquired).toBe(true);
});


it('does not let exact native saved storage bypass newly observed unmatched legacy uncertainty', () => {
  const first = claim(); markRefreshDispatched(first);
  const nextKey = refreshLineage({ ...lineage, refreshToken: 'refresh-2' }); recordRefreshProduction(first, { ...saved, lineage: nextKey });
  const state = JSON.parse(fs.readFileSync(refreshLeasesPath(), 'utf8'));
  state.legacy.opaque = { owner: 'older', phase: 'unknown', generation: 'older', updatedAt: 1, expiresAt: 1 };
  fs.writeFileSync(refreshLeasesPath(), JSON.stringify(state));
  expect(acquireRefreshLease({ ...lineage, refreshToken: 'refresh-2', binding: saved })).toMatchObject({ acquired: false, unknown: true });
  expect(readRefreshLease(first.key)?.phase).toBe('dispatched');
  expect(() => finishRefreshLease(first, saved)).toThrow(/history/i);
});

it('does not overwrite an existing login enrollment with a different native refresh successor', () => {
  const first = claim(); markRefreshDispatched(first);
  const next = { ...lineage, refreshToken: 'refresh-2' };
  expect(reserveRefreshLogin({ ...next, file: refreshLeasesPath(), owner: 'another-pending-login', generation: saved.generation, native: false })).toBeDefined();
  recordRefreshProduction(first, { ...saved, lineage: refreshLineage(next) });
  expect(() => finishRefreshLease(first, saved)).toThrow(/history/i);
  expect(() => acquireRefreshLease({ ...next, binding: saved })).toThrow(/history/i);
  const row = JSON.parse(fs.readFileSync(refreshLeasesPath(), 'utf8')).leases[refreshLineage(next)];
  expect(row.enrollment).toMatchObject({ owner: 'another-pending-login', native: false }); expect(row.grant).toBeUndefined();
});

it.each(['default', 'named'])('rejects a copied replacement %s profile before native HTTP, reads, cleanup and login enrollment', async name => {
  const profile = createProfileContext({ name, homeDir: home, env: {} });
  const account = { type: 'openai-chatgpt-account' as const, accessToken: 'old', refreshToken: lineage.refreshToken, expiresAt: 1 };
  const first = withProfile(profile, () => acquireRefreshLease({ ...lineage,
    binding: { ...binding, generation: accountGeneration(account) } }).claim!);
  const login = withProfile(profile, () => reserveRefreshLogin({ provider: 'openai', refreshToken: 'login-refresh',
    owner: binding.owner, generation: binding.generation, native: true })!);
  const bytes = fs.readFileSync(first.file);
  fs.renameSync(profile.root, `${profile.root}.moved`); fs.mkdirSync(profile.root); fs.writeFileSync(first.file, bytes);
  expect(() => assertProfileIdentity(profile)).toThrow(/identity/);
  const replacement = createProfileContext({ name, homeDir: home, env: {} });
  await withProfile(replacement, async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({ access_token: 'fresh', refresh_token: 'next', expires_in: 3600 }),
      { headers: { 'content-type': 'application/json' } })) as unknown as typeof fetch;
    const result = await renewAccountAuthIfExpiring({ provider: 'openai', credential: { accountAuth: account }, fetchImpl,
      renewalLease: { shareKey: `replaced-${name}`, acquire: () => ({ acquired: true }) }, onDispatch: () => markRefreshDispatched(first) });
    expect(fetchImpl).not.toHaveBeenCalled(); expect(result.renewed).toBe(false);
    expect(result.accountAuth).toEqual(account); expect(result.failure).toBeDefined(); expect(result.production).toBeUndefined();
    for (const operation of [() => readRefreshAttempt(first), () => readRefreshLease(first.key, first),
      () => recordRefreshProduction(first, { ...saved, lineage: first.key }), () => finishRefreshLease(first, saved),
      () => markRefreshUnknown(first), () => releaseRefreshLease(first), () => grantRefreshLogin(login, binding),
      () => reserveRefreshLogin({ ...lineage, store: first, owner: binding.owner, generation: binding.generation, native: true })]) {
      expect(operation).toThrow(/identity/);
    }
    expect(fs.readFileSync(first.file)).toEqual(bytes);
  });
});

it('rechecks captured profile identity inside the acquired ledger lock', () => {
  const profile = createProfileContext({ name: 'locked', homeDir: home, env: {} });
  const first = withProfile(profile, () => claim()), bytes = fs.readFileSync(first.file), lock = fileStore.withFileLock;
  vi.spyOn(fileStore, 'withFileLock').mockImplementation((name, run, options) => lock(name, () => {
    fs.renameSync(profile.root, `${profile.root}.moved`); fs.mkdirSync(profile.root); fs.writeFileSync(first.file, bytes);
    return run();
  }, options));
  expect(() => markRefreshDispatched(first)).toThrow(/identity/);
  expect(fs.readFileSync(first.file)).toEqual(bytes);
});

it('rechecks captured profile identity after mutation before publishing ledger bytes', () => {
  const profile = createProfileContext({ name: 'publishing', homeDir: home, env: {} });
  const first = withProfile(profile, () => claim()), bytes = fs.readFileSync(first.file);
  expect(() => mutateLeases(first, state => {
    delete state.leases[first.key];
    fs.renameSync(profile.root, `${profile.root}.moved`); fs.mkdirSync(profile.root); fs.writeFileSync(first.file, bytes);
  })).toThrow(/identity/);
  expect(fs.readFileSync(first.file)).toEqual(bytes);
});

it('keeps original refresh and login scopes valid under a later different current profile', () => {
  const a = createProfileContext({ name: 'a', homeDir: home, env: {} });
  const b = createProfileContext({ name: 'b', homeDir: home, env: {} });
  const first = withProfile(a, () => claim());
  const login = withProfile(a, () => reserveRefreshLogin({ provider: 'openai', refreshToken: 'login-refresh',
    owner: binding.owner, generation: binding.generation, native: true })!);
  withProfile(b, () => {
    markRefreshDispatched(first);
    recordRefreshProduction(first, { ...saved, lineage: refreshLineage({ ...lineage, refreshToken: 'refresh-2' }) });
    finishRefreshLease(first, saved);
    markRefreshUnknown(first); releaseRefreshLease(first);
    expect(readRefreshAttempt(first)?.phase).toBe('rotated-persisted');
    expect(readRefreshLease(first.key, first)?.phase).toBe('rotated-persisted');
    expect(grantRefreshLogin(login, binding)).toBe(true);
    expect(fs.existsSync(refreshLeasesPath())).toBe(false);
  });
  expect(first.file).toBe(path.join(a.root, 'refresh-leases.json'));
  expect(first.lock).toBe(`${first.file}.lock`);
  expect(JSON.stringify(JSON.parse(fs.readFileSync(first.file, 'utf8')))).not.toContain('rootIdentity');
});

it('binds a relative legacy file to its absolute path without borrowing a later profile', () => {
  const relative = path.relative(process.cwd(), path.join(home, 'legacy.json'));
  const scope = captureLeaseStore(relative), first = acquireRefreshLease({ ...lineage, store: scope }).claim!;
  const later = createProfileContext({ name: 'later', homeDir: home, env: {} });
  withProfile(later, () => {
    markRefreshDispatched(first);
    expect(readRefreshAttempt(first)?.phase).toBe('dispatched');
    expect(fs.existsSync(refreshLeasesPath())).toBe(false);
  });
  expect(scope.file).toBe(path.join(home, 'legacy.json')); expect(scope.lock).toBe(`${scope.file}.lock`); expect(scope.profile).toBeUndefined();
});
