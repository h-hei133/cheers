import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { syncBuiltinESMExports } from 'node:module';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { commitWorkspaceFile } from '../../authority/commit.js';
import { inspectWorkspaceFile } from '../../authority/state.js';
import { commitOperation, prepareOperation } from './write.js';
import { previewOperation, type UndoPreview } from './preview.js';
import { readOperation } from './store.js';
import { restoreOperation } from './restore.js';
import { UNDO_WRITE_READ_LIMITS } from './limits.js';

// Small tiers exercise actual descriptor and writer boundaries without large retained bodies.
vi.mock('./limits.js', async () => ({ ...await vi.importActual<object>('./limits.js'),
  UNDO_WRITE_READ_LIMITS: { fileBytes: 1024, totalBytes: 16 * 1024 } }));
const limits = UNDO_WRITE_READ_LIMITS as { fileBytes: number; totalBytes: number };
let root: string;
beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'undo-writer-'));
  limits.fileBytes = 1024; limits.totalBytes = 16 * 1024;
});
afterEach(() => { vi.restoreAllMocks(); syncBuiltinESMExports(); fs.rmSync(root, { recursive: true, force: true }); });

async function fixture(entries = [{ name: 'note.txt', before: 'old😀', after: 'new' }]) {
  for (const entry of entries) fs.writeFileSync(path.join(root, entry.name), entry.before);
  const prepared = await prepareOperation({ sessionId: 'writer-session', workspaceRoot: root, callId: 'writer-fixture' },
    entries.map(entry => ({ workspaceRoot: root, relativePath: entry.name,
      before: inspectWorkspaceFile(root, entry.name), content: entry.after })));
  const receipt = commitOperation(prepared);
  return { receipt, preview: await previewOperation(receipt), entries };
}

const approve = (preview: UndoPreview) => ({ operationId: preview.receipt.operationId, sessionId: preview.receipt.sessionId,
  workspaceIdentity: preview.receipt.workspace.identity, revision: preview.revision });

it('charges all original commit inspections by exact opened source bytes', () => {
  fs.writeFileSync(path.join(root, 'note.txt'), 'old');
  const expected = inspectWorkspaceFile(root, 'note.txt');
  const admit = vi.fn();
  const result = commitWorkspaceFile({ workspaceRoot: root, relativePath: 'note.txt', expected,
    content: 'new😀', maxBytes: 1024, admitBytes: admit });
  expect(admit.mock.calls.map(call => call[0])).toEqual([3, 3, 7]);
  expect(result).toMatchObject({ state: 'exists', content: 'new😀' });
});

it.each([1, 2, 3])('propagates admission refusal at commit inspection %s and removes temporary files', refused => {
  fs.writeFileSync(path.join(root, 'note.txt'), 'old');
  const expected = inspectWorkspaceFile(root, 'note.txt');
  let calls = 0;
  expect(() => commitWorkspaceFile({ workspaceRoot: root, relativePath: 'note.txt', expected, content: 'new',
    admitBytes: () => { if (++calls === refused) throw new Error('Target source admission refused'); } })).toThrow('admission refused');
  expect(calls).toBe(refused);
  expect(fs.readFileSync(path.join(root, 'note.txt'), 'utf8')).toBe(refused === 3 ? 'new' : 'old');
  expect(fs.readdirSync(root).some(name => name.startsWith('.edit-'))).toBe(false);
});

it('refuses oversized growth after refreshed preview before locked body reads or durable intent', async () => {
  const { receipt, preview } = await fixture();
  const target = path.join(root, 'note.txt');
  const open = fs.openSync;
  const read = fs.readSync;
  let changed = false;
  const targetFds = new Set<number>();
  let targetBytes = 0;
  vi.spyOn(fs, 'openSync').mockImplementation((...args: Parameters<typeof fs.openSync>) => {
    if (!changed && String(args[0]).endsWith('/store.lock') && args[1] === 'wx') {
      changed = true; fs.truncateSync(target, limits.fileBytes + 1);
    }
    const fd = Reflect.apply(open, fs, args);
    if (String(args[0]) === target) targetFds.add(fd); else targetFds.delete(fd);
    return fd;
  });
  vi.spyOn(fs, 'readSync').mockImplementation((...args: Parameters<typeof fs.readSync>) => {
    const count = Reflect.apply(read, fs, args);
    if (targetFds.has(args[0])) targetBytes += count;
    return count;
  });
  syncBuiltinESMExports();
  expect((await restoreOperation(preview, approve(preview))).status).toBe('blocked');
  expect(changed).toBe(true);
  expect(targetBytes).toBe(Buffer.byteLength('new')); // Only the valid refreshed preview body.
  vi.restoreAllMocks();
  syncBuiltinESMExports();
  expect(fs.statSync(target).size).toBe(1025);
  expect(readOperation(receipt, receipt.operationId).undo).toBe('none');
});

it('checks the complete locked target set within one budget before any undo intent or write', async () => {
  const { receipt, preview, entries } = await fixture([
    { name: 'a', before: 'aaaa', after: '1111' }, { name: 'b', before: 'bbbb', after: '2222' },
    { name: 'c', before: 'cccc', after: '3333' },
  ]);
  limits.totalBytes = 11;
  const rename = vi.spyOn(fs, 'renameSync');
  expect((await restoreOperation(preview, approve(preview))).status).toBe('blocked');
  expect(rename).not.toHaveBeenCalled();
  expect(readOperation(receipt, receipt.operationId)).toEqual(receipt);
  for (const entry of entries) expect(fs.readFileSync(path.join(root, entry.name), 'utf8')).toBe(entry.after);
});

it('keeps a published but unread verification unknown when the shared target budget is exhausted', async () => {
  const { receipt, preview } = await fixture();
  // Preflight3 + commit-before3 + final-current3 fit; restored UTF-8 source7 does not.
  limits.totalBytes = 9;
  const result = await restoreOperation(preview, approve(preview));
  expect(result).toMatchObject({ status: 'unknown', files: [{ path: 'note.txt', status: 'unknown' }] });
  expect(fs.readFileSync(path.join(root, 'note.txt'), 'utf8')).toBe('old😀');
  expect(readOperation(receipt, receipt.operationId)).toMatchObject({ undo: 'unknown', files: [{ undo: 'unknown' }] });
  expect((await previewOperation(readOperation(receipt, receipt.operationId))).canRestore).toBe(false);
});

it('restores an exact fully admitted operation through the unchanged writer', async () => {
  const { receipt, preview } = await fixture();
  limits.totalBytes = 16; // Complete preflight and all three commit inspections:3+3+3+7.
  expect((await restoreOperation(preview, approve(preview))).status).toBe('restored-verified');
  expect(fs.readFileSync(path.join(root, 'note.txt'), 'utf8')).toBe('old😀');
  expect(readOperation(receipt, receipt.operationId).undo).toBe('restored-verified');
});
