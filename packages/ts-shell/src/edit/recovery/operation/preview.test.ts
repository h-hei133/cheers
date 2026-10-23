import fs from 'node:fs';
import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { inspectWorkspaceFile } from '../../authority/state.js';
import { hashContent } from '../../authority/content.js';
import { commitOperation, prepareOperation } from './write.js';
import { previewOperation } from './preview.js';
import { operationLedgerRoot, readOperation } from './store.js';
import { restoreOperation } from './restore.js';

// Small source tier exercises the same production budget/descriptor path without a 128MiB fixture.
vi.mock('./limits.js', async () => ({ ...await vi.importActual<object>('./limits.js'),
  UNDO_PREVIEW_LIMITS: { fileBytes: 64 * 1024 * 1024, totalBytes: 16 * 1024 } }));

let root: string;
beforeEach(() => { root = fs.mkdtempSync(path.join(os.tmpdir(), 'undo-preview-')); });
afterEach(() => { vi.restoreAllMocks(); fs.rmSync(root, { recursive: true, force: true }); });

async function fixture(before = 'before\r\n😀', after = 'after\r\n😀') {
  const target = path.join(root, 'note.txt'); fs.writeFileSync(target, before);
  const prepared = await prepareOperation({ sessionId: 'preview-session', workspaceRoot: root, callId: 'preview-fixture' },
    [{ workspaceRoot: root, relativePath: 'note.txt', before: inspectWorkspaceFile(root, 'note.txt'), content: after }]);
  const receipt = commitOperation(prepared);
  return { receipt, target };
}

it('keeps the original exact current-content revision and restores a fully admitted preview', async () => {
  const { receipt, target } = await fixture();
  const preview = await previewOperation(receipt);
  expect(preview.canRestore).toBe(true);
  const original = hashContent(JSON.stringify({ receipt, files: preview.files.map(({ file, current, blocker }) => ({ id: file.id, current, blocker })) }));
  expect(preview.revision).toBe(original);
  const stringify = JSON.stringify;
  vi.spyOn(JSON, 'stringify').mockImplementation((value, ...args) => {
    if (value && typeof value === 'object') expect(value).not.toHaveProperty('receipt');
    return stringify(value, ...args);
  });
  expect((await previewOperation(receipt)).revision).toBe(original);
  vi.restoreAllMocks();
  const result = await restoreOperation(preview, { operationId: receipt.operationId, sessionId: receipt.sessionId,
    workspaceIdentity: receipt.workspace.identity, revision: preview.revision });
  expect(result.status).toBe('restored-verified');
  expect(fs.readFileSync(target, 'utf8')).toBe('before\r\n😀');
});

it('counts metadata plus blob plus current content and clears all retained bodies on cumulative refusal', async () => {
  const { receipt, target } = await fixture('b'.repeat(8 * 1024), 'a'.repeat(8 * 1024));
  const original = fs.readSync;
  let currentBytes = 0;
  vi.spyOn(fs, 'readSync').mockImplementation((...args: Parameters<typeof fs.readSync>) => {
    const count = Reflect.apply(original, fs, args);
    if (process.platform === 'linux' && fs.realpathSync(`/proc/self/fd/${args[0]}`) === target) currentBytes += count;
    return count;
  });
  const preview = await previewOperation(receipt);
  expect(preview.canRestore).toBe(false);
  expect(preview.blockers).toContain('preview-source-limit');
  expect(preview.files).toHaveLength(receipt.files.length);
  expect(preview.files.every(file => !file.prepared && !file.current && file.blocker === 'preview-source-limit')).toBe(true);
  // Receipt metadata is read synchronously; the denied current body must not be read.
  expect(currentBytes).toBe(0);
  expect(fs.readFileSync(target, 'utf8')).toBe('a'.repeat(8 * 1024));
  expect(readOperation(receipt, receipt.operationId).undo).toBe('none');
});

it('preserves a cumulative refusal through snapshot JSON acquisition without reading the blob', async () => {
  const { receipt } = await fixture();
  const ledger = path.join(operationLedgerRoot(receipt), receipt.operationId);
  const recordFile = path.join(ledger, 'records', receipt.files[0]!.id + '.json');
  const record = JSON.parse(fs.readFileSync(recordFile, 'utf8'));
  fs.writeFileSync(recordFile, JSON.stringify({ ...record, extra: 'x'.repeat(17 * 1024) }));
  const open = vi.spyOn(fsp, 'open');
  const preview = await previewOperation(receipt);
  expect(preview.blockers).toContain('preview-source-limit');
  expect(preview.canRestore).toBe(false);
  expect(open.mock.calls.some(call => String(call[0]).includes('/blobs/'))).toBe(false);
  expect(preview.files.every(file => !file.current && !file.prepared)).toBe(true);
});

it('refuses an oversized current file before reading and keeps the snapshot inspectable', async () => {
  const { receipt, target } = await fixture();
  fs.truncateSync(target, 64 * 1024 * 1024 + 1);
  const preview = await previewOperation(receipt);
  expect(preview.canRestore).toBe(false);
  expect(preview.files[0]!.blocker).toBe('snapshot-or-workspace-unavailable');
  expect(fs.statSync(target).size).toBe(64 * 1024 * 1024 + 1);
  expect(readOperation(receipt, receipt.operationId).undo).toBe('none');
});

it('propagates an original file admission refusal that only occurs once', async () => {
  const { receipt, target } = await fixture();
  let calls = 0;
  await expect(previewOperation(receipt, { admission: () => ++calls === 2 ? 'One-shot file admission revoked' : undefined }))
    .rejects.toThrow('One-shot file admission revoked');
  expect(fs.readFileSync(target, 'utf8')).toBe('after\r\n😀');
  expect(readOperation(receipt, receipt.operationId).undo).toBe('none');
});
