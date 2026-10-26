import fs from 'node:fs';
import path from 'node:path';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { prepareContextInjection } from './injection.js';
import { createProjectMemoryLocalStore } from '../../../memory/projectMemoryLocalStore.js';
import { createProjectMemoryInjectionStateStore } from '../../../memory/projectMemoryInjectionState.js';
import type { ProjectMemoryRecord } from '../../../memory/projectMemoryStoreContract.js';
import type { ShellRuntimeContext } from '../../../core/shell/runtimeContext.js';
import { createCompactLiveCheckpointStore } from '../../../context/compact/checkpoint/compactLiveCheckpoint.js';
import { createCompactInjectionStateStore } from '../../../context/compact/injection/compactInjectionState.js';
import * as revisions from '../../../runtime/execution/read.js';
import * as snapshots from '../../../runtime/execution/snapshot.js';
import { readEntries } from '../../../memory/memoryPersistence.js';

let root: string;
beforeEach(() => { fs.mkdirSync('/tmp/cheers-test', { recursive: true }); root = fs.mkdtempSync('/tmp/cheers-test/memory-preview-'); });
afterEach(() => { vi.restoreAllMocks(); fs.rmSync(root, { recursive: true, force: true }); });
const record: ProjectMemoryRecord = { id: 'fact', version: 1, createdAt: '2026-10-26', candidateId: 'fact',
  candidateKind: 'project-fact', retentionClass: 'project-scoped-candidate', approvedAt: '2026-10-26', approvedBySourceCommand: '/memory',
  memoryText: 'Project uses strict validation.', evidence: ['memory-preview:fixture'], source: 'system-derived', routeReferences: [], safety: 'safe', redactions: [] };
function fixture() {
  const store = createProjectMemoryLocalStore({ ref: { mode: 'test-only', root } });
  const file = store.ref.recordsFile!; fs.writeFileSync(file, JSON.stringify(record) + '\n');
  const states = createProjectMemoryInjectionStateStore();
  const pending = states.markPending({ sessionScopeId: 'session:memory-preview', sourceCommand: '/memory use', mode: 'recall', query: 'validation', recordIds: ['fact'] });
  const deps = { projectMemoryInjectionStateStore: states, compactCheckpointStore: createCompactLiveCheckpointStore(), compactInjectionStateStore: createCompactInjectionStateStore() };
  const context = { session: { id: 'memory-preview' } } as ShellRuntimeContext;
  const load = () => prepareContextInjection(context, store, 'question', new AbortController().signal, deps);
  return { store, file, states, pending, deps, context, load };
}

it('binds raw memory bytes even when an equal-length edit retains the captured metadata', async () => {
  const { file, states, pending, load } = fixture();
  vi.spyOn(revisions, 'readRevision').mockReturnValue('stable');
  const prepared = await load(); expect(prepared.prompt).toContain(record.memoryText);
  expect(prepared.isCurrent()).toBe(true);
  const verify = prepared.verifyContent;
  await verify(new AbortController().signal);
  fs.writeFileSync(file, fs.readFileSync(file, 'utf8').replace('strict', 'looser'));
  expect(prepared.isCurrent()).toBe(true);
  await expect(verify(new AbortController().signal)).rejects.toThrow('bytes changed');
  expect(states.get(pending.sessionScopeId)).toBe(pending);
  expect((await load()).prompt).toContain('looser validation');
});

it.each(['delete', 'invalidate'] as const)('rejects %s through the actual memory owner without consuming the pending generation', async action => {
  const { store, states, pending, load } = fixture(); const prepared = await load();
  if (action === 'delete') expect((await store.delete!({ recordId: 'fact', deletedAt: '2026-10-26', sourceCommand: '/memory' })).deleted).toBe(true);
  else expect((await store.invalidate!({ recordId: 'fact', invalidatedAt: '2026-10-26', sourceCommand: '/memory' })).invalidated).toBe(true);
  expect(() => prepared.isCurrent()).toThrow('source changed');
  expect(states.get(pending.sessionScopeId)).toBe(pending);
  expect((await load()).prompt).toBe('question');
});

it('detects a newly pending generation and a replaced session object while keeping preparation read-only', async () => {
  const { file, states, pending, context, load } = fixture(); const before = fs.readFileSync(file);
  const prepared = await load(); expect(prepared.isCurrent()).toBe(true);
  states.markPending({ sessionScopeId: pending.sessionScopeId, sourceCommand: '/memory use', mode: 'wake', recordIds: ['fact'] });
  expect(prepared.isCurrent()).toBe(false);
  const current = await load(); context.session = { ...context.session };
  expect(current.isCurrent()).toBe(false); expect(fs.readFileSync(file)).toEqual(before);
});

it('drains a real opened memory descriptor after cancellation without admitting a subsequent read', async () => {
  const { file, store, context, deps, states, pending } = fixture();
  const original = fs.promises.open.bind(fs.promises);
  let release!: () => void; let captured!: () => void; let close!: ReturnType<typeof vi.spyOn>;
  const held = new Promise<void>(resolve => { release = resolve; });
  const ready = new Promise<void>(resolve => { captured = resolve; });
  const open = vi.spyOn(fs.promises, 'open').mockImplementation(async (...args) => {
    const handle = await original(...args); close = vi.spyOn(handle, 'close'); captured(); await held; return handle;
  });
  const controller = new AbortController();
  const result = prepareContextInjection(context, store, 'question', controller.signal, deps);
  const refusal = expect(result).rejects.toMatchObject({ name: 'AbortError' });
  await ready; controller.abort(); expect(close).not.toHaveBeenCalled(); release(); await refusal;
  expect(close).toHaveBeenCalledTimes(1); expect(open).toHaveBeenCalledTimes(1);
  expect(states.get(pending.sessionScopeId)).toBe(pending); expect(fs.existsSync(file)).toBe(true);
});

it('observes exact undecoded bytes and refuses observer, oversize and cancelled reads before a partial estimate', async () => {
  const { store, file } = fixture();
  const bytes = Buffer.concat([Buffer.from('\uFEFF'), Buffer.from([0xff]), Buffer.from('\r\n'), Buffer.from(JSON.stringify(record))]);
  fs.writeFileSync(file, bytes);
  const observed: Buffer[] = [];
  const decoded = await readEntries(store.ref, { maxBytes: bytes.length, onSource: (_target, content) => { if (content) observed.push(content); } });
  expect(observed).toEqual([bytes]); expect(decoded.entries).toEqual([record]); expect(decoded.diagnostics).toHaveLength(1);
  await expect(readEntries(store.ref, { maxBytes: bytes.length - 1 })).rejects.toThrow('byte limit');
  const failure = new Error('fixture observation refusal');
  await expect(readEntries(store.ref, { maxBytes: bytes.length, onSource: (_target, content) => { if (content) throw failure; } })).rejects.toBe(failure);
  const controller = new AbortController(); controller.abort(); const read = vi.spyOn(snapshots, 'readBinarySnapshot');
  await expect(readEntries(store.ref, { maxBytes: bytes.length, signal: controller.signal })).rejects.toMatchObject({ name: 'AbortError' });
  expect(read).not.toHaveBeenCalled();
});

it('binds an absent file and refuses alias retargeting during acquisition', async () => {
  const { file, store, context, deps, load } = fixture(); fs.unlinkSync(file);
  const absent = await load(); expect(absent.prompt).toBe('question'); expect(absent.isCurrent()).toBe(true);
  fs.writeFileSync(file, JSON.stringify(record) + '\n'); expect(() => absent.isCurrent()).toThrow('source changed');
  const first = path.join(root, 'first'), second = path.join(root, 'second');
  fs.renameSync(file, first); fs.writeFileSync(second, fs.readFileSync(first)); fs.symlinkSync(first, file);
  const original = snapshots.readBinarySnapshot;
  vi.spyOn(snapshots, 'readBinarySnapshot').mockImplementation(async (...args) => {
    const bytes = await original(...args); fs.unlinkSync(file); fs.symlinkSync(second, file); return bytes;
  });
  await expect(prepareContextInjection(context, store, 'question', new AbortController().signal, deps)).rejects.toThrow('source changed');
});

it('accounts for each serial memory read and keeps synchronous current checks free of body acquisition', async () => {
  const { load } = fixture(); const original = snapshots.readBinarySnapshot;
  let active = 0, peak = 0, bytes = 0;
  const read = vi.spyOn(snapshots, 'readBinarySnapshot').mockImplementation(async (...args) => {
    active++; peak = Math.max(peak, active);
    try { const result = await original(...args); bytes += result.length; return result; }
    finally { active--; }
  });
  const prepared = await load();
  // health, candidates, one lifecycle record, and initial content verification.
  expect(read).toHaveBeenCalledTimes(4); expect(peak).toBe(1); expect(active).toBe(0); expect(bytes).toBeGreaterThan(0);
  const before = bytes;
  for (let index = 0; index < 20; index++) expect(prepared.isCurrent()).toBe(true);
  expect(read).toHaveBeenCalledTimes(4); expect(bytes).toBe(before);
  await prepared.verifyContent(new AbortController().signal);
  expect(read).toHaveBeenCalledTimes(5); expect(bytes).toBe(before * 5 / 4);
});

it('does not acquire unused memory bodies when no injection is pending', async () => {
  const { store, context, deps, states, pending } = fixture(); states.clear(pending.sessionScopeId);
  fs.writeFileSync(store.ref.recordsFile!, ' '.repeat(512 * 1024 + 1));
  const read = vi.spyOn(snapshots, 'readBinarySnapshot');
  const prepared = await prepareContextInjection(context, store, 'question', new AbortController().signal, deps);
  expect(prepared.prompt).toBe('question'); expect(prepared.isCurrent()).toBe(true);
  await prepared.verifyContent(new AbortController().signal); expect(read).not.toHaveBeenCalled();
});
