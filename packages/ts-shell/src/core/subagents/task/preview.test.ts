import fs from 'node:fs';
import path from 'node:path';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { SubagentRunInput } from '../runner.js';
import { HookDispatcher } from '../../hooks/hookDispatcher.js';
import { createTaskToolDefinition } from '../../tools/taskTool.js';
import type { EscalationPrompt } from '../../shell/approval/contract.js';
import { ApprovalTrustPolicy } from '../../shell/approvalTrustPolicy.js';
import { runPreparedTool } from '../../../turn/invoke.js';
import type { ToolGateOptions } from '../../../turn/tools.js';
import { approvalPreview } from '../../../cli/interactive/picker/approval.js';
import { Pager } from '../../../presentation/tui/chrome/pager.js';
import { stripAnsi } from '../../../presentation/tui/text/ansi.js';
import { visibleWidth } from '../../../presentation/tui/text/measure.js';

let scratch: string;
let root: string;
beforeEach(() => {
  const base = path.resolve(process.cwd(), '../../.tmp'); fs.mkdirSync(base, { recursive: true });
  scratch = fs.mkdtempSync(path.join(base, 'task-preview-')); root = path.join(scratch, 'project');
  const home = path.join(scratch, 'home'); fs.mkdirSync(root); fs.mkdirSync(home);
  vi.stubEnv('HOME', home); vi.stubEnv('USERPROFILE', home); vi.stubEnv('GIT_CEILING_DIRECTORIES', scratch);
});
afterEach(() => { vi.unstubAllEnvs(); vi.restoreAllMocks(); fs.rmSync(scratch, { recursive: true, force: true }); });

const input = { description: 'inspect fixture', prompt: 'x'.repeat(240) + ' instruction-tail', context: 'y'.repeat(100) + ' context-tail',
  subagent_type: 'preview-fixture', agentMode: 'plan', isolation: 'none' };
const runner = () => vi.fn(async (_input: SubagentRunInput) => ({ text: 'Public child complete.', failed: false, steps: 1, allowedTools: [] }));
function options(approval: NonNullable<ToolGateOptions['escalationPromptHandler']>, runSubagent = runner()): ToolGateOptions {
  return { sessionId: 'task-preview', workspaceRoot: root, permissionScope: 'ask', hooks: new HookDispatcher(), emit() {},
    escalationPromptHandler: approval, runSubagent };
}
async function capture(args: Record<string, unknown> = input): Promise<EscalationPrompt> {
  let captured: EscalationPrompt | undefined;
  const runSubagent = runner();
  await runPreparedTool(createTaskToolDefinition(), args, options(async prompt => {
    captured = prompt; expect(runSubagent).not.toHaveBeenCalled(); return { promptId: prompt.id, decision: 'deny', respondedAt: 1 };
  }, runSubagent));
  expect(captured).toBeDefined(); expect(runSubagent).not.toHaveBeenCalled(); return captured!;
}
function definition(prompt: string): string {
  return `---\nname: preview-fixture\ndescription: Review files\ntools: [read]\ndisallowedTools: [write]\npermissionMode: plan\nmaxTurns: 2\nisolation: none\nmemory: project\n---\n${prompt}\n`;
}

it('shows the complete task instructions, context and execution choices before dispatch', async () => {
  const prompt = await capture();
  expect(prompt.context.preview).toContain(JSON.stringify(input.prompt));
  expect(prompt.context.preview).toContain(JSON.stringify(input.context));
  expect(prompt.context.preview).toContain('"plan"');
  expect(prompt.context.preview).toContain('"none"');
  expect(prompt.context.previewKind).toBe('execution');
  expect(prompt.context.target).not.toContain('instruction-tail');
});

it.each([32, 80])('keeps the instruction tail reachable in the original %i-column approval reader', async width => {
  const prompt = await capture({ ...input, prompt: 'long words '.repeat(120) + 'instruction-tail' });
  const report = approvalPreview(prompt)!; const pager = new Pager();
  pager.open(report.title, prompt.context.preview!, report);
  pager.render(width, 12); pager.handlePaste('instruction-tail'); pager.handleKey('end', undefined, 12);
  const rows = pager.render(width, 12);
  expect(rows.slice(2, -1).map(stripAnsi).join('\n')).toContain('instruction-tail');
  expect(rows.every(row => visibleWidth(row) <= width)).toBe(true);
  expect(pager.active).toBe(true);
});

it('shows escaped controls and preserves literal spacing rather than forging preview rows', async () => {
  const value = '  read  only\n\x1b[2J\x85\u2028\u202e\tend  ';
  const prompt = await capture({ ...input, prompt: value, context: value });
  expect(prompt.context.preview).toContain('  read  only');
  expect(prompt.context.preview).toContain('\\n\\u001b[2J\\u0085\\u2028\\u202e\\tend  ');
  expect(prompt.context.preview).not.toMatch(/[\x1b\x85\u2028\u202e]/);
});

it.each(['instructions', 'tools'] as const)('shows the selected role and invalidates an earlier grant after its %s change', async field => {
  const dir = path.join(root, '.agents'); fs.mkdirSync(dir);
  const file = path.join(dir, 'preview-fixture.md'); fs.writeFileSync(file, definition('ROLE_INSTRUCTIONS_A'));
  const first = await capture(); const policyPath = path.join(scratch, 'policy.json');
  const policy = new ApprovalTrustPolicy(policyPath); policy.rememberAllowAlways(first, root);
  fs.writeFileSync(file, field === 'instructions' ? definition('ROLE_INSTRUCTIONS_B') : definition('ROLE_INSTRUCTIONS_A').replace('tools: [read]', 'tools: [read, glob]'));
  const next = await capture();
  expect(new ApprovalTrustPolicy(policyPath).evaluate(next, root).matchedGrant).toBeUndefined();
  expect(first.context.preview).toContain('ROLE_INSTRUCTIONS_A');
  expect(first.context.preview).toContain('"read"'); expect(first.context.preview).toContain('"write"');
  expect(first.context.preview).toContain('"project"');
  expect(next.context.target).toBe(first.context.target);
  expect(next.context.preview).not.toBe(first.context.preview);
  expect(next.context.preview).toContain(field === 'instructions' ? 'ROLE_INSTRUCTIONS_B' : '"glob"');
});

it('dispatches the approved instructions and context through the existing task owner', async () => {
  const runSubagent = runner();
  const result = await runPreparedTool(createTaskToolDefinition(), input, options(async prompt => {
    expect(prompt.context.preview).toContain('instruction-tail'); expect(runSubagent).not.toHaveBeenCalled();
    return { promptId: prompt.id, decision: 'allow-once', respondedAt: 1 };
  }, runSubagent));
  expect(result.isError).toBe(false); expect(runSubagent).toHaveBeenCalledOnce();
  expect(runSubagent.mock.calls[0]![0]).toMatchObject({ prompt: input.prompt, context: input.context, agentMode: 'plan', workspace: root });
});

it.each(['denied', 'cancelled'] as const)('does not start a child after the reviewed task is %s', async outcome => {
  const controller = new AbortController(); const runSubagent = runner();
  const result = await runPreparedTool(createTaskToolDefinition(), input, options(async prompt => {
    if (outcome === 'cancelled') controller.abort();
    return { promptId: prompt.id, decision: outcome === 'denied' ? 'deny' : 'allow-once', respondedAt: 1 };
  }, runSubagent), controller.signal);
  expect(result.isError).toBe(true); expect(runSubagent).not.toHaveBeenCalled();
});
