import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, expect, it } from 'vitest';
import { createProfileContext, withProfile, type ProfileContext } from '../../core/paths/profile/context.js';
import { safeReceipt } from '../actionCacheEntry.test.js';
import { createBrowserReceiptCacheManifest, loadBrowserReceiptCacheManifestFromEnv } from './manifest.js';
import { createBrowserReceiptCacheStore } from './store.js';

let home: string;
let a: ProfileContext;
let b: ProfileContext;
beforeEach(() => {
  home = fs.mkdtempSync(path.join(os.tmpdir(), 'profile-receipts-'));
  a = createProfileContext({ name: 'a', homeDir: home, env: {} });
  b = createProfileContext({ name: 'b', homeDir: home, env: {} });
});
afterEach(() => fs.rmSync(home, { recursive: true, force: true }));
const store = (profile: ProfileContext) => withProfile(profile, () => createBrowserReceiptCacheStore({
  manifest: createBrowserReceiptCacheManifest({ cacheRoot: path.join(profile.root, 'browser-cache'),
    allowedOperations: ['read', 'write', 'invalidate', 'delete'] }),
}));

it('rejects an external mutable cache even when explicitly configured', () => {
  const shared = path.join(home, 'shared-cache');
  expect(() => withProfile(a, () => createBrowserReceiptCacheStore({
    manifest: createBrowserReceiptCacheManifest({ cacheRoot: shared }),
  }))).toThrow('inside the selected profile');
  expect(fs.existsSync(shared)).toBe(false);
});

it('keeps equal receipt IDs independent and late mutations in the captured cache', () => {
  const first = store(a); const second = store(b); const receipt = safeReceipt();
  expect(withProfile(b, () => first.writeReceipt(receipt)).written).toBe(true);
  expect(second.get(receipt.receiptId).status).toBe('missing');
  expect(second.writeReceipt(receipt).written).toBe(true);
  expect(first.delete(receipt.receiptId, 'synthetic delete').changed).toBe(true);
  expect(first.get(receipt.receiptId).status).toBe('missing');
  expect(second.get(receipt.receiptId).status).toBe('found');
});

it.each(['root', 'record'] as const)('fences a captured cache after replacing its %s', replacement => {
  const first = store(a); const second = store(b); const receipt = safeReceipt();
  expect(first.writeReceipt(receipt).written).toBe(true);
  expect(second.writeReceipt(receipt).written).toBe(true);
  const file = 'browser-receipt-cache.jsonl'; const other = path.join(second.manifest.cacheRoot, file);
  const before = fs.readFileSync(other, 'utf8');
  if (replacement === 'root') {
    fs.renameSync(a.root, `${a.root}-retired`); fs.symlinkSync(b.root, a.root, 'dir');
  } else {
    const target = path.join(first.manifest.cacheRoot, file); fs.unlinkSync(target); fs.symlinkSync(other, target);
  }
  expect(first.writeReceipt(receipt).written).toBe(false);
  expect(first.delete(receipt.receiptId, 'late delete').changed).toBe(false);
  expect(() => first.list()).toThrow(); expect(() => first.compact()).toThrow();
  expect(fs.readFileSync(other, 'utf8')).toBe(before);
});

it('uses frozen launch overrides instead of a later environment cache root', () => {
  const selected = createProfileContext({ name: 'a', homeDir: home,
    env: { CHEERS_BROWSER_RECEIPT_CACHE_ROOT: path.join(a.root, 'selected-cache') } });
  const manifest = withProfile(selected, () => loadBrowserReceiptCacheManifestFromEnv({
    env: { CHEERS_BROWSER_RECEIPT_CACHE_ROOT: path.join(b.root, 'late-cache') },
  }));
  expect(manifest.ok && manifest.manifest.cacheRoot).toBe(path.join(a.root, 'selected-cache'));
});
