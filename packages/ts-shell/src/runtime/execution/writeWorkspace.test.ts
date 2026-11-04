import fs from 'node:fs';
import path from 'node:path';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { captureRecoveryAuthorityRecord } from '../../edit/recovery/recoveryAuthorityStore.js';
import { createDefaultExecutionService } from './service.js';

vi.mock('../../edit/recovery/recoveryAuthorityStore.js', async () => ({
  ...await vi.importActual<typeof import('../../edit/recovery/recoveryAuthorityStore.js')>(
    '../../edit/recovery/recoveryAuthorityStore.js'),
  captureRecoveryAuthorityRecord: vi.fn(),
}));

let fixture: string;
let workspace: string;
let sibling: string;
beforeEach(() => {
  fs.mkdirSync('/tmp/cheers-test/', { recursive: true });
  fixture = fs.mkdtempSync('/tmp/cheers-test/write-workspace-');
  workspace = path.join(fixture, 'Root'); sibling = path.join(fixture, 'Outside');
  fs.mkdirSync(workspace); fs.mkdirSync(sibling);
  fs.writeFileSync(path.join(workspace, 'inside.txt'), '\ufeffinside\r\n');
  fs.writeFileSync(path.join(sibling, 'inside.txt'), 'outside same name');
  vi.mocked(captureRecoveryAuthorityRecord).mockReset();
});
afterEach(() => { vi.restoreAllMocks(); fs.rmSync(fixture, { recursive: true, force: true }); });

function write(absolutePath: string, workspaceRoot = workspace, expectedContent?: string) {
  return createDefaultExecutionService().writeTextFile({
    operationKind: 'file.write', workspaceRoot, absolutePath, content: 'changed', expectedContent,
    authority: { mode: 'approved-for-write', source: 'tool-runtime-approval', reason: 'test' },
    caller: 'write-workspace-test', reason: 'test', reportSafeTarget: 'inside.txt',
  });
}

function foldLexicalCase(): void {
  const relative = path.relative;
  const fold = (value: string) => value === sibling || value.startsWith(`${sibling}${path.sep}`)
    ? workspace + value.slice(sibling.length) : value;
  vi.spyOn(path, 'relative').mockImplementation((from, to) => relative(fold(from), fold(to)));
}

it.each(['inside.txt', 'new.txt', 'missing/new.txt'])('rejects a folded sibling %s before snapshot acquisition', async name => {
  foldLexicalCase();
  const open = vi.spyOn(fs, 'openSync');
  await expect(write(path.join(sibling, name))).rejects.toThrow('outside');
  expect(open).not.toHaveBeenCalled();
  expect(captureRecoveryAuthorityRecord).not.toHaveBeenCalled();
  expect(fs.readFileSync(path.join(workspace, 'inside.txt'), 'utf8')).toBe('\ufeffinside\r\n');
  expect(fs.readFileSync(path.join(sibling, 'inside.txt'), 'utf8')).toBe('outside same name');
  expect(fs.readdirSync(sibling)).toEqual(['inside.txt']);
});

it.each([false, true])('accepts selected and canonical files under a selected root alias (folded: %s)', async folded => {
  const alias = folded ? sibling : path.join(fixture, 'selected');
  if (folded) fs.rmSync(sibling, { recursive: true });
  fs.symlinkSync(workspace, alias, 'dir');
  if (folded) foldLexicalCase();
  // expectedContent forces the production pre-read to preserve exact BOM/CRLF bytes.
  await write(path.join(alias, 'inside.txt'), alias, '\ufeffinside\r\n');
  expect(fs.readFileSync(path.join(workspace, 'inside.txt'), 'utf8')).toBe('changed');
  fs.writeFileSync(path.join(workspace, 'inside.txt'), '\ufeffinside\r\n');
  await write(path.join(workspace, 'inside.txt'), alias, '\ufeffinside\r\n');
  expect(fs.readFileSync(path.join(workspace, 'inside.txt'), 'utf8')).toBe('changed');
});

it.each(['file', 'directory', 'root'])('refuses an unselected %s alias before pre-reading its destination', async kind => {
  let target: string;
  if (kind === 'file') {
    target = path.join(sibling, 'bounce.txt');
    fs.symlinkSync(path.join(workspace, 'inside.txt'), target);
    fs.writeFileSync(path.join(workspace, 'bounce.txt'), 'same-named authorized file');
  } else if (kind === 'directory') {
    fs.symlinkSync(workspace, path.join(sibling, 'bounce'), 'dir');
    fs.mkdirSync(path.join(workspace, 'bounce'));
    fs.writeFileSync(path.join(workspace, 'bounce', 'inside.txt'), 'same-named authorized file');
    target = path.join(sibling, 'bounce', 'inside.txt');
  } else {
    fs.rmSync(sibling, { recursive: true });
    fs.symlinkSync(workspace, sibling, 'dir');
    target = path.join(sibling, 'inside.txt');
  }
  foldLexicalCase();
  const open = vi.spyOn(fs, 'openSync');
  await expect(write(target)).rejects.toThrow('symlink');
  expect(open).not.toHaveBeenCalled();
  expect(captureRecoveryAuthorityRecord).not.toHaveBeenCalled();
  expect(fs.readFileSync(path.join(workspace, 'inside.txt'), 'utf8')).toBe('\ufeffinside\r\n');
});

it('refuses an internal source symlink on the production writer', async () => {
  const target = path.join(workspace, 'alias.txt');
  fs.symlinkSync(path.join(workspace, 'inside.txt'), target);
  await expect(write(target)).rejects.toThrow('symlink');
  expect(captureRecoveryAuthorityRecord).not.toHaveBeenCalled();
  expect(fs.readFileSync(path.join(workspace, 'inside.txt'), 'utf8')).toBe('\ufeffinside\r\n');
});
