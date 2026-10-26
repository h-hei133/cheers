import fs from 'node:fs';
import path from 'node:path';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createProjectMemoryLocalStore } from '../projectMemoryLocalStore.js';
import type { ProjectMemoryRecord } from '../projectMemoryStoreContract.js';
import * as snapshots from '../../runtime/execution/snapshot.js';
import { createProfileContext, withProfile } from '../../core/paths/profile/context.js';

let root: string;
beforeEach(() => { fs.mkdirSync('/tmp/cheers-test', { recursive: true }); root = fs.mkdtempSync('/tmp/cheers-test/memory-snapshot-'); });
afterEach(() => { vi.restoreAllMocks(); fs.rmSync(root, { recursive: true, force: true }); });
const record: ProjectMemoryRecord = { id: 'one', version: 1, createdAt: '2026-10-26', candidateId: 'one',
  candidateKind: 'project-fact', retentionClass: 'project-scoped-candidate', approvedAt: '2026-10-26', approvedBySourceCommand: '/memory',
  memoryText: 'Checked project fact.', evidence: ['snapshot:fixture'], source: 'system-derived', routeReferences: [], safety: 'safe', redactions: [] };
function fixture() {
  const store = createProjectMemoryLocalStore({ ref: { mode: 'test-only', root } });
  const file = store.ref.recordsFile!; fs.writeFileSync(file, JSON.stringify(record) + '\nBROKEN\n');
  return { store, file };
}

it('keeps one detached read-only snapshot with original diagnostics while the live owner sees edits', async () => {
  const { store, file } = fixture(); const read = vi.spyOn(snapshots, 'readBinarySnapshot');
  const reader = await store.snapshot!({ maxBytes: 512 * 1024 });
  expect(read).toHaveBeenCalledTimes(1);
  const health = await reader.health(); expect(health).toMatchObject({ readable: true, writable: false, recordCount: 1 });
  expect(health.diagnostics).toEqual(['Memory store line 2 is invalid; changes are blocked.']);
  const listed = await reader.list(); expect(listed.records).toEqual([record]);
  (listed.records[0]!.evidence as string[]).push('changed'); (listed.diagnostics as string[]).push('changed');
  const found = (await reader.get('one'))!; (found as { memoryText: string }).memoryText = 'changed';
  (health.diagnostics as string[]).push('changed');
  expect((await reader.list()).records).toEqual([record]); expect((await reader.health()).diagnostics).toHaveLength(1);
  fs.writeFileSync(file, JSON.stringify({ ...record, memoryText: 'New project fact.' }) + '\n');
  expect((await reader.get('one'))!.memoryText).toBe(record.memoryText); expect(read).toHaveBeenCalledTimes(1);
  expect((await store.get('one'))!.memoryText).toBe('New project fact.'); expect((await store.health()).ok).toBe(true);
  const next = await store.snapshot!({ maxBytes: 512 * 1024 }); expect((await next.get('one'))!.memoryText).toBe('New project fact.');
  expect(read).toHaveBeenCalledTimes(2); expect(Object.keys(reader).sort()).toEqual(['get', 'health', 'list', 'ref']);
});

it('preserves lifecycle fold identity and rechecks cancellation on cached lookups', async () => {
  const { store, file } = fixture();
  const invalidate = { entryKind: 'project-memory-lifecycle', version: 1, recordId: 'one', operation: 'invalidate', createdAt: 'today', sourceCommand: '/memory' };
  const deleted = { ...invalidate, recordId: 'deleted', operation: 'delete' };
  fs.writeFileSync(file, [record, { ...record, id: 'deleted' }, invalidate, deleted].map(entry => JSON.stringify(entry)).join('\n') + '\n');
  const controller = new AbortController(); const reader = await store.snapshot!({ maxBytes: 512 * 1024, signal: controller.signal });
  expect((await reader.list()).records).toEqual([]); expect((await reader.list({ includeInvalidated: true })).records.map(entry => entry.id)).toEqual(['one']);
  expect((await reader.get('one'))?.invalidatedAt).toBe('today'); expect(await reader.get('deleted')).toBeUndefined();
  controller.abort();
  await expect(reader.get('one')).rejects.toMatchObject({ name: 'AbortError' });
  await expect(reader.list()).rejects.toMatchObject({ name: 'AbortError' });
  await expect(reader.health()).rejects.toMatchObject({ name: 'AbortError' });
});

it('revalidates the captured profile owner on every snapshot lookup', async () => {
  const profile = createProfileContext({ homeDir: root, name: 'snapshot', env: {} });
  const store = withProfile(profile, () => createProjectMemoryLocalStore({ ref: { mode: 'test-only', root: path.join(profile.root, 'memory') } }));
  fs.mkdirSync(store.ref.root!); fs.writeFileSync(store.ref.recordsFile!, JSON.stringify(record) + '\n');
  const reader = await withProfile(profile, () => store.snapshot!({ maxBytes: 512 * 1024 }));
  fs.renameSync(profile.root, profile.root + '-retired'); fs.mkdirSync(profile.root);
  await expect(reader.get('one')).rejects.toThrow('identity');
  await expect(reader.list()).rejects.toThrow('identity');
  await expect(reader.health()).rejects.toThrow('identity');
});
