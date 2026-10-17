import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { executeToolBatch } from '../../core/agent/tools.js';
import { captureWorkspaceRoot } from '../../core/workspace/roots.js';
import { adaptTools, createToolHooks, type ToolGateOptions } from '../../turn/tools.js';
import { captureOperationScope, readOperations } from '../recovery/operation/store.js';
import { latestOperation, previewOperation } from '../recovery/operation/preview.js';
import { restoreOperation } from '../recovery/operation/restore.js';
import { createPatchToolDefinition } from './tool.js';
import { applyPatchPlan } from './batch.js';
import { planPatch } from './plan.js';

let root: string;
let workspace: string;
let a: string;
let b: string;
beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'patch-batch-'));
  workspace = path.join(root, 'workspace');
  fs.mkdirSync(workspace);
  a = path.join(workspace, 'a.txt'); b = path.join(workspace, 'b.txt');
  fs.writeFileSync(a, 'before-a\n'); fs.writeFileSync(b, 'before-b\n');
});
afterEach(() => { vi.restoreAllMocks(); fs.rmSync(root, { recursive: true, force: true }); });

const scope = () => captureOperationScope({ sessionId: 'patch-session', workspaceRoot: workspace });
const patch = (...sections: string[]) => ['*** Begin Patch', ...sections, '*** End Patch'].join('\n');
const update = (file: string, before: string, after: string) => `*** Update File: ${file}\n@@\n-${before}\n+${after}`;
const two = () => patch(update('a.txt', 'before-a', 'after-a'), update('b.txt', 'before-b', 'after-b'));

const approveAll = async (prompt: Parameters<NonNullable<ToolGateOptions['escalationPromptHandler']>>[0]) =>
  ({ promptId: prompt.id, decision: 'allow-once' as const, respondedAt: Date.now(),
    ...(prompt.context.selections?.length ? { selected: prompt.context.selections.map(selection => selection.id) } : {}) });

function setup(overrides: Partial<ToolGateOptions> = {}) {
  const options: ToolGateOptions = { workspaceRoot: workspace, sessionId: 'patch-session', permissionScope: 'ask', emit: () => undefined,
    escalationPromptHandler: approveAll, hooks: { dispatch: async () => ({ decision: 'allow' }) } as never, ...overrides };
  const registry = new Map([['apply_patch', createPatchToolDefinition()]]);
  return { options, tools: adaptTools(registry, options), hooks: createToolHooks(options, registry) };
}

async function run(input: unknown, overrides: Partial<ToolGateOptions> = {}) {
  const { tools, hooks } = setup(overrides);
  return executeToolBatch(tools, { role: 'assistant', content: '' }, [{ name: 'apply_patch', id: 'actual-patch-call', args: { input } }], hooks, 'parallel', undefined, () => undefined);
}

describe('recorded patch batches', () => {
  it('commits mixed operations once, preserves raw shape and executable rename, and undoes the group', async () => {
    fs.writeFileSync(a, '\ufeffheader\r\nbefore-a\r\nlast');
    fs.chmodSync(b, 0o755);
    const doomed = path.join(workspace, 'doomed'); fs.writeFileSync(doomed, 'deleted\n', { mode: 0o750 });
    const result = await run(patch(update('a.txt', 'before-a', 'after-a'), '*** Add File: created.txt\n+created',
      '*** Delete File: doomed', '*** Update File: b.txt\n*** Move to: renamed.txt'));
    expect(result.messages[0]?.content).toContain(': committed.');
    expect(fs.readFileSync(a, 'utf8')).toBe('\ufeffheader\r\nafter-a\r\nlast');
    expect(fs.statSync(path.join(workspace, 'renamed.txt')).mode & 0o777).toBe(0o755);
    expect(fs.existsSync(b)).toBe(false); expect(fs.existsSync(doomed)).toBe(false);
    const receipts = readOperations(scope()); expect(receipts).toHaveLength(1);
    expect(receipts[0]).toMatchObject({ callId: 'actual-patch-call', status: 'committed' });
    expect(receipts[0]!.files).toHaveLength(5);
    const preview = await previewOperation(receipts[0]!);
    expect(preview.canRestore).toBe(true);
    expect((await restoreOperation(preview, { operationId: receipts[0]!.operationId, sessionId: 'patch-session', workspaceIdentity: scope().workspace.identity, revision: preview.revision })).status).toBe('restored-verified');
    expect(fs.readFileSync(a, 'utf8')).toBe('\ufeffheader\r\nbefore-a\r\nlast');
    expect(fs.statSync(b).mode & 0o777).toBe(0o755); expect(fs.statSync(doomed).mode & 0o777).toBe(0o750);
    expect(fs.existsSync(path.join(workspace, 'created.txt'))).toBe(false);
    expect(fs.existsSync(path.join(workspace, 'renamed.txt'))).toBe(false);
  });

  it('applies only the selected group and keeps the other file untouched', async () => {
    const tool = createPatchToolDefinition();
    const context = { workspaceRoot: workspace, sessionId: 'patch-session', taskId: 'selection-call' } as never;
    const prepared = tool.prepare!({ input: two() }, context) as import('../../tools/types.js').ToolPreparation;
    expect(prepared.selections).toHaveLength(2);
    const onlyA = prepared.selections!.find(selection => selection.label === 'Update a.txt (1 hunk)')!;
    const result = await prepared.execute(context, [onlyA.id]);
    expect(result.success).toBe(true);
    expect(fs.readFileSync(a, 'utf8')).toBe('after-a\n');
    expect(fs.readFileSync(b, 'utf8')).toBe('before-b\n');
    const receipts = readOperations(scope());
    expect(receipts).toHaveLength(1);
    expect(receipts[0]!.files).toHaveLength(1);
  });

  it('refuses a multi-group patch when the host collected no selection', async () => {
    const result = await run(two(), { permissionScope: 'allow-all', escalationPromptHandler: undefined });
    expect(result.messages[0]?.content).not.toContain(': committed.');
    expect(fs.readFileSync(a, 'utf8')).toBe('before-a\n');
    expect(fs.readFileSync(b, 'utf8')).toBe('before-b\n');
  });

  it.each(['missing-source', 'duplicate-path', 'case-alias', 'parent-alias', 'hardlink-alias', 'ambiguous-context', 'invalid-protocol'])('fails full preflight with zero target writes for %s', async kind => {
    let input = two();
    if (kind === 'missing-source') input = patch(update('a.txt', 'before-a', 'after-a'), '*** Delete File: missing');
    if (kind === 'duplicate-path') input = patch(update('a.txt', 'before-a', 'after-a'), '*** Delete File: ./a.txt');
    if (kind === 'case-alias') input = patch('*** Add File: new\n+one', '*** Add File: NEW\n+two');
    if (kind === 'parent-alias') input = patch('*** Add File: new\n+one', '*** Add File: New/child\n+two');
    if (kind === 'hardlink-alias') { fs.linkSync(a, path.join(workspace, 'alias')); input = patch('*** Delete File: a.txt', '*** Delete File: alias'); }
    if (kind === 'ambiguous-context') { fs.writeFileSync(a, 'same\nsame\n'); input = patch(update('a.txt', 'same', 'changed')); }
    if (kind === 'invalid-protocol') input = input + '\nunknown directive';
    const before = fs.readFileSync(a, 'utf8');
    const handler = vi.fn();
    const result = await run(input, { permissionScope: 'ask', escalationPromptHandler: handler });
    expect(result.messages[0]?.content).not.toContain(': committed.');
    expect(fs.readFileSync(a, 'utf8')).toBe(before); expect(fs.readFileSync(b, 'utf8')).toBe('before-b\n');
    expect(readOperations(scope())).toEqual([]); expect(handler).not.toHaveBeenCalled();
  });

  it.each(['read', 'write', 'edit', 'apply_patch'])('enforces %s denial for every endpoint before reading and asking', async tool => {
    const handler = vi.fn();
    const opened = vi.spyOn(fs, 'openSync');
    const result = await run(two(), { permissionScope: 'ask', escalationPromptHandler: handler, denyRules: [{ tool, pattern: 'b.txt' }] });
    expect(result.messages[0]?.content).toContain('Refused by a rule');
    expect(opened.mock.calls.some(args => String(args[0]) === b)).toBe(false);
    expect(handler).not.toHaveBeenCalled(); expect(fs.readFileSync(a, 'utf8')).toBe('before-a\n'); expect(readOperations(scope())).toEqual([]);
  });

  it('binds one full approval to the original immutable plan and blocks a later changed target', async () => {
    const handler = vi.fn(async (prompt) => {
      expect(prompt.message).toContain(a); expect(prompt.message).toContain(b); expect(prompt.message).toContain('Revision:');
      expect(prompt.message).toContain('-"before-a"'); expect(prompt.message).toContain('+"after-b"');
      fs.writeFileSync(b, 'external\n');
      return { promptId: prompt.id, decision: 'allow-once' as const, respondedAt: 1,
        selected: prompt.context.selections!.map(selection => selection.id) };
    });
    const result = await run(two(), { permissionScope: 'ask', escalationPromptHandler: handler });
    expect(handler).toHaveBeenCalledOnce(); expect(result.messages[0]?.content).toContain('changed after approval');
    expect(fs.readFileSync(a, 'utf8')).toBe('before-a\n'); expect(fs.readFileSync(b, 'utf8')).toBe('external\n');
    expect(readOperations(scope())).toEqual([]);
  });

  it('consumes only the authorized call capability and refuses clones, unapproved calls and replay', async () => {
    const { tools, hooks } = setup(); const tool = tools[0]!;
    const original = tool.prepareArguments!({ input: two() });
    expect((await tool.execute('unapproved', original)).isError).toBe(true);
    const args = tool.prepareArguments!({ input: two() });
    expect(Object.isFrozen(args)).toBe(true);
    await hooks.beforeToolCall!({ assistantMessage: { role: 'assistant', content: '' }, call: { id: 'approved', name: 'apply_patch', args }, args });
    expect((await tool.execute('approved', { ...args })).isError).toBe(true);
    expect(fs.readFileSync(a, 'utf8')).toBe('before-a\n');
    expect((await tool.execute('approved', args)).isError).toBe(false);
    expect((await tool.execute('approved', args)).isError).toBe(true);
    expect(readOperations(scope())).toHaveLength(1);
  });

  it('refuses to undo a later permission change even when the text still matches', async () => {
    fs.chmodSync(a, 0o755);
    await run(patch(update('a.txt', 'before-a', 'after-a')));
    const receipt = latestOperation(scope())!;
    expect(receipt.files[0]!.after).toMatchObject({ mode: 0o755 });
    fs.chmodSync(a, 0o644);
    const preview = await previewOperation(receipt);
    expect(preview.canRestore).toBe(false);
    expect((await restoreOperation(preview, { operationId: receipt.operationId, sessionId: 'patch-session', workspaceIdentity: scope().workspace.identity, revision: preview.revision })).status).toBe('blocked');
    expect(fs.readFileSync(a, 'utf8')).toBe('after-a\n'); expect(fs.statSync(a).mode & 0o777).toBe(0o644);
  });

  it.each(['changed-content', 'same-content-new-identity'])('preserves %s external edits when the next writer fails', async actor => {
    const rename = fs.renameSync;
    vi.spyOn(fs, 'renameSync').mockImplementation((source, destination) => {
      if (String(destination).endsWith('/b.txt')) {
        if (actor === 'same-content-new-identity') { rename(a, a + '-previous'); fs.writeFileSync(a, 'after-a\n'); }
        else fs.writeFileSync(a, 'external\n');
        throw new Error('EIO');
      }
      return rename(source, destination);
    });
    const result = await run(two());
    expect(result.messages[0]?.content).toContain(': partial.');
    expect(fs.readFileSync(a, 'utf8')).toBe(actor === 'changed-content' ? 'external\n' : 'after-a\n');
    expect(fs.readFileSync(b, 'utf8')).toBe('before-b\n');
    const restarted = latestOperation(captureOperationScope({ sessionId: 'patch-session', workspaceRoot: workspace }))!;
    expect(restarted).toMatchObject({ status: 'partial', files: [{ status: 'committed', compensation: 'blocked' }, { status: 'unchanged' }] });
    expect((await previewOperation(restarted)).canRestore).toBe(false);
  });

  it('verifies reverse compensation and restores an executable deleted source without forgetting the writes', async () => {
    fs.chmodSync(a, 0o755);
    const rename = fs.renameSync;
    vi.spyOn(fs, 'renameSync').mockImplementation((source, destination) => {
      if (String(destination).endsWith('/b.txt')) throw new Error('EIO');
      return rename(source, destination);
    });
    const result = await run(patch('*** Delete File: a.txt', update('b.txt', 'before-b', 'after-b')));
    expect(result.messages[0]?.content).toContain(': restored.');
    expect(fs.readFileSync(a, 'utf8')).toBe('before-a\n'); expect(fs.statSync(a).mode & 0o777).toBe(0o755);
    expect(latestOperation(scope())).toBeUndefined();
    expect(readOperations(scope())[0]!.files[0]).toMatchObject({ status: 'committed', compensation: 'restored-verified' });
  });

  it('blocks all target writes when a required snapshot cannot be published', async () => {
    const link = fs.linkSync;
    vi.spyOn(fs, 'linkSync').mockImplementation((source, destination) => {
      if (String(destination).endsWith('.content')) throw new Error('snapshot EIO');
      return link(source, destination);
    });
    expect((await run(two())).messages[0]?.content).toContain('snapshot could not be saved');
    expect(fs.readFileSync(a, 'utf8')).toBe('before-a\n'); expect(fs.readFileSync(b, 'utf8')).toBe('before-b\n');
    expect(readOperations(scope())).toEqual([]);
  });

  it('rechecks every target after snapshot persistence before publishing the first file', async () => {
    const link = fs.linkSync;
    vi.spyOn(fs, 'linkSync').mockImplementation((source, destination) => {
      const result = link(source, destination);
      if (String(destination).endsWith('.content')) fs.writeFileSync(b, 'external\n');
      return result;
    });
    const rename = vi.spyOn(fs, 'renameSync');
    expect((await run(two())).messages[0]?.content).toContain('batch changed');
    expect(rename.mock.calls.some(args => String(args[1]).endsWith('/a.txt'))).toBe(false);
    expect(fs.readFileSync(a, 'utf8')).toBe('before-a\n'); expect(fs.readFileSync(b, 'utf8')).toBe('external\n');
    expect(readOperations(scope())).toEqual([]);
  });

  it.each(['approval', 'snapshot', 'before-publication', 'readback'])('keeps patch rereads bounded after %s source growth', async phase => {
    let grown = false; let unboundedTargetReads = 0; let oversizedBytesRead = 0;
    const target = phase === 'approval' || phase === 'snapshot' ? b : a;
    const grow = () => { fs.truncateSync(target, 2 * 1024 * 1024); grown = true; };
    const readFile = fs.readFileSync; const read = fs.readSync;
    vi.spyOn(fs, 'readFileSync').mockImplementation((...args: Parameters<typeof fs.readFileSync>) => {
      if (typeof args[0] === 'number' && fs.fstatSync(args[0]).ino === fs.statSync(target).ino) unboundedTargetReads++;
      return readFile(...args);
    });
    vi.spyOn(fs, 'readSync').mockImplementation((...args: Parameters<typeof fs.readSync>) => {
      const count = read(...args);
      if (fs.fstatSync(args[0]).ino === fs.statSync(target).ino && grown) oversizedBytesRead += count;
      return count;
    });
    if (phase === 'snapshot') {
      const link = fs.linkSync;
      vi.spyOn(fs, 'linkSync').mockImplementation((source, destination) => {
        const result = link(source, destination);
        if (String(destination).endsWith('.content')) grow();
        return result;
      });
    }
    if (phase === 'before-publication') {
      const sync = fs.fsyncSync;
      vi.spyOn(fs, 'fsyncSync').mockImplementation(fd => {
        sync(fd);
        if (!grown && fs.fstatSync(fd).isFile() && fs.readlinkSync(`/proc/self/fd/${fd}`).startsWith(path.join(workspace, '.edit-'))) grow();
      });
    }
    if (phase === 'readback') {
      const rename = fs.renameSync;
      vi.spyOn(fs, 'renameSync').mockImplementation((source, destination) => {
        const result = rename(source, destination);
        if (String(destination).endsWith('/a.txt')) grow();
        return result;
      });
    }
    const result = await run(two(), phase === 'approval' ? { permissionScope: 'ask', escalationPromptHandler: async prompt => {
      grow(); return { promptId: prompt.id, decision: 'allow-once', respondedAt: 1 };
    } } : {});
    expect(grown).toBe(true);
    expect(result.messages[0]?.content).not.toContain(': committed.');
    expect(unboundedTargetReads).toBe(0); expect(oversizedBytesRead).toBe(0);
    expect(fs.statSync(target).size).toBe(2 * 1024 * 1024);
    if (phase === 'approval' || phase === 'snapshot') {
      expect(readOperations(scope())).toEqual([]);
      expect(fs.readFileSync(a, 'utf8')).toBe('before-a\n');
    } else {
      expect(result.messages[0]?.content).toContain(': unknown.');
      expect(readOperations(scope())[0]?.status).toBe('unknown');
      expect(fs.readFileSync(b, 'utf8')).toBe('before-b\n');
    }
  });

  it('retains an interrupted intent and unknown outcome if receipt publication fails after a file commit', async () => {
    const rename = fs.renameSync;
    vi.spyOn(fs, 'renameSync').mockImplementation((source, destination) => {
      if (/op-[^/]+\.json$/.test(String(destination)) && fs.readFileSync(a, 'utf8') === 'after-a\n') throw new Error('receipt EIO');
      return rename(source, destination);
    });
    expect((await run(two())).messages[0]?.content).toContain(': unknown.');
    expect(fs.readFileSync(a, 'utf8')).toBe('after-a\n'); expect(fs.readFileSync(b, 'utf8')).toBe('before-b\n');
    const restarted = latestOperation(scope())!; expect(restarted.status).toBe('intent');
    expect((await previewOperation(restarted)).blockers).toContain('operation-unknown');
  });

  it('coordinates opposite complete target orders and refuses read grants, symlinks, binary and oversized targets', async () => {
    const context = { sessionId: 'patch-session', workspaceRoot: workspace };
    const one = planPatch(two(), context);
    const other = planPatch(patch(update('b.txt', 'before-b', 'other-b'), update('a.txt', 'before-a', 'other-a')), context);
    const results = await Promise.allSettled([applyPatchPlan(one, { ...context, callId: 'one' }), applyPatchPlan(other, { ...context, callId: 'other' })]);
    expect(results.filter(result => result.status === 'fulfilled')).toHaveLength(1); expect(readOperations(scope())).toHaveLength(1);
    const extra = path.join(root, 'extra'); fs.mkdirSync(extra); fs.writeFileSync(path.join(extra, 'file'), 'extra');
    expect(() => planPatch(patch('*** Delete File: ' + path.join(extra, 'file')), { ...context, workspaceRoots: [captureWorkspaceRoot(extra, workspace, 'read')] })).toThrow();
    fs.symlinkSync(path.join(extra, 'file'), path.join(workspace, 'link'));
    expect(() => planPatch(patch('*** Delete File: link'), context)).toThrow();
    fs.writeFileSync(path.join(workspace, 'binary'), 'a\0b');
    expect(() => planPatch(patch('*** Delete File: binary'), context)).toThrow('Binary');
    fs.writeFileSync(path.join(workspace, 'large'), 'x'.repeat(1024 * 1024 + 1));
    expect(() => planPatch(patch('*** Delete File: large'), context)).toThrow('size limit');
  });
});
