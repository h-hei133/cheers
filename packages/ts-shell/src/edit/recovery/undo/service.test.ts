import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { CommandContext } from '../../../core/commands/types.js';
import type { RuntimeConfig } from '../../../config/runtimeConfig.js';
import { applyPatchPlan } from '../../patch/batch.js';
import { planPatch } from '../../patch/plan.js';
import { captureOperationScope, readOperations } from '../operation/store.js';
import { reportText } from '../../../core/commands/report/projection.js';
import { undoPicker } from '../../../cli/interactive/picker/undo.js';
import { executeUndo, prepareUndo, type UndoHost } from './service.js';
import { runUndoCommand } from './command.js';
import { buildCliCommandExecution } from '../../../entrypoints/cliCommandExecutionBridge.js';
import { StreamingRenderer } from '../../../presentation/terminal/streaming.js';

let directory: string;
let a: string;
let b: string;
let current: CommandContext;
const patch = (...sections: string[]) => ['*** Begin Patch', ...sections, '*** End Patch'].join('\n');
const update = (file: string, old: string, next: string) => `*** Update File: ${file}\n@@\n-${old}\n+${next}`;
const receipts = () => readOperations(captureOperationScope({ sessionId: 'undo-session', workspaceRoot: directory }));
const host = (overrides: Partial<UndoHost> = {}): UndoHost => ({ context: () => current, ...overrides });
beforeEach(() => {
  directory = fs.mkdtempSync(path.join(os.tmpdir(), 'file-undo-'));
  a = path.join(directory, 'a.txt'); b = path.join(directory, 'b.txt');
  fs.writeFileSync(a, 'old-a\n'); fs.writeFileSync(b, 'old-b\n');
  current = { cwd: directory, sessionId: 'undo-session' };
});
afterEach(() => { vi.restoreAllMocks(); fs.rmSync(directory, { recursive: true, force: true }); });
async function commit(input = patch(update('a.txt', 'old-a', 'new-a'), update('b.txt', 'old-b', 'new-b')), sessionId = 'undo-session') {
  const identity = { sessionId, workspaceRoot: directory, callId: 'undo-fixture' };
  return applyPatchPlan(planPatch(input, identity), identity);
}

describe('file undo surface', () => {
  it('ignores foreign and unowned snapshots, and selects one operation for the current session', async () => {
    await commit(patch(update('a.txt', 'old-a', 'foreign-a')), 'other-session');
    expect((await prepareUndo(current)).preview).toBeUndefined();
    const legacy = path.join(directory, '.sisyphus/edit-snapshots/unowned/records'); fs.mkdirSync(legacy, { recursive: true });
    fs.writeFileSync(path.join(legacy, 'latest.json'), JSON.stringify({ workspaceRelativePath: 'a.txt', createdAt: '2099-01-01' }));
    const receipt = await commit(patch(update('b.txt', 'old-b', 'new-b')));
    expect((await prepareUndo(current)).preview?.receipt.operationId).toBe(receipt!.operationId);
  });

  it('opens a read-only full group preview, cancels with zero writes, then explicitly restores and retains results', async () => {
    await commit(); const publish = vi.fn(); const runtime = host({ publish });
    const picker = undoPicker(runtime); const options = await picker.load(); expect(options.map(option => option.id)).toContain('review');
    const outcome = await picker.apply(['review']); expect(reportText(outcome!.report!)).toContain(a); expect(reportText(outcome!.report!)).toContain(b);
    expect(reportText(outcome!.report!)).toContain('-"new-a"'); expect(reportText(outcome!.report!)).toContain('+"old-b"');
    const confirmation = outcome!.next!; await confirmation.load(); expect(confirmation.initialSelection).toBe('cancel');
    expect(await confirmation.apply(['cancel'])).toBeUndefined();
    expect(fs.readFileSync(a, 'utf8')).toBe('new-a\n'); expect(receipts()[0]!.undo).toBe('none'); expect(publish).not.toHaveBeenCalled();
    expect(await confirmation.apply(['restore'])).toBeUndefined();
    await expect(confirmation.load()).rejects.toThrow('closed');
    const reopened = undoPicker(runtime); await reopened.load();
    const fresh = (await reopened.apply(['review']))!.next!; await fresh.load();
    const restored = await fresh.apply(['restore']); expect(restored!.report!.facts.status).toBe('restored-verified');
    expect(fs.readFileSync(a, 'utf8')).toBe('old-a\n'); expect(fs.readFileSync(b, 'utf8')).toBe('old-b\n');
    expect(receipts()[0]!.undo).toBe('restored-verified'); expect(publish).toHaveBeenCalledOnce();
    expect((await prepareUndo(current)).preview).toBeUndefined();
    const status = await runUndoCommand(['status'], current); expect(status.report!.facts.count).toBe(1); expect(status.output).toContain('undo: restored-verified');
    expect(await fresh.apply(['restore'])).toBeUndefined();
  });

  it.each(['stale-file', 'newer-operation', 'session-change', 'admission-change', 'busy'])('blocks confirmation after %s without overwriting other files', async kind => {
    await commit(); const preview = (await prepareUndo(current)).preview!;
    if (kind === 'stale-file') fs.writeFileSync(b, 'external\n');
    if (kind === 'newer-operation') await commit(patch(update('b.txt', 'new-b', 'later-b')));
    if (kind === 'session-change') current = { ...current, sessionId: 'other-session' };
    if (kind === 'admission-change') current = { ...current, admission: () => 'Workspace grant changed' };
    const result = await executeUndo(host({ busy: () => kind === 'busy' }), preview, true);
    expect(result.result.status).toBe('blocked'); expect(fs.readFileSync(a, 'utf8')).toBe('new-a\n');
    expect(fs.readFileSync(b, 'utf8')).toBe(kind === 'stale-file' ? 'external\n' : kind === 'newer-operation' ? 'later-b\n' : 'new-b\n');
    expect(receipts()[0]!.undo).toBe('none');
  });

  it('releases a pending opening when closed before its preview returns', async () => {
    await commit();
    const picker = undoPicker(host());
    const pending = picker.load();
    picker.previewEnd!();
    await expect(pending).rejects.toThrow('closed');
    expect(await picker.apply(['review'])).toBeUndefined();
    await expect(picker.load()).rejects.toThrow('closed');
    expect(fs.readFileSync(a, 'utf8')).toBe('new-a\n');
    expect(receipts()[0]!.undo).toBe('none');
  });

  it('refuses restoration when the opening admission was replaced by a permissive context', async () => {
    await commit();
    let blocked: string | undefined;
    current = { ...current, admission: () => blocked };
    const picker = undoPicker(host()); await picker.load();
    const confirmation = (await picker.apply(['review']))!.next!; await confirmation.load();
    blocked = 'Original grant revoked'; current = { ...current, admission: () => undefined };
    expect((await confirmation.apply(['restore']))!.report!.facts.status).toBe('blocked');
    expect(await confirmation.apply(['restore'])).toBeUndefined();
    expect(fs.readFileSync(a, 'utf8')).toBe('new-a\n');
    expect(receipts()[0]!.undo).toBe('none');
  });

  it('checks the original surface admission before acquisition and before confirmation', async () => {
    await commit();
    let blocked: string | undefined = 'Surface closed';
    const context = vi.fn(() => current);
    const opening = undoPicker(host({ context }), () => blocked);
    await expect(opening.load()).rejects.toThrow('unavailable');
    expect(context).not.toHaveBeenCalled();
    blocked = undefined;
    const fresh = undoPicker(host(), () => blocked); await fresh.load();
    const confirmation = (await fresh.apply(['review']))!.next!; await confirmation.load();
    blocked = 'Surface closed';
    expect((await confirmation.apply(['restore']))!.report!.facts.status).toBe('blocked');
    expect(fs.readFileSync(a, 'utf8')).toBe('new-a\n');
    expect(receipts()[0]!.undo).toBe('none');
  });

  it('uses exact revision plus explicit confirmation for direct execution and rejects unknown syntax before context access', async () => {
    await commit(); const preview = (await prepareUndo(current)).preview!;
    const args = ['execute', preview.receipt.operationId, preview.revision];
    expect((await runUndoCommand(args, current)).report!.facts.status).toBe('permission-pending');
    expect((await runUndoCommand(['execute', preview.receipt.operationId, '0'.repeat(64), '--execute'], current)).report!.facts.status).toBe('blocked');
    expect(fs.readFileSync(a, 'utf8')).toBe('new-a\n');
    const context = new Proxy({} as CommandContext, { get: () => { throw new Error('Must not read context'); } });
    for (const invalid of [['extra'], ['execute'], ['status', '../escape'], [...args, '--force'], ['preview', '--execute']]) {
      expect((await runUndoCommand(invalid, context)).output).toContain('Invalid /undo arguments:');
    }
    expect((await runUndoCommand([...args, '--execute'], current)).report!.facts.status).toBe('restored-verified');
    expect(fs.readFileSync(a, 'utf8')).toBe('old-a\n');
  });

  it.each(['denied-after-first', 'writer-error'])('keeps %s per-file results durable and visible after reopening', async kind => {
    await commit(); let config = {} as RuntimeConfig;
    current = { ...current, readConfiguration: () => ({ config, catalog: [] }) };
    const preview = (await prepareUndo(current)).preview!;
    const rename = fs.renameSync;
    vi.spyOn(fs, 'renameSync').mockImplementation((source, destination) => {
      if (kind === 'writer-error' && String(destination).endsWith('/b.txt')) throw new Error('undo EIO');
      const result = rename(source, destination);
      if (kind === 'denied-after-first' && String(destination).endsWith('/a.txt')) config = { ...config, denyRules: [{ tool: 'write', pattern: 'b.txt' }] };
      return result;
    });
    const result = await executeUndo(host(), preview, true);
    expect(result.result.status).toBe(kind === 'writer-error' ? 'unknown' : 'partial');
    expect(fs.readFileSync(a, 'utf8')).toBe('old-a\n'); expect(fs.readFileSync(b, 'utf8')).toBe('new-b\n');
    const restarted = receipts()[0]!; expect(restarted.undo).toBe(result.result.status);
    expect(restarted.files[0]!.undo).toBe('restored-verified');
    const status = await runUndoCommand(['status', restarted.operationId], current);
    expect(status.output).toContain('undo: '+result.result.status); expect(status.output).toContain(a); expect(status.output).toContain(b);
    const next = await prepareUndo(current); expect(next.preview!.receipt.operationId).toBe(restarted.operationId); expect(next.preview!.canRestore).toBe(false);
  });

  it('keeps verified restore truth when publishing model context fails', async () => {
    await commit(); const preview = (await prepareUndo(current)).preview!;
    const outcome = await executeUndo(host({ publish: () => { throw new Error('session EIO'); } }), preview, true);
    expect(outcome.result.status).toBe('restored-verified'); expect(outcome.warning).toContain('model context update could not be confirmed');
    expect(receipts()[0]!.undo).toBe('restored-verified'); expect(fs.readFileSync(a, 'utf8')).toBe('old-a\n');
  });

  it('shows an actual late-file change in a labelled bounded preview', async () => {
    const prefix = 'unchanged line\n'.repeat(6000);
    fs.writeFileSync(a, prefix + 'old-a\n');
    await commit(patch(update('a.txt', 'old-a', 'new-a')));
    const report = (await runUndoCommand(['preview'], current)).output;
    expect(report).toContain('Diff excerpt around the first change');
    expect(report).toContain('-"new-a"'); expect(report).toContain('+"old-a"');
    expect(report).toContain('later changes may be omitted'); expect(Buffer.byteLength(report)).toBeLessThan(64 * 1024);
  });

  it('renders the durable direct undo result when saving model context fails', async () => {
    await commit(); const preview = (await prepareUndo(current)).preview!;
    const renderer = new StreamingRenderer(); const report = vi.spyOn(renderer, 'renderReport').mockImplementation(() => {});
    const line = vi.spyOn(renderer, 'renderLine').mockImplementation(() => {});
    await expect(buildCliCommandExecution({ prompt: '/undo execute', cwd: directory, sessionId: current.sessionId,
      renderer, printMode: true, interactive: false, onTurnMessage: () => { throw new Error('PRIVATE_SESSION_EIO'); } },
      { routeSlashCommand: async () => runUndoCommand(['execute', preview.receipt.operationId, preview.revision, '--execute'], current) })).resolves.toEqual({ kind: 'handled' });
    expect(report.mock.calls[0]![0].facts.status).toBe('restored-verified');
    expect(line).toHaveBeenCalledWith('File results remain in the operation receipt; the model context update could not be confirmed.');
    expect(line.mock.calls.flat().join(' ')).not.toContain('PRIVATE_SESSION_EIO');
    expect(receipts()[0]!.undo).toBe('restored-verified'); expect(fs.readFileSync(a, 'utf8')).toBe('old-a\n');
  });
});
