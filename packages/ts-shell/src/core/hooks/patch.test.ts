import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { executeToolBatch } from '../agent/tools.js';
import { adaptTools, createToolHooks, type ToolGateOptions } from '../../turn/tools.js';
import { SessionManager } from '../../session/SessionManager.js';
import { createPatchToolDefinition } from '../../edit/patch/tool.js';
import { captureOperationScope, readOperations } from '../../edit/recovery/operation/store.js';
import { setPreparedSelection } from '../../tools/preparation.js';
import { HookDispatcher } from './hookDispatcher.js';
import { CANONICAL_WRITE_MATCHER, type CanonicalHookInput } from './translation.js';
import type { HookDecision, PreToolUsePayload } from './types.js';

let temporary: string;
let workspace: string;
let sessionId: string;
let captured: string;
const digest = (text: string) => createHash('sha256').update(text).digest('hex');
const patch = (...sections: string[]) => ['*** Begin Patch', ...sections, '*** End Patch'].join('\n');
const update = (file: string, before: string, after: string) => `*** Update File: ${file}\n@@\n-${before}\n+${after}`;
type Approval = NonNullable<ToolGateOptions['escalationPromptHandler']>;

beforeEach(() => {
  const parent = path.join(os.tmpdir(), 'cheers-test');
  fs.mkdirSync(parent, { recursive: true });
  temporary = fs.mkdtempSync(path.join(parent, 'patch-hook-'));
  workspace = path.join(temporary, 'workspace');
  const home = path.join(temporary, 'home');
  fs.mkdirSync(workspace); fs.mkdirSync(home);
  vi.stubEnv('HOME', home); vi.stubEnv('USERPROFILE', home);
  vi.stubEnv('CHEERS_TEST_ROOT', temporary); vi.stubEnv('GIT_CEILING_DIRECTORIES', temporary);
  fs.writeFileSync(path.join(workspace, 'a.txt'), 'before-a\n');
  fs.writeFileSync(path.join(workspace, 'b.txt'), 'before-b\n');
  sessionId = new SessionManager().createNew(workspace).id;
  captured = path.join(workspace, 'captured.jsonl');
});
afterEach(() => {
  vi.restoreAllMocks(); vi.unstubAllEnvs();
  fs.rmSync(temporary, { recursive: true, force: true });
});

function dispatcher(response = '{ decision: "allow", reasonCode: "no_violation" }', protocolVersion?: 2) {
  const script = `import fs from 'node:fs'; let raw=''; for await (const chunk of process.stdin) raw+=chunk;
    const input=JSON.parse(raw); fs.appendFileSync(${JSON.stringify(captured)}, JSON.stringify(input)+'\\n');
    const result=${response}; process.stdout.write(JSON.stringify(result));`;
  const artifact = path.join(workspace, 'gate.mjs'); fs.writeFileSync(artifact, script);
  const hooks = new HookDispatcher();
  hooks.registerCommandHook({ event: 'PreToolUse', matcher: CANONICAL_WRITE_MATCHER, command: 'unused',
    writeGate: { version: 1, path: artifact, sha256: digest(script), nodeFloor: '20.3.0', ...(protocolVersion && { protocolVersion }) } });
  return hooks;
}

const approveAll: Approval = async prompt => ({ promptId: prompt.id, decision: 'allow-once', respondedAt: 1,
  selected: prompt.context.selections!.map(group => group.id), selectionRevision: prompt.context.selectionRevision });

async function run(input: string, options: { hooks?: HookDispatcher; approve?: Approval; expectedHashes?: Record<string, string> } = {}) {
  const hooks = options.hooks ?? dispatcher();
  const observed: HookDecision[] = [];
  const dispatch = hooks.dispatch.bind(hooks);
  vi.spyOn(hooks, 'dispatch').mockImplementation(async (payload, stopOptions) => {
    const result = await dispatch(payload, stopOptions);
    if (payload.eventName === 'PreToolUse') observed.push(result);
    return result;
  });
  const registry = new Map([['apply_patch', createPatchToolDefinition()]]);
  const approve = vi.fn(options.approve ?? approveAll);
  const gate: ToolGateOptions = { sessionId, workspaceRoot: workspace, permissionScope: 'ask', hooks,
    escalationPromptHandler: approve, emit() {} };
  const result = await executeToolBatch(adaptTools(registry, gate), { role: 'assistant', content: '' },
    [{ name: 'apply_patch', id: 'patch-call', args: { input, ...(options.expectedHashes ? { expectedHashes: options.expectedHashes } : {}) } }],
    createToolHooks(gate, registry), 'sequential', undefined, () => {});
  return { result, observed, approve };
}

function inputs(): CanonicalHookInput[] {
  return fs.existsSync(captured) ? fs.readFileSync(captured, 'utf8').trim().split('\n').filter(Boolean).map(line => JSON.parse(line)) : [];
}
const records = () => readOperations(captureOperationScope({ sessionId, workspaceRoot: workspace }));

describe('prepared patch write hook coverage', () => {
  it('sends one v2 decision the complete selected patch, including deletions, and surfaces its guidance', async () => {
    fs.writeFileSync(path.join(workspace, 'c.txt'), 'before-c\n');
    const hooks = dispatcher('{ decision: "allow_with_advisory", reasonCode: "advisory", additionalContext: "Update the remaining references." }', 2);
    const { result, observed, approve } = await run(patch(update('a.txt', 'before-a', 'after-a'),
      '*** Delete File: b.txt', update('c.txt', 'before-c', 'after-c')), { hooks, approve: async prompt => {
      const selected = prompt.context.selections!.filter(group => !group.files?.some(file => file.endsWith('c.txt'))).map(group => group.id);
      const preview = prompt.context.selectionPreview!(selected);
      return { promptId: prompt.id, decision: 'allow-once', respondedAt: 1, selected, selectionRevision: preview.revision };
    } });
    expect(approve).toHaveBeenCalledOnce();
    expect(inputs()).toEqual([expect.objectContaining({ tool_name: 'apply_patch', args: {}, tool_input: {
      prepared_writes: expect.arrayContaining([
        { path: path.join(workspace, 'a.txt'), content: 'after-a\n' }, { path: path.join(workspace, 'b.txt'), content: null },
      ]),
    } })]);
    expect(inputs()[0]).toMatchObject({ tool_input: { prepared_writes: expect.not.arrayContaining([
      expect.objectContaining({ path: path.join(workspace, 'c.txt') }),
    ]) } });
    expect(observed[0]).toMatchObject({ decision: 'allow_with_advisory', hookVerdict: { policy: 'permission' } });
    expect(result.messages[0]?.content).toContain(': committed.');
    expect(result.messages[0]?.content).toContain('Update the remaining references.');
    expect(fs.readFileSync(path.join(workspace, 'a.txt'), 'utf8')).toBe('after-a\n');
    expect(fs.existsSync(path.join(workspace, 'b.txt'))).toBe(false);
    expect(fs.readFileSync(path.join(workspace, 'c.txt'), 'utf8')).toBe('before-c\n');
  });

  it('lets a v2 joint veto prevent the entire selected patch', async () => {
    const hooks = dispatcher('input.tool_input.prepared_writes.length === 2 ? { decision: "block", reasonCode: "violation", reason: "joint violation" } : { decision: "allow", reasonCode: "no_violation" }', 2);
    const { result, observed } = await run(patch(update('a.txt', 'before-a', 'after-a'), '*** Delete File: b.txt'), { hooks });
    expect(inputs()).toHaveLength(1);
    expect(observed[0]).toMatchObject({ decision: 'block', reasonCode: 'violation' });
    expect(result.messages[0]?.content).toContain('joint violation');
    expect(fs.readFileSync(path.join(workspace, 'a.txt'), 'utf8')).toBe('before-a\n');
    expect(fs.readFileSync(path.join(workspace, 'b.txt'), 'utf8')).toBe('before-b\n');
    expect(records()).toEqual([]);
  });

  it('keeps delete coverage unsupported after an allowed native update in a saved session', async () => {
    const { result, observed, approve } = await run(patch('*** Delete File: b.txt', update('a.txt', 'before-a', 'after-a')));
    expect(approve).toHaveBeenCalledOnce();
    expect(observed[0]).toMatchObject({ decision: 'unsupported', hookVerdict: { status: 'unsupported' } });
    expect(inputs()).toHaveLength(1);
    expect(inputs()[0]).toMatchObject({ tool_name: 'Edit', tool_input: { file_path: path.join(workspace, 'a.txt'), content: 'after-a\n' } });
    expect(result.messages[0]?.content).toContain(': committed.');
    expect(fs.existsSync(path.join(workspace, 'b.txt'))).toBe(false);
    expect(records()[0]?.files).toHaveLength(2);
  });

  it.each(['unknown', 'violation'] as const)('%s write verdict still prevents every target in a mixed delete patch', async verdict => {
    const hooks = dispatcher(verdict === 'unknown'
      ? '{ decision: "allow", reasonCode: "could_not_decide" }'
      : '{ decision: "block", reasonCode: "violation", reason: "fixture write violation" }');
    const { result, observed } = await run(patch('*** Delete File: b.txt', update('a.txt', 'before-a', 'after-a')), { hooks });
    expect(observed[0]).toMatchObject({ decision: 'block', hookVerdict: { status: verdict === 'unknown' ? 'unknown' : 'block' } });
    expect(result.messages[0]?.content).toContain('Blocked by Hook');
    expect(inputs()).toHaveLength(1);
    expect(fs.readFileSync(path.join(workspace, 'a.txt'), 'utf8')).toBe('before-a\n');
    expect(fs.readFileSync(path.join(workspace, 'b.txt'), 'utf8')).toBe('before-b\n');
    expect(records()).toEqual([]);
  });

  it('judges only the approved same-file hunk content through the ordinary permission path', async () => {
    fs.writeFileSync(path.join(workspace, 'a.txt'), 'before-a\nmiddle\nbefore-b\n');
    const input = patch('*** Update File: a.txt\n@@\n-before-a\n+after-a\n@@\n-before-b\n+after-b');
    const hooks = dispatcher('input.tool_input.content.includes("after-a") ? { decision: "block", reasonCode: "violation", reason: "unselected hunk" } : { decision: "allow", reasonCode: "no_violation" }');
    const { result, observed } = await run(input, { hooks, approve: async prompt => {
      const selected = [prompt.context.selections![1]!.id];
      const preview = prompt.context.selectionPreview!(selected);
      return { promptId: prompt.id, decision: 'allow-once', respondedAt: 1, selected, selectionRevision: preview.revision };
    } });
    expect(inputs()).toHaveLength(1);
    expect(inputs()[0]).toMatchObject({ tool_input: { content: 'before-a\nmiddle\nafter-b\n' } });
    expect(observed[0]).toMatchObject({ decision: 'allow' });
    expect(result.messages[0]?.content).toContain(': committed.');
    expect(fs.readFileSync(path.join(workspace, 'a.txt'), 'utf8')).toBe('before-a\nmiddle\nafter-b\n');
  });

  it('excludes an unapproved delete and changed file from the selected inspection', async () => {
    const { result, observed } = await run(patch(update('a.txt', 'before-a', 'after-a'), '*** Delete File: b.txt'), {
      approve: async prompt => {
        const selected = [prompt.context.selections![0]!.id];
        const preview = prompt.context.selectionPreview!(selected);
        fs.writeFileSync(path.join(workspace, 'b.txt'), 'external\n');
        return { promptId: prompt.id, decision: 'allow-once', respondedAt: 1, selected, selectionRevision: preview.revision };
      },
    });
    expect(observed[0]).toMatchObject({ decision: 'allow', hookVerdict: { status: 'allow' } });
    expect(inputs()).toHaveLength(1);
    expect(result.messages[0]?.content).toContain(': committed.');
    expect(fs.readFileSync(path.join(workspace, 'b.txt'), 'utf8')).toBe('external\n');
    expect(records()[0]?.files).toHaveLength(1);
  });

  it('rejects a stale selected revision before dispatching the write hook', async () => {
    const { result, observed } = await run(patch(update('a.txt', 'before-a', 'after-a')), { approve: async prompt => ({
      promptId: prompt.id, decision: 'allow-once', respondedAt: 1,
      selected: prompt.context.selections!.map(group => group.id), selectionRevision: 'stale-revision',
    }) });
    expect(observed).toEqual([]);
    expect(inputs()).toEqual([]);
    expect(result.messages[0]?.content).toMatch(/revision|changed|stale/i);
    expect(fs.readFileSync(path.join(workspace, 'a.txt'), 'utf8')).toBe('before-a\n');
    expect(records()).toEqual([]);
  });

  it('refuses to replace the approved group selection after the hook binding', async () => {
    const hooks = dispatcher();
    let offered: readonly { id: string }[] = [];
    let fullRevision: string | undefined;
    hooks.registerInProcessHook({ event: 'PreToolUse', name: 'replace-selection', handler: payload => {
      setPreparedSelection((payload as PreToolUsePayload).args, offered.map(group => group.id), fullRevision);
      return { decision: 'allow' };
    } });
    const { result } = await run(patch(update('a.txt', 'before-a', 'after-a'), update('b.txt', 'before-b', 'after-b')), {
      hooks, approve: async prompt => {
        offered = prompt.context.selections!; fullRevision = prompt.context.selectionRevision;
        const selected = [offered[0]!.id]; const preview = prompt.context.selectionPreview!(selected);
        return { promptId: prompt.id, decision: 'allow-once', respondedAt: 1, selected, selectionRevision: preview.revision };
      },
    });
    expect(fs.readFileSync(path.join(workspace, 'b.txt'), 'utf8')).toBe('before-b\n');
    if (records().length) expect(records()[0]?.files).toHaveLength(1);
    else expect(result.messages[0]?.content).toMatch(/selection|changed|approved/i);
  });

  it('keeps a delete-only prepared call protected against nested argument changes', async () => {
    const expectedHashes = { [path.join(workspace, 'a.txt')]: digest('before-a\n') };
    const hooks = dispatcher();
    hooks.registerInProcessHook({ event: 'PreToolUse', name: 'mutate-delete-input', handler: () => {
      expectedHashes[path.join(workspace, 'a.txt')] = digest('different');
      return { decision: 'allow' };
    } });
    const { result, observed } = await run(patch('*** Delete File: a.txt'), { hooks, expectedHashes });
    expect(observed[0]).toMatchObject({ decision: 'block', hookVerdict: { status: 'unknown', reasonCode: 'prepared_input_changed' } });
    expect(result.messages[0]?.content).toContain('Blocked by Hook');
    expect(inputs()).toEqual([]);
    expect(fs.readFileSync(path.join(workspace, 'a.txt'), 'utf8')).toBe('before-a\n');
    expect(records()).toEqual([]);
  });

  it('preserves the rename source deletion gap while judging the absent destination', async () => {
    const { result, observed } = await run(patch('*** Update File: a.txt\n*** Move to: renamed.txt'));
    expect(observed[0]).toMatchObject({ decision: 'unsupported', hookVerdict: { status: 'unsupported' } });
    expect(inputs()).toHaveLength(1);
    expect(inputs()[0]).toMatchObject({ tool_name: 'Write', tool_input: { file_path: path.join(workspace, 'renamed.txt'), content: 'before-a\n' } });
    expect(result.messages[0]?.content).toContain(': committed.');
    expect(fs.existsSync(path.join(workspace, 'a.txt'))).toBe(false);
    expect(fs.readFileSync(path.join(workspace, 'renamed.txt'), 'utf8')).toBe('before-a\n');
  });
});
