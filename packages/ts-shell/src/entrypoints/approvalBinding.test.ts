import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { HookDispatcher } from '../core/hooks/hookDispatcher.js';
import { executeToolBatch } from '../core/agent/tools.js';
import type { EscalationPrompt } from '../core/shell/approval/contract.js';
import { ApprovalTrustPolicy } from '../core/shell/approvalTrustPolicy.js';
import { StreamingRenderer } from '../presentation/terminal/streaming.js';
import { adaptTools, createToolHooks } from '../turn/tools.js';
import type { ToolDefinition } from '../tools/types.js';
import { createCliEscalationPromptHandler } from './cliApprovalModule.js';

interface Scenario {
  readonly label: string;
  readonly name: string;
  readonly first: Record<string, unknown>;
  readonly next: Record<string, unknown>;
}
const scenarios: readonly Scenario[] = [
  { label: 'task instruction tail', name: 'task', first: { description: 'review', prompt: 'x'.repeat(200) + 'read' }, next: { description: 'review', prompt: 'x'.repeat(200) + 'write' } },
  { label: 'team question tail', name: 'team', first: { question: 'x'.repeat(80) + 'read', perspectives: ['a', 'b'] }, next: { question: 'x'.repeat(80) + 'write', perspectives: ['a', 'b'] } },
  { label: 'browser text tail', name: 'browser', first: { action: 'type', text: 'x'.repeat(80) + 'read' }, next: { action: 'type', text: 'x'.repeat(80) + 'write' } },
  { label: 'browser selector and text', name: 'browser', first: { action: 'type', selector: '#input', text: 'read' }, next: { action: 'type', selector: '#input', text: 'write' } },
  { label: 'browser URL and selector', name: 'browser', first: { action: 'click', url: 'https://example.invalid', selector: '#read' }, next: { action: 'click', url: 'https://example.invalid', selector: '#write' } },
  { label: 'task instruction whitespace', name: 'task', first: { description: 'review', prompt: 'read' }, next: { description: 'review', prompt: ' read\n' } },
  { label: 'task field delimiters', name: 'task', first: { description: 'review:read', prompt: 'only' }, next: { description: 'review', prompt: 'read:only' } },
  { label: 'task agent choice', name: 'task', first: { description: 'review', prompt: 'read', subagent_type: 'explore' }, next: { description: 'review', prompt: 'read', subagent_type: 'general-purpose' } },
  { label: 'SSH command whitespace', name: 'ssh', first: { command: 'printf read' }, next: { command: 'printf read\n' } },
  { label: 'team perspective order', name: 'team', first: { question: 'review', perspectives: ['a', 'b'] }, next: { question: 'review', perspectives: ['b', 'a'] } },
];

class QuietRenderer extends StreamingRenderer { override renderLine(): void {} }

let root: string;
let policyPath: string;
beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'cheers-approval-binding-'));
  policyPath = path.join(root, 'policy.json');
});
afterEach(() => { fs.rmSync(root, { recursive: true, force: true }); });

async function promptFor(name: string, args: Record<string, unknown>): Promise<EscalationPrompt> {
  let captured: EscalationPrompt | undefined;
  const hooks = createToolHooks({ sessionId: 'binding', workspaceRoot: root, permissionScope: 'ask',
    hooks: { dispatch: async () => ({ decision: 'allow' }) } as unknown as HookDispatcher, emit() {},
    escalationPromptHandler: async prompt => { captured = prompt; return { promptId: prompt.id, decision: 'deny', respondedAt: 1 }; },
  });
  await hooks.beforeToolCall!({ assistantMessage: { role: 'assistant', content: '' }, call: { id: 'capture', name, args }, args });
  expect(captured).toBeDefined();
  return captured!;
}

describe('exact call approval identity', () => {
  it.each(scenarios)('requires a fresh interactive answer after reloading a grant: $label', async ({ name, first, next }) => {
    const original = await promptFor(name, first);
    const changed = await promptFor(name, next);
    // These collisions belong to the readable summary; it must stay stable.
    expect(changed.context.target).toBe(original.context.target);
    const policy = new ApprovalTrustPolicy(policyPath);
    const allow = vi.fn().mockResolvedValue('allow-always');
    const firstHandler = createCliEscalationPromptHandler(new QuietRenderer(), null, () => 'compact', policy, () => root,
      undefined, undefined, undefined, () => 'ask', allow);
    expect((await firstHandler(original)).decision).toBe('allow-always');
    expect(allow).toHaveBeenCalledOnce();
    const reopened = new ApprovalTrustPolicy(policyPath);
    const deny = vi.fn().mockResolvedValue('deny');
    const nextHandler = createCliEscalationPromptHandler(new QuietRenderer(), null, () => 'compact', reopened, () => root,
      undefined, undefined, undefined, () => 'ask', deny);
    expect((await nextHandler(await promptFor(name, first))).decision).toBe('allow-always');
    expect(deny).not.toHaveBeenCalled();
    expect((await nextHandler(changed)).decision).toBe('deny');
    expect(deny).toHaveBeenCalledOnce();
    expect(reopened.listGrants(root)).toHaveLength(1);
  });

  it.each(scenarios)('does not consume a different call\'s once cache: $label', async ({ name, first, next }) => {
    const policy = new ApprovalTrustPolicy(policyPath);
    const original = policy.evaluate(await promptFor(name, first), root);
    const changed = policy.evaluate(await promptFor(name, next), root);
    policy.rememberAllowOnce(original.cacheKey);
    expect(policy.consumeAllowOnce(changed.cacheKey)).toBe(false);
    expect(policy.consumeAllowOnce(original.cacheKey)).toBe(true);
    expect(policy.consumeAllowOnce(original.cacheKey)).toBe(false);
  });

  it.each(['task', 'team', 'browser', 'ssh'])('keeps old %s summary grants manageable without trusting them', async name => {
    const prompt = await promptFor(name, { action: 'type', description: 'review', prompt: 'read', command: 'printf read' });
    const legacy = { ...prompt, context: { ...prompt.context } };
    delete legacy.context.callBinding;
    const policy = new ApprovalTrustPolicy(policyPath);
    policy.rememberAllowAlways(legacy, root);
    const reopened = new ApprovalTrustPolicy(policyPath);
    expect(reopened.evaluate(prompt, root).matchedGrant).toBeUndefined();
    expect(reopened.listGrants(root)).toHaveLength(1);
    expect(reopened.revokeGrant(root, '1').removed).toBe(1);
    expect(reopened.listGrants(root)).toHaveLength(0);
  });

  it('reuses a grant after JSON object keys are reordered and keeps hidden arguments out of storage', async () => {
    const first = await promptFor('task', { description: 'review', prompt: 'x'.repeat(200) + 'private-suffix', context: { b: 2, a: 1 } });
    const reordered = await promptFor('task', { context: { a: 1, b: 2 }, prompt: 'x'.repeat(200) + 'private-suffix', description: 'review' });
    const policy = new ApprovalTrustPolicy(policyPath);
    policy.rememberAllowAlways(first, root);
    expect(new ApprovalTrustPolicy(policyPath).evaluate(reordered, root).matchedGrant).toBeDefined();
    expect(fs.readFileSync(policyPath, 'utf8')).not.toContain('private-suffix');
    expect(policy.evaluate(reordered, root).cacheKey).toMatch(/:call-v1:[a-f0-9]{64}$/);
  });

  it.each(['arguments', 'preview'] as const)('binds prepared %s before executing an aliased delegation', async changed => {
    let instruction = 'x'.repeat(200) + 'read';
    const executed = vi.fn(async () => ({ success: true, output: 'fixture ran' }));
    const definition: ToolDefinition = { name: 'worker_start', description: 'Prepared fixture', argsSchema: { type: 'object' },
      prepare: () => ({ targets: [], permissionToolName: 'task', permissionArgs: { description: 'review', prompt: changed === 'arguments' ? instruction : 'fixed' },
        preview: changed === 'preview' ? instruction : 'fixture', execute: executed }),
      execute: async () => { throw new Error('Unprepared execution'); } };
    const pool = new Map([[definition.name, definition]]);
    const interactive = vi.fn().mockResolvedValueOnce('allow-always').mockResolvedValue('deny');
    const policy = new ApprovalTrustPolicy(policyPath);
    const handler = createCliEscalationPromptHandler(new QuietRenderer(), null, () => 'compact', policy, () => root,
      undefined, undefined, undefined, () => 'ask', interactive);
    const options = { sessionId: 'binding', workspaceRoot: root, permissionScope: 'ask' as const, escalationPromptHandler: handler,
      hooks: { dispatch: async () => ({ decision: 'allow' }) } as unknown as HookDispatcher, emit() {} };
    const run = (id: string) => executeToolBatch(adaptTools(pool, options), { role: 'assistant', content: '' },
      [{ id, name: definition.name, args: {} }], createToolHooks(options, pool), 'sequential', undefined, () => {});
    expect((await run('first')).messages[0]!.content).toBe('fixture ran');
    instruction = 'x'.repeat(200) + 'write';
    expect((await run('changed')).messages[0]!.content).toContain('denied');
    expect(interactive).toHaveBeenCalledTimes(2);
    expect(executed).toHaveBeenCalledOnce();
  });
});
