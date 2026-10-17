import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, expect, it } from 'vitest';
import { createProfileContext, withProfile, type ProfileContext } from '../../../core/paths/profile/context.js';
import { defaultLedgerRoot } from '../../../core/commands/restoreCommandRuntime.js';
import { createDefaultExecutionService } from '../../../runtime/execution/service.js';
import { inspectWorkspaceFile } from '../../authority/state.js';
import { buildEditSnapshotStoreConfig } from '../editSnapshot.js';
import { captureOperationScope, operationLedgerRoot, readOperations } from './store.js';
import { commitOperation, prepareOperation } from './write.js';

let home: string;
let workspace: string;
let target: string;
let a: ProfileContext;
let b: ProfileContext;
beforeEach(() => {
  home = fs.mkdtempSync(path.join(os.tmpdir(), 'profile-recovery-'));
  workspace = path.join(home, 'workspace'); fs.mkdirSync(workspace);
  target = path.join(workspace, 'note.txt'); fs.writeFileSync(target, '\ufeffbefore\r\n');
  a = createProfileContext({ name: 'a', homeDir: home, env: {} });
  b = createProfileContext({ name: 'b', homeDir: home, env: {} });
});
afterEach(() => fs.rmSync(home, { recursive: true, force: true }));
const identity = () => ({ workspaceRoot: workspace, sessionId: 'same', callId: 'same-call' });
const scope = () => captureOperationScope(identity());
const prepare = () => prepareOperation(identity(), [{ workspaceRoot: workspace, relativePath: 'note.txt',
  before: inspectWorkspaceFile(workspace, 'note.txt'), content: 'after\n' }]);

it('isolates actual edit receipts with equal workspace, session and call identities', async () => {
  const edit = (profile: ProfileContext, content: string) => withProfile(profile, () => createDefaultExecutionService().writeTextFile({
    workspaceRoot: workspace, absolutePath: target, operationKind: 'file.write', content, caller: 'test', reason: 'approved synthetic edit',
    authority: { mode: 'approved-for-write', source: 'tool-runtime-approval', reason: 'approved synthetic edit' }, editIdentity: identity(),
  }));
  await edit(a, 'A\n');
  expect(withProfile(b, () => readOperations(scope()))).toEqual([]);
  await edit(b, 'B\n');
  const first = withProfile(a, () => readOperations(scope()));
  const second = withProfile(b, () => readOperations(scope()));
  expect(first).toHaveLength(1); expect(second).toHaveLength(1);
  expect(first[0]).toMatchObject({ status: 'committed', sequence: 1, profile: { id: 'a', root: a.root } });
  expect(second[0]).toMatchObject({ status: 'committed', sequence: 1, profile: { id: 'b', root: b.root } });
  expect(first[0]!.operationId).not.toBe(second[0]!.operationId);
  expect(fs.existsSync(path.join(workspace, '.sisyphus'))).toBe(false);
});

it('uses the same private snapshot root for writer, undo ledger and restore selector', () => {
  withProfile(a, () => {
    const root = operationLedgerRoot(scope());
    expect(defaultLedgerRoot(workspace)).toBe(root);
    expect(buildEditSnapshotStoreConfig({ workspaceRoot: workspace, targetPath: 'note.txt' }).ledgerRoot).toBe(root);
    expect(root.startsWith(a.root + path.sep)).toBe(true);
  });
  const legacy = path.join(workspace, '.sisyphus', 'edit-snapshots');
  expect(defaultLedgerRoot(workspace)).toBe(legacy);
  expect(buildEditSnapshotStoreConfig({ workspaceRoot: workspace, targetPath: 'note.txt' }).ledgerRoot).toBe(legacy);
});

it('keeps a prepared edit on its captured profile when a different scope becomes active', async () => {
  const prepared = await withProfile(a, prepare);
  const receipt = withProfile(b, () => commitOperation(prepared));
  expect(receipt.profile?.root).toBe(a.root);
  expect(withProfile(a, () => readOperations(scope()))).toHaveLength(1);
  expect(withProfile(b, () => readOperations(scope()))).toEqual([]);
});

it('rejects a replaced captured profile before writing the prepared workspace edit', async () => {
  const prepared = await withProfile(a, prepare);
  fs.renameSync(a.root, `${a.root}-retired`); fs.mkdirSync(a.root);
  expect(() => commitOperation(prepared)).toThrow('changed identity');
  expect(fs.readFileSync(target, 'utf8')).toBe('\ufeffbefore\r\n');
  expect(fs.readdirSync(a.root)).toEqual([]);
  expect(withProfile(b, () => readOperations(scope()))).toEqual([]);
});
