import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { afterEach, expect, it, vi } from 'vitest';
import { createLspToolDefinition } from '../core/tools/lsp.js';
import { createDefaultExecutionService } from '../runtime/execution/service.js';
import { createPatchToolDefinition } from '../edit/patch/tool.js';
import { SessionManager } from '../session/SessionManager.js';
import { adaptTools, createToolHooks, type ToolGateOptions } from '../turn/tools.js';
import { evaluateToolPermissionScope, planModeBlock } from '../core/query/toolPolicy.js';
import { renamePlan } from './edits.js';
import { snapshot } from './documents.js';
import { createCoreToolRegistry } from '../core/tools/registry.js';
import { approvalPicker, approvalPreview } from '../cli/interactive/picker/approval.js';
import { languageLimits } from './contract.js';
import { captureWorkspaceRoot } from '../core/workspace/roots.js';

const fixture = fileURLToPath(new URL('./fixtures/server.mjs', import.meta.url));
const sessions = new SessionManager();
const roots: string[] = []; const cleanups: Array<() => Promise<unknown>> = [];
afterEach(async () => { for (const stop of cleanups.splice(0)) await stop(); for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true }); });

function setup(mode = 'normal') {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'language-tool-')); roots.push(root);
  const source = 'export const alpha = 1;\n'; const file = path.join(root, 'one.ts'); fs.writeFileSync(file, source);
  const outsideRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'language-outside-')); roots.push(outsideRoot);
  const outside = path.join(outsideRoot, 'outside.ts'); fs.writeFileSync(outside, source);
  const server = { command: fs.realpathSync(process.execPath), args: [fixture, mode, path.join(root, 'frames.jsonl'), outside] };
  const session = sessions.createNew(root);
  const context = { workspaceRoot: root, taskId: 'language', sessionId: session.id };
  const tool = createLspToolDefinition(createDefaultExecutionService());
  const args = { backend: 'server', server, filePath: 'one.ts', line: 0, character: 14 };
  cleanups.push(() => tool.execute({ ...args, operation: 'shutdown' }, context));
  return { root, file, outside, source, server, session, context, tool, args };
}

function gate(test: ReturnType<typeof setup>, overrides: Partial<ToolGateOptions> = {}): ToolGateOptions {
  return { workspaceRoot: test.root, sessionId: test.session.id, permissionScope: 'ask',
    hooks: { dispatch: async () => ({ decision: 'allow' }) } as never, emit: () => {}, ...overrides };
}

it('requires execute approval including executable, arguments and canonical cwd, while scanner stays read-only in plan mode', async () => {
  const test = setup(); const args = { ...test.args, operation: 'hover' };
  for (const scope of ['ask', 'accept-edits'] as const) {
    const decision = evaluateToolPermissionScope('lsp', args, scope, test.root);
    expect(decision).toMatchObject({ operation: 'execute', requiresEscalation: true });
    expect(decision.target).toContain(test.server.command); expect(decision.target).toContain(fixture); expect(decision.target).toContain(test.root);
  }
  expect(evaluateToolPermissionScope('lsp', { backend: 'scanner' }, 'ask').requiresEscalation).toBe(false);
  expect(planModeBlock('plan', 'lsp', args)).toContain('Blocked');
  expect(planModeBlock('plan', 'lsp', { backend: 'scanner' })).toBeUndefined();
  const handler = vi.fn(async (prompt: { id: string }) => ({ promptId: prompt.id, decision: 'deny' as const, respondedAt: 1 }));
  const options = gate(test, { escalationPromptHandler: handler }); const hooks = createToolHooks(options);
  const refusal = await hooks.beforeToolCall!({ assistantMessage: { role: 'assistant', content: '' }, call: { name: 'lsp', id: 'deny', args }, args });
  expect(refusal?.block).toBe(true); expect(handler).toHaveBeenCalledOnce();
  const prompt = handler.mock.calls[0]![0] as import('../core/shell/approval/contract.js').EscalationPrompt;
  expect(prompt.context.previewKind).toBe('execution'); expect(prompt.context.preview).toContain(test.server.command); expect(prompt.context.preview).toContain(fixture);
  expect(approvalPreview(prompt)?.title).toContain('execution request');
  const picker = approvalPicker(prompt, () => {});
  expect(picker.initialSelection).toBe('deny'); expect(picker.footer).toContain('execute this request');
  expect(fs.existsSync(path.join(test.root, 'frames.jsonl'))).toBe(false);
});

it('reuses one bounded session/project server across independently recreated tool catalogs', async () => {
  const test = setup(); const first = createCoreToolRegistry().get('lsp')!; const second = createCoreToolRegistry().get('lsp')!;
  const started = await first.execute({ ...test.args, operation: 'hover' }, test.context);
  expect(started.success).toBe(true);
  expect((await second.execute({ ...test.args, operation: 'status' }, test.context)).metadata?.status).toBe('ready');
  fs.writeFileSync(test.file, 'export const bravo = 2;\n');
  expect((await second.execute({ ...test.args, operation: 'hover' }, test.context)).metadata?.documentVersion).toBe(2);
  expect((await second.execute({ ...test.args, operation: 'shutdown' }, test.context)).metadata?.status).toBe('stopped');
  const messages = fs.readFileSync(path.join(test.root, 'frames.jsonl'), 'utf8').trim().split('\n').map(line => JSON.parse(line));
  expect(messages.filter(value => value.started)).toHaveLength(1);
});

it('never reuses the old server when the approved project directory is replaced at the same path', async () => {
  const test = setup(); await test.tool.execute({ ...test.args, operation: 'hover' }, test.context);
  const prior = test.root + '-prior'; fs.renameSync(test.root, prior); fs.mkdirSync(test.root);
  try { expect((await test.tool.execute({ ...test.args, operation: 'status' }, test.context)).metadata?.status).toBe('unavailable'); }
  finally { fs.rmSync(test.root, { recursive: true, force: true }); fs.renameSync(prior, test.root); }
  expect((await test.tool.execute({ ...test.args, operation: 'status' }, test.context)).metadata?.status).toBe('ready');
});

it('rejects executable argument changes after the approval round trip before startup', async () => {
  const test = setup(); const args = { ...test.args, operation: 'hover' };
  const options = gate(test, { escalationPromptHandler: async prompt => {
    args.server.args.push('--changed-after-approval'); return { promptId: prompt.id, decision: 'allow-once', respondedAt: 1 };
  } });
  const definitions = new Map([['lsp', test.tool]]); const [tool] = adaptTools(definitions, options); const hooks = createToolHooks(options, definitions);
  expect(await hooks.beforeToolCall!({ assistantMessage: { role: 'assistant', content: '' }, call: { name: 'lsp', id: 'changed', args }, args })).toBeUndefined();
  expect((await tool.execute('changed', args)).isError).toBe(true);
  expect(fs.existsSync(path.join(test.root, 'frames.jsonl'))).toBe(false);
});

it.each(['outside', 'outside-edit'])('rejects %s server targets before returning a result or proposal', async mode => {
  const test = setup(mode);
  const result = await test.tool.execute({ ...test.args, operation: mode === 'outside' ? 'definition' : 'rename', newName: 'bravo' }, test.context);
  expect(result).toMatchObject({ success: false, metadata: { status: 'denied' } });
  expect(result.metadata).not.toHaveProperty('editPlan'); expect(fs.readFileSync(test.outside, 'utf8')).toBe(test.source);
});

it('enforces read deny rules on sources and on returned canonical paths', async () => {
  const test = setup();
  const options = gate(test, { permissionScope: 'allow-all', denyRules: [{ tool: 'read', pattern: 'one.ts' }] });
  const [tool] = adaptTools(new Map([['lsp', test.tool]]), options);
  const result = await tool.execute('denied-source', { ...test.args, operation: 'hover' });
  expect(result.isError).toBe(true); expect(result.output).not.toContain(test.source);
});

it('revalidates a returned path against a granted read root and its current file-deny policy', async () => {
  const test = setup('outside');
  const context = { ...test.context, workspaceRoots: [captureWorkspaceRoot(path.dirname(test.outside), test.root, 'read')],
    assertFileAccess: (file: string) => { if (file === test.outside) throw new Error('synthetic read denial'); } };
  const result = await test.tool.execute({ ...test.args, operation: 'definition' }, context);
  expect(result).toMatchObject({ success: false, metadata: { status: 'denied' } }); expect(result.metadata).not.toHaveProperty('result');
});

it('refuses edits into a read-only granted root before emitting any rename proposal', async () => {
  const test = setup('outside-edit');
  const context = { ...test.context, workspaceRoots: [captureWorkspaceRoot(path.dirname(test.outside), test.root, 'read')] };
  const result = await test.tool.execute({ ...test.args, operation: 'rename', newName: 'bravo' }, context);
  expect(result).toMatchObject({ success: false, metadata: { status: 'denied' } }); expect(result.metadata).not.toHaveProperty('editPlan');
});

it('proposes immutable version-bound rename data and applies only through the approved patch preparation', async () => {
  const test = setup('versioned-edit');
  const proposal = await test.tool.execute({ ...test.args, operation: 'rename', newName: 'bravo' }, test.context);
  expect(proposal.success).toBe(true);
  const plan = proposal.metadata!.editPlan as { status: string; willWrite: boolean; targets: Array<{ serverVersionVerified: boolean }>; applyPatch: Record<string, unknown> };
  expect(plan.status).toBe('proposed'); expect(plan.willWrite).toBe(false); expect(plan.targets[0]!.serverVersionVerified).toBe(true);
  expect(Object.isFrozen(plan)).toBe(true); expect(Object.isFrozen(plan.applyPatch)).toBe(true);
  expect(fs.readFileSync(test.file, 'utf8')).toBe(test.source);
  const options = gate(test, { escalationPromptHandler: async prompt => ({ promptId: prompt.id, decision: 'allow-once', respondedAt: 1 }) });
  const definitions = new Map([['apply_patch', createPatchToolDefinition()]]); const [tool] = adaptTools(definitions, options); const hooks = createToolHooks(options, definitions);
  const args = tool.prepareArguments!(plan.applyPatch);
  expect(fs.readFileSync(test.file, 'utf8')).toBe(test.source);
  expect(await hooks.beforeToolCall!({ assistantMessage: { role: 'assistant', content: '' }, call: { name: 'apply_patch', id: 'rename-patch', args }, args })).toBeUndefined();
  const applied = await tool.execute('rename-patch', args);
  expect(applied.isError).toBe(false); expect(applied.metadata?.status).toBe('committed');
  expect(fs.readFileSync(test.file, 'utf8')).toBe('export const bravo = 1;\n');
});

it('rejects a stale documentChanges version rather than emitting an apparently current rename plan', async () => {
  const test = setup('stale-edit');
  expect(await test.tool.execute({ ...test.args, operation: 'rename', newName: 'bravo' }, test.context)).toMatchObject({ success: false, metadata: { status: 'stale' } });
});

it.each(['prefix', 'bom', 'newline'])('rejects exact source drift (%s) before patch approval even when the old text hunk can match', async mutation => {
  const test = setup(); const result = await test.tool.execute({ ...test.args, operation: 'rename', newName: 'bravo' }, test.context);
  const plan = result.metadata!.editPlan as { applyPatch: Record<string, unknown>; currency: string };
  expect(plan.currency).toBe('unversioned-edits-current-source-snapshots');
  const changed = mutation === 'prefix' ? '// prefix\n' + test.source : mutation === 'bom' ? '\uFEFF' + test.source : test.source.replace(/\n/g, '\r\n');
  fs.writeFileSync(test.file, changed);
  expect(() => createPatchToolDefinition().prepare!(plan.applyPatch, test.context)).toThrow(/FILE_CONTENT_CHANGED/);
  expect(fs.readFileSync(test.file, 'utf8')).toBe(changed);
});

it('refuses overlapping edits and unrepresentable newline changes before any patch handoff', async () => {
  const test = setup(); const source = await snapshot(test.file, test.context); const open = new Map([[source.uri, source]]);
  const uri = pathToFileURL(test.file).href;
  const range = { start: { line: 0, character: 13 }, end: { line: 0, character: 18 } };
  await expect(renamePlan({ changes: { [uri]: [{ range, newText: 'x' }, { range, newText: 'y' }] } }, open, test.context)).rejects.toMatchObject({ kind: 'invalid' });
  await expect(renamePlan({ changes: { [uri]: [{ range: { start: { line: 0, character: 22 }, end: { line: 1, character: 0 } }, newText: '' }] } }, open, test.context)).rejects.toMatchObject({ kind: 'unsupported' });
});

it('refuses a rename proposal too large to reach the model intact, with no partial patch metadata', async () => {
  const test = setup(); fs.writeFileSync(test.file, test.source + '// ' + 'padding'.repeat(1200) + '\n');
  const result = await test.tool.execute({ ...test.args, operation: 'rename', newName: 'bravo' }, test.context);
  expect(result).toMatchObject({ success: false, metadata: { status: 'unsupported' } });
  expect(result.error).toContain('complete tool-message limit'); expect(result.metadata).not.toHaveProperty('editPlan');
  expect(fs.readFileSync(test.file, 'utf8')).toContain('alpha');
});

it('reclaims verified idle-stopped historical clients on admission without evicting live servers', async () => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
  try {
    const tests = Array.from({ length: languageLimits.clients }, () => setup());
    for (const test of tests) expect((await test.tool.execute({ ...test.args, operation: 'hover' }, test.context)).success).toBe(true);
    const next = setup();
    expect((await next.tool.execute({ ...next.args, operation: 'hover' }, next.context)).metadata?.status).toBe('unavailable');
    await vi.advanceTimersByTimeAsync(languageLimits.idleMs);
    for (let attempt = 0; attempt < 200; attempt++) {
      const states = await Promise.all(tests.map(test => test.tool.execute({ ...test.args, operation: 'status' }, test.context)));
      if (states.every(result => result.metadata?.status === 'stopped')) break;
      await new Promise<void>(resolve => setImmediate(resolve));
    }
    for (const test of tests) expect((await test.tool.execute({ ...test.args, operation: 'status' }, test.context)).metadata?.status).toBe('stopped');
    expect((await next.tool.execute({ ...next.args, operation: 'hover' }, next.context)).success).toBe(true);
  } finally { vi.useRealTimers(); }
});
