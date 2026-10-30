import fs from 'node:fs';
import path from 'node:path';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { CommandContext } from '../../../core/commands/types.js';
import { inspectWorkspaceFile } from '../../authority/state.js';
import { commitOperation, prepareOperation } from '../operation/write.js';
import { readOperation } from '../operation/store.js';
import { runUndoCommand } from './command.js';
import * as reports from './report.js';
import * as usage from '../../../observability/usageTelemetry.js';

let root: string;
let context: CommandContext;
beforeEach(() => {
  const scratch = path.resolve(process.cwd(), '../../.tmp');
  fs.mkdirSync(scratch, { recursive: true });
  root = fs.mkdtempSync(path.join(scratch, 'undo-command-'));
  context = { cwd: root, sessionId: 'undo-command-session' };
  fs.writeFileSync(path.join(root, 'a.txt'), 'old-a\n');
  fs.writeFileSync(path.join(root, 'b.txt'), 'old-b\n');
});
afterEach(() => { vi.restoreAllMocks(); fs.rmSync(root, { recursive: true, force: true }); });

async function edit(file: string, content: string) {
  return commitOperation(await prepareOperation({ sessionId: context.sessionId!, workspaceRoot: root,
    callId: `call-${file}`, correlationId: 'prompt-batch' }, [{ workspaceRoot: root, relativePath: file,
    before: inspectWorkspaceFile(root, file), content }]));
}

it('restores two original snapshot operations newest first and publishes the result', async () => {
  const older = await edit('a.txt', 'new-a\n'), newer = await edit('b.txt', 'new-b\n');
  const invalidate = vi.spyOn(usage, 'markContextUnknown');
  const result = await runUndoCommand(['restore-turn', 'prompt-batch', '--execute'], context);
  expect(result.report!.facts.steps).toMatchObject([{ operationId: newer.operationId, status: 'restored-verified' },
    { operationId: older.operationId, status: 'restored-verified' }]);
  expect(result.state!.fileUndo).toMatchObject({ status: 'restored-verified' });
  expect(fs.readFileSync(path.join(root, 'a.txt'), 'utf8')).toBe('old-a\n');
  expect(fs.readFileSync(path.join(root, 'b.txt'), 'utf8')).toBe('old-b\n');
  expect(readOperation(older, older.operationId).undo).toBe('restored-verified');
  expect(readOperation(newer, newer.operationId).undo).toBe('restored-verified');
  expect(invalidate).toHaveBeenCalledWith(context.sessionId);
});

it('publishes a partial turn after a real restore and preserves the changed older file', async () => {
  const older = await edit('a.txt', 'new-a\n'), newer = await edit('b.txt', 'new-b\n');
  fs.writeFileSync(path.join(root, 'a.txt'), 'external-a\n');
  const invalidate = vi.spyOn(usage, 'markContextUnknown');
  const result = await runUndoCommand(['restore-turn', 'prompt-batch', '--execute'], context);
  expect(result.report!.facts.restored).toBe(1);
  expect(result.report!.facts.skipped).toEqual([older.operationId]);
  expect(result.state?.fileUndo).toMatchObject({ operationId: 'turn:prompt-batch', status: 'partial',
    files: [{ path: 'b.txt', status: 'restored-verified' }] });
  expect(result.stateFailureWarning).toContain('model context');
  expect(fs.readFileSync(path.join(root, 'a.txt'), 'utf8')).toBe('external-a\n');
  expect(fs.readFileSync(path.join(root, 'b.txt'), 'utf8')).toBe('old-b\n');
  expect(readOperation(older, older.operationId).undo).toBe('none');
  expect(readOperation(newer, newer.operationId).undo).toBe('restored-verified');
  expect(invalidate).toHaveBeenCalledWith(context.sessionId);
});

it('retains known file results when report construction fails after restoration', async () => {
  const receipt = await edit('a.txt', 'new-a\n');
  vi.spyOn(reports, 'turnRestoreReport').mockImplementation(() => { throw new Error('public report fixture failure'); });
  const result = await runUndoCommand(['restore-turn', 'prompt-batch', '--execute'], context);
  expect(fs.readFileSync(path.join(root, 'a.txt'), 'utf8')).toBe('old-a\n');
  expect(readOperation(receipt, receipt.operationId).undo).toBe('restored-verified');
  expect(result.output).not.toContain('No restoration was started');
  expect(result.output).toContain('Inspect /undo status');
  expect(result.state?.fileUndo).toMatchObject({ status: 'restored-verified' });
});

it('publishes an unknown write when access retires before readback verification', async () => {
  const older = await edit('a.txt', 'new-a\n'), newer = await edit('b.txt', 'new-b\n');
  context = { ...context, admission: () => fs.readFileSync(path.join(root, 'b.txt'), 'utf8') === 'old-b\n'
    ? 'Fixture context retired after first restore' : undefined };
  const result = await runUndoCommand(['restore-turn', 'prompt-batch', '--execute'], context);
  expect(fs.readFileSync(path.join(root, 'a.txt'), 'utf8')).toBe('new-a\n');
  expect(fs.readFileSync(path.join(root, 'b.txt'), 'utf8')).toBe('old-b\n');
  // Revocation lands after rename but before readback, so bytes changed while
  // the original writer correctly retains unknown rather than verified.
  expect(readOperation(newer, newer.operationId).undo).toBe('unknown');
  expect(readOperation(older, older.operationId).undo).toBe('none');
  expect(result.state?.fileUndo).toMatchObject({ status: 'unknown' });
  expect(result.output).not.toContain('No restoration was started');
});

it('refuses unconfirmed restoration before reading or writing any snapshots', async () => {
  const receipt = await edit('a.txt', 'new-a\n');
  const result = await runUndoCommand(['restore-turn', 'prompt-batch'], context);
  expect(result.report!.facts.status).toBe('permission-pending');
  expect(result.state).toBeUndefined();
  expect(fs.readFileSync(path.join(root, 'a.txt'), 'utf8')).toBe('new-a\n');
  expect(readOperation(receipt, receipt.operationId).undo).toBe('none');
});

it('retains a verified earlier step when the next context recheck throws', async () => {
  const older = await edit('a.txt', 'new-a\n'), newer = await edit('b.txt', 'new-b\n');
  let contexts = 0;
  Object.defineProperty(context, 'admission', { get: () => {
    if (++contexts > 1 && readOperation(newer, newer.operationId).undo === 'restored-verified') {
      throw new Error('Fixture context lookup retired');
    }
    return undefined;
  } });
  const result = await runUndoCommand(['restore-turn', 'prompt-batch', '--execute'], context);
  expect(fs.readFileSync(path.join(root, 'a.txt'), 'utf8')).toBe('new-a\n');
  expect(fs.readFileSync(path.join(root, 'b.txt'), 'utf8')).toBe('old-b\n');
  expect(readOperation(older, older.operationId).undo).toBe('none');
  expect(result.state?.fileUndo).toMatchObject({ status: 'partial' });
  expect(result.output).not.toContain('No restoration was started');
});
