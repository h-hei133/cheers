import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { syncBuiltinESMExports } from 'node:module';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { hashContent, captureRecoveryAuthorityRecord } from '../recoveryAuthorityStore.js';
import { inspectWorkspaceFile } from '../../authority/state.js';
import { commitWorkspaceFile } from '../../authority/commit.js';
import { captureOperationScope, operationLedgerRoot, persistOperation, readOperation, readOperations, withOperationStore } from './store.js';
import { commitOperation, prepareOperation } from './write.js';
import { latestOperation, previewOperation, type UndoPreview } from './preview.js';
import { restoreOperation } from './restore.js';
import { createDefaultExecutionService } from '../../../runtime/execution/service.js';
import { createCoreToolRegistry } from '../../../core/tools/registry.js';
import { restoreRecoveryAuthorityRecord } from '../restorePrimitive.js';

let root: string;
let workspace: string;
let target: string;
beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'edit-operation-'));
  workspace = path.join(root, 'workspace');
  fs.mkdirSync(workspace);
  target = path.join(workspace, 'note.txt');
  fs.writeFileSync(target, '\ufeffbefore\r\n');
});
afterEach(() => { vi.restoreAllMocks(); syncBuiltinESMExports(); fs.rmSync(root, { recursive: true, force: true }); });

const identity = () => ({ sessionId: 'session-a', workspaceRoot: workspace, callId: 'call-a' });
const scope = () => captureOperationScope(identity());
const approve = (preview: UndoPreview) => ({ operationId: preview.receipt.operationId, sessionId: preview.receipt.sessionId,
  workspaceIdentity: preview.receipt.workspace.identity, revision: preview.revision });
async function edit(content = 'after\n', sessionId = 'session-a') {
  await createDefaultExecutionService().writeTextFile({ operationKind: 'file.write', workspaceRoot: workspace, absolutePath: target,
    authority: { mode: 'approved-for-write', source: 'tool-runtime-approval', reason: 'approved fixture' },
    caller: 'test', reason: 'test', content, editIdentity: { ...identity(), sessionId } });
  return latestOperation(captureOperationScope({ ...identity(), sessionId }))!;
}

describe('committed edit operations', () => {
  it('carries actual tool-call/session identity through an additional write root', async () => {
    const extra = path.join(root, 'extra');
    fs.mkdirSync(extra);
    const result = await createCoreToolRegistry().get('write')!.execute({ path: 'created.txt', content: 'created' },
      { workspaceRoot: extra, artifactRoot: workspace, sessionId: 'session-a', taskId: 'actual-tool-call' });
    expect(result.success).toBe(true);
    const receipt = latestOperation(scope())!;
    expect(receipt).toMatchObject({ callId: 'actual-tool-call', workspace: { path: workspace }, status: 'committed' });
    expect(receipt.files[0]).toMatchObject({ workspace: { path: extra }, path: 'created.txt', kind: 'create' });
    expect((await previewOperation(receipt)).canRestore).toBe(false);
  });
  it('does not admit a captured but unwritten snapshot or an unowned record', async () => {
    await prepareOperation(identity(), [{ workspaceRoot: workspace, relativePath: 'note.txt', before: inspectWorkspaceFile(workspace, 'note.txt'), content: 'after' }]);
    expect(latestOperation(scope())).toBeUndefined();
    expect(fs.readFileSync(target, 'utf8')).toBe('\ufeffbefore\r\n');
    expect(fs.existsSync(path.join(operationLedgerRoot(scope()), 'operations'))).toBe(false);
  });

  it('records session, workspace, call, exact hashes and verified commit order', async () => {
    const first = await edit();
    const second = await edit('second\n');
    expect(first).toMatchObject({ status: 'committed', undo: 'none', sessionId: 'session-a', callId: 'call-a', sequence: 1 });
    expect(first.files[0]).toMatchObject({ before: { state: 'exists', hash: hashContent('\ufeffbefore\r\n') },
      after: { state: 'exists', hash: hashContent('after\n') }, status: 'committed' });
    expect(second.sequence).toBe(2);
    expect(readOperations(scope()).map(entry => entry.operationId)).toEqual([second.operationId, first.operationId]);
  });

  it('requires the operation receipt for owned snapshots and refuses another workspace', async () => {
    const receipt = await edit();
    const file = receipt.files[0]!;
    const request = { ledgerRoot: operationLedgerRoot(scope()), ...file.snapshot, workspaceRoot: workspace, workspaceRelativePath: file.path };
    expect(await restoreRecoveryAuthorityRecord(request)).toMatchObject({ restored: false, blockedReason: 'operation-receipt-required' });
    const other = path.join(root, 'other');
    fs.mkdirSync(other);
    fs.writeFileSync(path.join(other, 'note.txt'), 'after\n');
    expect(await restoreRecoveryAuthorityRecord({ ...request, workspaceRoot: other })).toMatchObject({ restored: false, blockedReason: 'workspace-boundary' });
    expect(fs.readFileSync(target, 'utf8')).toBe('after\n');
    expect(fs.readFileSync(path.join(other, 'note.txt'), 'utf8')).toBe('after\n');
  });

  it('isolates session history and leaves a no-op out of the undo stack', async () => {
    await edit('after', 'session-b');
    expect(latestOperation(scope())).toBeUndefined();
    const receipt = await edit('next');
    await edit('next');
    expect(readOperations(scope())).toHaveLength(1);
    expect(latestOperation(scope())!.operationId).toBe(receipt.operationId);
  });

  it('requires the exact approved preview and restores raw BOM/CRLF once', async () => {
    const receipt = await edit();
    const preview = await previewOperation(receipt);
    expect(preview.canRestore).toBe(true);
    expect((await restoreOperation(preview, undefined)).status).toBe('denied');
    expect((await restoreOperation(preview, { ...approve(preview), sessionId: 'session-b' })).status).toBe('denied');
    expect(fs.readFileSync(target, 'utf8')).toBe('after\n');
    expect((await restoreOperation(preview, approve(preview))).status).toBe('restored-verified');
    expect(fs.readFileSync(target, 'utf8')).toBe('\ufeffbefore\r\n');
    expect(readOperation(scope(), receipt.operationId).undo).toBe('restored-verified');
    expect(latestOperation(scope())).toBeUndefined();
    expect((await restoreOperation(preview, approve(preview))).status).toBe('blocked');
  });

  it('refuses an external edit or newer operation after preview without overwriting either', async () => {
    const receipt = await edit();
    const preview = await previewOperation(receipt);
    fs.writeFileSync(target, 'external');
    expect((await restoreOperation(preview, approve(preview))).status).toBe('blocked');
    expect(fs.readFileSync(target, 'utf8')).toBe('external');
    fs.writeFileSync(target, 'after\n');
    const fresh = await previewOperation(receipt);
    await edit('newer');
    expect((await restoreOperation(fresh, approve(fresh))).status).toBe('blocked');
    expect(fs.readFileSync(target, 'utf8')).toBe('newer');
  });

  it('verifies blobs again after approval and leaves damaged snapshots inspectable', async () => {
    const receipt = await edit();
    const preview = await previewOperation(receipt);
    const blob = path.join(operationLedgerRoot(scope()), receipt.operationId, 'blobs', `${hashContent('\ufeffbefore\r\n')}.content`);
    fs.writeFileSync(blob, 'X'.repeat(Buffer.byteLength('\ufeffbefore\r\n')));
    expect((await previewOperation(receipt)).canRestore).toBe(false);
    expect((await restoreOperation(preview, approve(preview))).status).toBe('blocked');
    expect(fs.readFileSync(target, 'utf8')).toBe('after\n');
  });

  it('refuses target symlinks after approval and preserves their outside target', async () => {
    const receipt = await edit();
    const preview = await previewOperation(receipt);
    const outside = path.join(root, 'outside');
    fs.writeFileSync(outside, 'outside');
    fs.unlinkSync(target);
    fs.symlinkSync(outside, target);
    expect((await restoreOperation(preview, approve(preview))).status).toBe('blocked');
    expect(fs.readFileSync(outside, 'utf8')).toBe('outside');
  });

  it('does not follow a preplanted snapshot blob or record symlink', async () => {
    const ledgerRoot = operationLedgerRoot(scope());
    const authorityId = 'fixture';
    const outside = path.join(root, 'outside');
    fs.writeFileSync(outside, 'outside');
    fs.mkdirSync(path.join(ledgerRoot, authorityId, 'blobs'), { recursive: true });
    fs.symlinkSync(outside, path.join(ledgerRoot, authorityId, 'blobs', `${hashContent('before')}.content`));
    const input = { mode: 'non-default' as const, ledgerRoot, authorityId, recordId: 'file', workspaceRelativePath: 'note.txt',
      operationKind: 'update' as const, beforeState: 'exists' as const, beforeContent: 'before', expectedCurrentState: 'exists' as const, expectedCurrentContent: 'after' };
    expect((await captureRecoveryAuthorityRecord(input)).status).toBe('blocked');
    fs.unlinkSync(path.join(ledgerRoot, authorityId, 'blobs', `${hashContent('before')}.content`));
    fs.mkdirSync(path.join(ledgerRoot, authorityId, 'records'), { recursive: true });
    fs.symlinkSync(outside, path.join(ledgerRoot, authorityId, 'records', 'file.json'));
    expect((await captureRecoveryAuthorityRecord(input)).status).toBe('blocked');
    expect(fs.readFileSync(outside, 'utf8')).toBe('outside');
  });

  it('does not overwrite a target changed by the final access callback', () => {
    let changed = false;
    expect(() => commitWorkspaceFile({ workspaceRoot: workspace, relativePath: 'note.txt', expected: inspectWorkspaceFile(workspace, 'note.txt'), content: 'after',
      assertFileAccess: () => {
        if (!changed && fs.readdirSync(workspace).some(name => name.startsWith('.edit-'))) {
          changed = true;
          fs.writeFileSync(target, 'external');
        }
      } })).toThrow('changed');
    expect(changed).toBe(true);
    expect(fs.readFileSync(target, 'utf8')).toBe('external');
  });

  it('rejects a replaced additional root even when its target inode is preserved', async () => {
    const extra = path.join(root, 'extra');
    fs.mkdirSync(extra);
    fs.writeFileSync(path.join(extra, 'note.txt'), 'before');
    const prepared = await prepareOperation(identity(), [{ workspaceRoot: extra, relativePath: 'note.txt', before: inspectWorkspaceFile(extra, 'note.txt'), content: 'after' }]);
    fs.renameSync(extra, extra + '-old');
    fs.mkdirSync(extra);
    fs.linkSync(path.join(extra + '-old', 'note.txt'), path.join(extra, 'note.txt'));
    expect(() => commitOperation(prepared)).toThrow();
    expect(fs.readFileSync(path.join(extra, 'note.txt'), 'utf8')).toBe('before');
  });

  it('keeps crash intents visible as unknown barriers and never replays their writes', async () => {
    await edit();
    const latest = await edit('uncertain');
    withOperationStore(latest, () => persistOperation({ ...latest, status: 'intent', revision: latest.revision + 1 }));
    const restarted = latestOperation(captureOperationScope(identity()))!;
    expect(restarted.operationId).toBe(latest.operationId);
    const preview = await previewOperation(restarted);
    expect(preview.blockers).toContain('operation-unknown');
    expect((await restoreOperation(preview, approve(preview))).status).toBe('blocked');
    expect(fs.readFileSync(target, 'utf8')).toBe('uncertain');
  });

  it('refuses a missing index instead of forgetting history or resetting order', async () => {
    await edit();
    const dir = path.join(operationLedgerRoot(scope()), 'operations');
    const namespace = fs.readdirSync(dir)[0]!;
    fs.unlinkSync(path.join(dir, namespace, 'index.json'));
    expect(() => latestOperation(scope())).toThrow('index is missing');
    await expect(edit('next')).rejects.toThrow('index is missing');
    expect(fs.readFileSync(target, 'utf8')).toBe('after\n');
  });

  it.skipIf(process.platform !== 'linux')('pins the store lock when its directory is replaced before opening', async () => {
    const outside = path.join(root, 'outside');
    fs.mkdirSync(outside);
    const prepared = await prepareOperation(identity(), [{ workspaceRoot: workspace, relativePath: 'note.txt',
      before: inspectWorkspaceFile(workspace, 'note.txt'), content: 'after' }]);
    const open = fs.openSync;
    const write = fs.writeFileSync;
    let redirected = false;
    let outsideWritten = false;
    vi.spyOn(fs, 'openSync').mockImplementation((...args) => {
      if (!redirected && String(args[0]).endsWith('/store.lock') && args[1] === 'wx') {
        redirected = true;
        const directory = fs.realpathSync(path.dirname(String(args[0])));
        fs.renameSync(directory, directory + '-old');
        fs.symlinkSync(outside, directory, 'dir');
      }
      return open(...args);
    });
    vi.spyOn(fs, 'writeFileSync').mockImplementation((...args) => {
      if (typeof args[0] === 'number' && fs.realpathSync(`/proc/self/fd/${args[0]}`) === path.join(outside, 'store.lock')) outsideWritten = true;
      return write(...args);
    });
    syncBuiltinESMExports();
    expect(() => commitOperation(prepared)).toThrow();
    expect(redirected).toBe(true);
    expect(outsideWritten).toBe(false);
    expect(fs.readFileSync(target, 'utf8')).toBe('\ufeffbefore\r\n');
  });

  it('leaves an interrupted undo intent visible after receipt publication fails', async () => {
    const receipt = await edit();
    const preview = await previewOperation(receipt);
    const rename = fs.renameSync;
    vi.spyOn(fs, 'renameSync').mockImplementation((source, destination) => {
      if (String(destination).endsWith(`${receipt.operationId}.json`) && fs.readFileSync(target, 'utf8') === '\ufeffbefore\r\n') throw new Error('receipt publication failed');
      return rename(source, destination);
    });
    expect((await restoreOperation(preview, approve(preview))).status).toBe('unknown');
    vi.restoreAllMocks();
    const restarted = readOperation(scope(), receipt.operationId);
    expect(restarted.undo).toBe('intent');
    expect((await previewOperation(restarted)).blockers).toContain('undo-unknown');
    expect(fs.readFileSync(target, 'utf8')).toBe('\ufeffbefore\r\n');
  });
});
