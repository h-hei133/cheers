import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { hashContent } from '../../authority/content.js';
import { allocateOperation, captureOperationScope, operationLedgerRoot, readOperation, readOperations, scanOperations, withOperationStore } from './store.js';
import { OPERATION_READ_LIMITS } from './limits.js';
import { runUndoCommand } from '../undo/command.js';
import { pageUndoHistory } from '../undo/history.js';
import type { OperationReceipt } from './model.js';
import { latestOperation } from './preview.js';
import { undoHistory } from '../undo/service.js';

let root: string;
beforeEach(() => {
  const scratch = path.join(os.tmpdir(), 'cheers-test'); fs.mkdirSync(scratch, { recursive: true });
  root = fs.mkdtempSync(path.join(scratch, 'operation-read-'));
});
afterEach(() => { vi.restoreAllMocks(); fs.rmSync(root, { recursive: true, force: true }); });

function fixture() {
  const scope = captureOperationScope({ sessionId: 'read-session', workspaceRoot: root });
  const receipt = withOperationStore(scope, () => allocateOperation({ ...scope, schemaVersion: 1, operationId: 'operation-0',
    callId: 'read-fixture', revision: 1, status: 'unknown', undo: 'none',
    createdAt: '2026-10-01T00:00:00.000Z', updatedAt: '2026-10-01T00:00:00.000Z',
    files: [{ id: 'file-0', workspace: scope.workspace, path: 'note-0.txt', kind: 'update',
      before: { state: 'exists', hash: hashContent('before') }, after: { state: 'exists', hash: hashContent('after') },
      snapshot: { authorityId: 'operation-0', recordId: 'file-0' }, status: 'committed', undo: 'none' }] }));
  const directory = path.join(operationLedgerRoot(scope), 'operations', fs.readdirSync(path.join(operationLedgerRoot(scope), 'operations'))[0]!);
  const file = path.join(directory, 'operation-0.json');
  return { scope, receipt, directory, file };
}

function publish(directory: string, receipts: readonly OperationReceipt[]) {
  for (const receipt of receipts) fs.writeFileSync(path.join(directory, `${receipt.operationId}.json`), JSON.stringify(receipt));
  fs.writeFileSync(path.join(directory, 'index.json'), JSON.stringify({ schemaVersion: 1, sequence: receipts.length,
    operations: receipts.map(receipt => ({ operationId: receipt.operationId, sequence: receipt.sequence })) }));
}

function pair() {
  const saved = fixture();
  const newest = { ...saved.receipt, operationId: 'operation-1', sequence: 2,
    files: saved.receipt.files.map(file => ({ ...file, snapshot: { ...file.snapshot, authorityId: 'operation-1' } })) };
  publish(saved.directory, [saved.receipt, newest]);
  return saved;
}

it('acquires each receipt only when the iterator advances', () => {
  const { scope, file } = pair();
  const source = scanOperations(scope);
  expect(source.next().value?.operationId).toBe('operation-1');
  fs.writeFileSync(file, '{}');
  expect(() => source.next()).toThrow('invalid');
});

it.each(['latest', 'exact'] as const)('still validates receipts after finding the %s result', kind => {
  const { scope, file } = pair();
  fs.writeFileSync(file, '{}');
  expect(() => kind === 'latest' ? latestOperation(scope)
    : undoHistory({ cwd: root, sessionId: scope.sessionId }, 'operation-1')).toThrow('invalid');
});

it.each(['index', 'receipt'])('refuses an oversized %s at the descriptor before reading its content', kind => {
  const { scope, directory, file } = fixture();
  const target = kind === 'index' ? path.join(directory, 'index.json') : file;
  fs.truncateSync(target, OPERATION_READ_LIMITS.jsonBytes + 1);
  let targetBytes = 0;
  const original = fs.readSync;
  const readFile = fs.readFileSync;
  vi.spyOn(fs, 'readFileSync').mockImplementation((...args: Parameters<typeof fs.readFileSync>) => {
    if (typeof args[0] === 'number') throw new Error('Unbounded descriptor reading is forbidden in ledger admission.');
    return Reflect.apply(readFile, fs, args);
  });
  vi.spyOn(fs, 'readSync').mockImplementation((...args: Parameters<typeof fs.readSync>) => {
    const count = Reflect.apply(original, fs, args);
    if (process.platform === 'linux' && fs.realpathSync(`/proc/self/fd/${args[0]}`) === target) targetBytes += count;
    return count;
  });
  // A valid receipt remains directly inspectable when only the index is excessive.
  expect(() => kind === 'index' ? readOperations(scope) : readOperation(scope, 'operation-0')).toThrow('size limit');
  expect(targetBytes).toBe(0);
  expect(fs.statSync(target).size).toBe(OPERATION_READ_LIMITS.jsonBytes + 1);
});

it('refuses cumulative bytes before reading the next otherwise valid receipt and never reports an empty success', async () => {
  const { scope, receipt, directory } = fixture();
  const receipts = Array.from({ length: 5 }, (_, index) => ({ ...receipt, operationId: `operation-${index}`, sequence: index + 1,
    correlationId: 'x'.repeat(7 * 1024 * 1024),
    files: receipt.files.map(file => ({ ...file, snapshot: { ...file.snapshot, authorityId: `operation-${index}` } })) }));
  publish(directory, receipts);
  const refused = path.join(directory, 'operation-0.json');
  const original = fs.readSync;
  let bytes = 0;
  let refusedBytes = 0;
  vi.spyOn(fs, 'readSync').mockImplementation((...args: Parameters<typeof fs.readSync>) => {
    const count = Reflect.apply(original, fs, args);
    bytes += count;
    if (process.platform === 'linux' && fs.realpathSync(`/proc/self/fd/${args[0]}`) === refused) refusedBytes += count;
    return count;
  });
  expect(() => readOperations(scope)).toThrow('size limit');
  expect(bytes).toBeLessThanOrEqual(OPERATION_READ_LIMITS.totalBytes);
  expect(refusedBytes).toBe(0);
  const result = await runUndoCommand(['status'], { cwd: root, sessionId: scope.sessionId });
  expect(result.report!.facts.status).toBe('blocked');
  expect(result.output).toContain('No restoration was started');
  expect(fs.statSync(refused).size).toBeGreaterThan(7 * 1024 * 1024);
});

it('refuses excessive cumulative file entries instead of dropping an unresolved newest barrier', () => {
  const { scope, receipt, directory } = fixture();
  const receipts = Array.from({ length: 196 }, (_, index) => {
    const operationId = `operation-${index}`;
    return { ...receipt, operationId, sequence: index + 1,
      files: Array.from({ length: 256 }, (_, fileIndex) => ({ ...receipt.files[0]!, id: `file-${fileIndex}`, path: `note-${fileIndex}.txt`,
        snapshot: { authorityId: operationId, recordId: `file-${fileIndex}` } })) };
  });
  publish(directory, receipts);
  expect(() => readOperations(scope)).toThrow('file limit');
  expect(readOperation(scope, 'operation-195').status).toBe('unknown');
});

it('bounds all inventory entries and closes its cursor on refusal', () => {
  const { scope } = fixture();
  let calls = 0;
  const close = vi.fn();
  const read = vi.fn(() => (++calls <= OPERATION_READ_LIMITS.directoryEntries + 1 ? { name: `unrelated-${calls}` } : null));
  vi.spyOn(fs, 'opendirSync').mockReturnValue({ readSync: read, closeSync: close } as unknown as fs.Dir);
  expect(() => readOperations(scope)).toThrow('entry limit');
  expect(calls).toBe(OPERATION_READ_LIMITS.directoryEntries + 1);
  expect(close).toHaveBeenCalledOnce();
});

it('keeps the original complete-value cursor bytes while hashing receipts separately', () => {
  const { scope, receipt } = fixture();
  const receipts = [receipt, { ...receipt, operationId: 'older', sequence: 2 }];
  expect(pageUndoHistory(scope, receipts)!.revision).toBe(hashContent(JSON.stringify({ scope, receipts })));
  const stringify = JSON.stringify;
  vi.spyOn(JSON, 'stringify').mockImplementation((value, ...args) => {
    expect(value).not.toHaveProperty('receipts');
    return stringify(value, ...args);
  });
  expect(pageUndoHistory(scope, receipts)!.revision).toMatch(/^[a-f0-9]{64}$/);
});
