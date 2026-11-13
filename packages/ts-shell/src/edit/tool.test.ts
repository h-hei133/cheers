import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { createEditToolDefinition } from './tool.js';
import { createCoreToolRegistry } from '../core/tools/registry.js';
import { createDefaultExecutionService } from '../runtime/execution/service.js';
import { HookDispatcher } from '../core/hooks/hookDispatcher.js';
import { CANONICAL_WRITE_MATCHER } from '../core/hooks/translation.js';
import { adaptTools, createToolHooks, type ToolGateOptions } from '../turn/tools.js';
import { executeToolBatch } from '../core/agent/tools.js';
import { preparedWriteCandidate } from '../tools/preparation.js';
import { projectTrust } from '../core/security/projectTrust.js';
import type { ToolDefinition } from '../tools/types.js';

let root: string;
beforeEach(() => {
  fs.mkdirSync('/tmp/cheers-test', { recursive: true });
  root = fs.mkdtempSync('/tmp/cheers-test/edit-candidate-');
  vi.spyOn(projectTrust, 'isProjectUntrusted').mockReturnValue(false);
});
afterEach(() => { vi.restoreAllMocks(); fs.rmSync(root, { recursive: true, force: true }); });
const digest = (value: string) => createHash('sha256').update(value).digest('hex');
const context = () => ({ workspaceRoot: root, taskId: 'edit-call' });
function run(args: Record<string, unknown>, hooks: HookDispatcher, overrides: Partial<ToolGateOptions> = {}, tool: ToolDefinition = createEditToolDefinition(createDefaultExecutionService())) {
  const tools = new Map([[tool.name, tool]]);
  const options: ToolGateOptions = { sessionId: 'edit-candidate-test', workspaceRoot: root, hooks,
    permissionScope: 'allow-all', emit() {}, ...overrides };
  return executeToolBatch(adaptTools(tools, options), { role: 'assistant', content: '' },
    [{ id: 'edit-call', name: tool.name, args }], createToolHooks(options, tools), 'sequential', undefined, () => {});
}
function pinned(script: string) {
  const file = path.join(root, 'gate.mjs'); fs.writeFileSync(file, script);
  return new HookDispatcher({ commandHooks: [{ event: 'PreToolUse', matcher: CANONICAL_WRITE_MATCHER, command: 'unused',
    writeGate: { version: 1, path: file, sha256: digest(script), nodeFloor: '20.3.0' }, timeoutMs: 15000 }] });
}

describe('the native prepared edit', () => {
  it.each([
    { oldText: 'BETA', newText: 'B1\nB2' },
    { edits: [{ oldText: 'BETA', newText: 'B1\nB2' }] },
  ])('prepares and writes the same complete BOM/CRLF content for %j', async args => {
    const raw = '\uFEFFALPHA\r\nBETA\r\n'; fs.writeFileSync(path.join(root, 'note.txt'), raw);
    const service = createDefaultExecutionService(), read = vi.spyOn(service, 'readTextFile'), write = vi.spyOn(service, 'writeTextFile');
    const tool = createEditToolDefinition(service), prepared = await tool.prepare!({ path: 'note.txt', ...args }, context());
    const candidate = '\uFEFFALPHA\r\nB1\r\nB2\r\n';
    expect(prepared.writeCandidate).toEqual({ path: path.join(root, 'note.txt'), content: candidate,
      before: { state: 'exists', sha256: digest(raw) } });
    expect(fs.readFileSync(path.join(root, 'note.txt'), 'utf8')).toBe(raw);
    const result = await prepared.execute(context());
    expect(result.success).toBe(true); expect(read).toHaveBeenCalledOnce();
    expect(write).toHaveBeenCalledWith(expect.objectContaining({ content: candidate, expectedContent: raw }));
    expect(fs.readFileSync(path.join(root, 'note.txt'), 'utf8')).toBe(candidate);
  });

  it.each([
    { oldText: 'ALPHA', newText: 'AAA' },
    { edits: [{ oldText: 'ALPHA', newText: 'AAA' }, { oldText: 'BETA', newText: 'BBB' }] },
    { content: 'replacement\n' },
  ])('refuses stale source after preparation for %j', async args => {
    const file = path.join(root, 'note.txt'); fs.writeFileSync(file, 'ALPHA\nBETA\n');
    const prepared = await createEditToolDefinition(createDefaultExecutionService()).prepare!({ path: 'note.txt', ...args }, context());
    fs.writeFileSync(file, 'external change\n');
    await expect(prepared.execute(context())).rejects.toMatchObject({ code: 'FILE_CONTENT_CHANGED' });
    expect(fs.readFileSync(file, 'utf8')).toBe('external change\n');
  });

  it('keeps missing-file full replacement while refusing a creation after preparation', async () => {
    const file = path.join(root, 'note.txt'), tool = createEditToolDefinition(createDefaultExecutionService());
    const prepared = await tool.prepare!({ path: 'note.txt', content: 'candidate\n' }, context());
    expect(prepared.writeCandidate?.before).toEqual({ state: 'absent' });
    fs.writeFileSync(file, 'new external file\n');
    await expect(prepared.execute(context())).rejects.toMatchObject({ code: 'FILE_CONTENT_CHANGED' });
    expect(fs.readFileSync(file, 'utf8')).toBe('new external file\n');
    fs.unlinkSync(file);
    expect((await tool.execute({ path: 'note.txt', content: 'created\n' }, context())).success).toBe(true);
    expect(fs.readFileSync(file, 'utf8')).toBe('created\n');
  });

  it.each([
    { edits: [{ oldText: 'ALPHA', newText: 'AAA' }, { oldText: 'absent', newText: 'BBB' }] },
    { edits: [{ oldText: 'ALPHA\nBETA', newText: 'AAA' }, { oldText: 'BETA', newText: 'BBB' }] },
    { oldText: 'missing', newText: 'new' },
  ])('writes nothing when matching fails for %j', async args => {
    const file = path.join(root, 'note.txt'); fs.writeFileSync(file, 'ALPHA\nBETA\n');
    await expect(createEditToolDefinition(createDefaultExecutionService()).prepare!({ path: 'note.txt', ...args }, context())).rejects.toThrow();
    expect(fs.readFileSync(file, 'utf8')).toBe('ALPHA\nBETA\n');
  });

  it('does not reinterpret a denied read as an absent full replacement target', async () => {
    const service = createDefaultExecutionService();
    vi.spyOn(service, 'readTextFile').mockRejectedValue(Object.assign(new Error('read denied'), { code: 'EACCES' }));
    const write = vi.spyOn(service, 'writeTextFile');
    await expect(createEditToolDefinition(service).prepare!({ path: 'note.txt', content: 'candidate' }, context())).rejects.toThrow('read denied');
    expect(write).not.toHaveBeenCalled();
  });

  it('refuses a replaced workspace even when its new file has identical content', async () => {
    const workspace = path.join(root, 'workspace'), retired = path.join(root, 'retired'); fs.mkdirSync(workspace);
    const file = path.join(workspace, 'note.txt'); fs.writeFileSync(file, 'ALPHA\n');
    const actual = { workspaceRoot: workspace, taskId: 'edit-call' };
    const prepared = await createEditToolDefinition(createDefaultExecutionService()).prepare!({ path: 'note.txt', oldText: 'ALPHA', newText: 'AAA' }, actual);
    fs.renameSync(workspace, retired); fs.mkdirSync(workspace); fs.writeFileSync(file, 'ALPHA\n');
    await expect(prepared.execute(actual)).rejects.toThrow('workspace root changed identity');
    expect(fs.readFileSync(file, 'utf8')).toBe('ALPHA\n');
  });
});

describe('prepared edit through ordinary permission and hooks', () => {
  it('gives ordinary hooks the original delta and refuses a hook-time source mutation', async () => {
    const file = path.join(root, 'note.txt'), raw = 'ALPHA\nBETA\n'; fs.writeFileSync(file, raw);
    const args = { path: 'note.txt', oldText: 'ALPHA', newText: 'AAA' }, hooks = new HookDispatcher();
    let seen = false;
    hooks.registerInProcessHook({ event: 'PreToolUse', handler: payload => {
      if (payload.eventName !== 'PreToolUse') return;
      seen = true; expect(payload.args).toEqual(args); expect(JSON.stringify(payload)).not.toContain(raw);
      expect(preparedWriteCandidate(payload.args, payload.toolName, payload.toolCallId)).toEqual({ path: file,
        content: 'AAA\nBETA\n', before: { state: 'exists', sha256: digest(raw) } });
      fs.writeFileSync(file, 'hook changed source\n'); return { decision: 'allow' };
    } });
    const result = await run(args, hooks);
    expect(seen).toBe(true); expect(result.messages[0]?.content).toContain('File changed since it was read');
    expect(fs.readFileSync(file, 'utf8')).toBe('hook changed source\n');
  });

  it('blocks without writing and retires the candidate', async () => {
    const file = path.join(root, 'note.txt'); fs.writeFileSync(file, 'ALPHA\n');
    const hooks = new HookDispatcher(); let captured: Record<string, unknown> | undefined;
    hooks.registerInProcessHook({ event: 'PreToolUse', handler: payload => {
      if (payload.eventName !== 'PreToolUse') return;
      captured = payload.args; return { decision: 'block', reason: 'rule denied' };
    } });
    const result = await run({ path: 'note.txt', oldText: 'ALPHA', newText: 'AAA' }, hooks);
    expect(result.messages[0]?.content).toContain('rule denied');
    expect(fs.readFileSync(file, 'utf8')).toBe('ALPHA\n');
    expect(preparedWriteCandidate(captured!, 'edit', 'edit-call')).toBeUndefined();
  });

  it('refuses changed nested delta arguments instead of executing a different operation', async () => {
    const file = path.join(root, 'note.txt'); fs.writeFileSync(file, 'ALPHA\n');
    const hooks = new HookDispatcher();
    hooks.registerInProcessHook({ event: 'PreToolUse', handler: payload => {
      if (payload.eventName !== 'PreToolUse') return;
      (payload.args.edits as Array<{ newText: string }>)[0]!.newText = 'spoofed'; return { decision: 'allow' };
    } });
    const result = await run({ path: 'note.txt', edits: [{ oldText: 'ALPHA', newText: 'AAA' }] }, hooks);
    expect(result.messages[0]?.content).toContain('Prepared edit approval changed after capture');
    expect(fs.readFileSync(file, 'utf8')).toBe('ALPHA\n');
  });

  it('rejects raw mixed forms before reading or publishing a decoy candidate', async () => {
    const service = createDefaultExecutionService(), read = vi.spyOn(service, 'readTextFile'), write = vi.spyOn(service, 'writeTextFile');
    const hooks = new HookDispatcher(), dispatched = vi.spyOn(hooks, 'dispatch');
    const result = await run({ path: 'note.txt', content: 'decoy', edits: [{ oldText: 'ALPHA', newText: 'AAA' }],
      writeCandidate: { path: 'note.txt', content: 'decoy' } }, hooks, {}, createEditToolDefinition(service));
    expect(result.messages[0]?.content).toContain('Invalid tool arguments');
    expect(read).not.toHaveBeenCalled(); expect(write).not.toHaveBeenCalled(); expect(dispatched).not.toHaveBeenCalled();
  });

  it('honours ordinary permission denial before invoking the write gate', async () => {
    const file = path.join(root, 'note.txt'); fs.writeFileSync(file, 'ALPHA\n');
    const hooks = new HookDispatcher(), dispatched = vi.spyOn(hooks, 'dispatch');
    const approval = vi.fn(async (prompt: { id: string }) => ({ promptId: prompt.id, decision: 'deny' as const, respondedAt: 1 }));
    const result = await run({ path: 'note.txt', oldText: 'ALPHA', newText: 'AAA' }, hooks,
      { permissionScope: 'ask', escalationPromptHandler: approval });
    expect(approval).toHaveBeenCalledOnce();
    expect(dispatched.mock.calls.some(([payload]) => payload.eventName === 'PreToolUse')).toBe(false);
    expect(result.messages[0]?.content).toContain('User denied permission'); expect(fs.readFileSync(file, 'utf8')).toBe('ALPHA\n');
  });

  it('refuses read-denied edit sources before preparation or the write gate', async () => {
    const file = path.join(root, 'note.txt'); fs.writeFileSync(file, 'ALPHA\n');
    const hooks = new HookDispatcher(), dispatched = vi.spyOn(hooks, 'dispatch');
    const result = await run({ path: 'note.txt', oldText: 'ALPHA', newText: 'AAA' }, hooks, { denyRules: [{ tool: 'read', pattern: 'note.txt' }] });
    expect(result.messages[0]?.content).toMatch(/denied|Deny|read/i);
    expect(dispatched).not.toHaveBeenCalled(); expect(fs.readFileSync(file, 'utf8')).toBe('ALPHA\n');
  });

  it('refuses full-content creation of an absent read-denied target before hooks or writes', async () => {
    const file = path.join(root, 'note.txt'), hooks = new HookDispatcher(), dispatched = vi.spyOn(hooks, 'dispatch');
    const service = createDefaultExecutionService(), write = vi.spyOn(service, 'writeTextFile');
    const result = await run({ path: 'note.txt', content: 'created\n' }, hooks,
      { denyRules: [{ tool: 'read', pattern: 'note.txt' }] }, createEditToolDefinition(service));
    expect(result.messages[0]?.content).toContain('Refused by a rule');
    expect(dispatched).not.toHaveBeenCalled(); expect(write).not.toHaveBeenCalled();
    expect(fs.existsSync(file)).toBe(false);
  });

  it('refuses native-write creation of an absent read-denied target before pre-use hooks or writes', async () => {
    const file = path.join(root, 'note.txt'), hooks = new HookDispatcher(), dispatched = vi.spyOn(hooks, 'dispatch');
    const service = createDefaultExecutionService(), write = vi.spyOn(service, 'writeTextFile');
    const tool = createCoreToolRegistry({ executionService: service }).get('write')!;
    expect(tool.prepare).toBeUndefined();
    const result = await run({ path: 'note.txt', content: 'created\n' }, hooks,
      { denyRules: [{ tool: 'read', pattern: 'note.txt' }] }, tool);
    expect(result.messages[0]?.content).toContain('Refused by a rule');
    expect(dispatched.mock.calls.some(([payload]) => payload.eventName === 'PreToolUse')).toBe(false);
    expect(write).not.toHaveBeenCalled(); expect(fs.existsSync(file)).toBe(false);
  });

  it.each(['edit', 'write'] as const)('commits ordinary readable %s creation', async name => {
    const file = path.join(root, 'note.txt'), hooks = new HookDispatcher();
    const service = createDefaultExecutionService(), write = vi.spyOn(service, 'writeTextFile');
    const tool = createCoreToolRegistry({ executionService: service }).get(name)!;
    const result = await run({ path: 'note.txt', content: 'created\n' }, hooks, {}, tool);
    expect(result.messages[0]?.content).toContain(name === 'edit' ? 'Updated note.txt' : 'Wrote note.txt');
    expect(write).toHaveBeenCalledOnce();
    expect(fs.readFileSync(file, 'utf8')).toBe('created\n');
  });

  it('refuses full-content replacement of an existing read-denied target', async () => {
    const file = path.join(root, 'note.txt'); fs.writeFileSync(file, 'existing\n');
    const hooks = new HookDispatcher(), dispatched = vi.spyOn(hooks, 'dispatch');
    const result = await run({ path: 'note.txt', content: 'replacement\n' }, hooks, { denyRules: [{ tool: 'read', pattern: 'note.txt' }] });
    expect(result.messages[0]?.content).toMatch(/denied|Deny|read/i);
    expect(dispatched).not.toHaveBeenCalled(); expect(fs.readFileSync(file, 'utf8')).toBe('existing\n');
  });

  it('does not overwrite a read-denied target that appears after preparation', async () => {
    const file = path.join(root, 'note.txt'), hooks = new HookDispatcher(), denyRules: Array<{ tool: string; pattern: string }> = [];
    hooks.registerInProcessHook({ event: 'PreToolUse', handler: payload => {
      if (payload.eventName !== 'PreToolUse') return;
      expect(preparedWriteCandidate(payload.args, payload.toolName, payload.toolCallId)?.before).toEqual({ state: 'absent' });
      denyRules.push({ tool: 'read', pattern: 'note.txt' });
      fs.writeFileSync(file, 'created during hook\n'); return { decision: 'allow' };
    } });
    const result = await run({ path: 'note.txt', content: 'replacement\n' }, hooks, { denyRules });
    expect(result.messages[0]?.content).toMatch(/denied|Deny|read/i);
    expect(fs.readFileSync(file, 'utf8')).toBe('created during hook\n');
  });

  it('does not treat a dangling symlink as an absent full-content target', async () => {
    const file = path.join(root, 'note.txt'); fs.symlinkSync(path.join(root, 'missing.txt'), file);
    const hooks = new HookDispatcher(), dispatched = vi.spyOn(hooks, 'dispatch');
    const result = await run({ path: 'note.txt', content: 'replacement\n' }, hooks);
    expect(result.messages[0]?.content).toMatch(/symbolic link|symlink|changed|denied|Deny|read/i);
    expect(dispatched).not.toHaveBeenCalled(); expect(fs.lstatSync(file).isSymbolicLink()).toBe(true);
    expect(fs.existsSync(path.join(root, 'missing.txt'))).toBe(false);
  });

  it('does not treat a resource failure during preparation as an absent full-content target', async () => {
    const service = createDefaultExecutionService(), write = vi.spyOn(service, 'writeTextFile');
    vi.spyOn(service, 'readTextFile').mockRejectedValue(Object.assign(new Error('read resources unavailable'), { code: 'EMFILE' }));
    const hooks = new HookDispatcher(), dispatched = vi.spyOn(hooks, 'dispatch');
    const result = await run({ path: 'note.txt', content: 'replacement\n' }, hooks, {}, createEditToolDefinition(service));
    expect(result.messages[0]?.content).toContain('read resources unavailable');
    expect(write).not.toHaveBeenCalled(); expect(dispatched).not.toHaveBeenCalled(); expect(fs.existsSync(path.join(root, 'note.txt'))).toBe(false);
  });

  it('requires a prepared approval at the host execution entry', async () => {
    const file = path.join(root, 'note.txt'); fs.writeFileSync(file, 'ALPHA\n');
    const tool = createEditToolDefinition(createDefaultExecutionService()), tools = new Map([['edit', tool]]);
    const options: ToolGateOptions = { sessionId: 'edit-candidate-test', workspaceRoot: root,
      hooks: new HookDispatcher(), permissionScope: 'allow-all', emit() {} };
    const adapted = adaptTools(tools, options)[0]!;
    const result = await adapted.execute('edit-call', { path: 'note.txt', oldText: 'ALPHA', newText: 'AAA' }, undefined, () => {});
    expect(result.output).toContain('prepared and approved tool call');
    expect(fs.readFileSync(file, 'utf8')).toBe('ALPHA\n');
  });

  it.each(['allow', 'block'] as const)('sends the complete actual candidate to a pinned command artifact (%s)', async decision => {
    const file = path.join(root, 'note.txt'), raw = '\uFEFFALPHA\r\nBETA\r\n', candidate = '\uFEFFAAA\r\nBETA\r\n';
    fs.writeFileSync(file, raw);
    const capture = path.join(root, 'capture.json');
    const hooks = pinned(`import fs from 'node:fs';let text='';for await(const c of process.stdin)text+=c;
      const input=JSON.parse(text);fs.writeFileSync(${JSON.stringify(capture)},text);
      if(input.tool_input.content!==${JSON.stringify(candidate)})process.exit(2);
      console.log(JSON.stringify({decision:${JSON.stringify(decision)},reasonCode:${JSON.stringify(decision === 'allow' ? 'no_violation' : 'violation')},reason:'candidate checked'}));`);
    const args = { path: 'note.txt', oldText: 'ALPHA', newText: 'AAA' };
    const result = await run(args, hooks);
    expect(fs.existsSync(capture)).toBe(true);
    const input = JSON.parse(fs.readFileSync(capture, 'utf8'));
    expect(input.args).toEqual(args); expect(input.tool_name).toBe('Edit');
    expect(input.tool_input).toEqual({ file_path: file, content: candidate });
    expect(fs.readFileSync(file, 'utf8')).toBe(decision === 'allow' ? candidate : raw);
    expect(result.messages[0]?.content).toContain(decision === 'allow' ? 'Updated note.txt' : 'candidate checked');
  });
});

describe('edit wire schema and argument normalization', () => {
  it('exposes a flat { path, edits } wire schema without oneOf or content', () => {
    const tool = createEditToolDefinition(createDefaultExecutionService());
    expect(tool.argsSchema).not.toHaveProperty('oneOf');
    expect(tool.argsSchema.required).toEqual(['path', 'edits']);
    expect((tool.argsSchema.properties as Record<string, unknown>).content).toBeUndefined();
  });

  it('silently normalizes stringified edits and single-object edits', async () => {
    const file = path.join(root, 'note.txt');
    fs.writeFileSync(file, 'ALPHA\nBETA\n');
    const hooks = new HookDispatcher();
    const stringified = await run({ path: 'note.txt', edits: JSON.stringify([{ oldText: 'ALPHA', newText: 'ONE' }]) }, hooks);
    expect(stringified.messages[0]?.content).toContain('Updated note.txt');
    expect(fs.readFileSync(file, 'utf8')).toBe('ONE\nBETA\n');

    const single = await run({ path: 'note.txt', edits: { oldText: 'BETA', newText: 'TWO' } }, hooks);
    expect(single.messages[0]?.content).toContain('Updated note.txt');
    expect(fs.readFileSync(file, 'utf8')).toBe('ONE\nTWO\n');
  });
});
