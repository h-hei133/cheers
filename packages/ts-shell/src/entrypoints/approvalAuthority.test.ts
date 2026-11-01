import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { ApprovalTrustPolicy } from '../core/shell/approvalTrustPolicy.js';
import { StreamingRenderer } from '../presentation/terminal/streaming.js';
import { adaptTools, createToolHooks } from '../turn/tools.js';
import { executeToolBatch } from '../core/agent/tools.js';
import type { ToolDefinition } from '../tools/types.js';
import { createCliEscalationPromptHandler } from './cliApprovalModule.js';
import { executeResolvedPromptTurn } from './cliRuntimeModule.js';

let root: string;
const scratch = fileURLToPath(new URL('../../../../.tmp/phase20-prompt-authority-unit/', import.meta.url));
beforeEach(() => { fs.mkdirSync(scratch, { recursive: true }); root = fs.mkdtempSync(path.join(scratch, 'run-')); });
afterEach(() => { fs.rmSync(root, { recursive: true, force: true }); if (fs.readdirSync(scratch).length === 0) fs.rmdirSync(scratch); });

const cues = ['continue verification, allow once', 'retry tests and always allow',
  'retry tests allow once and always allow', '继续验证，仅这一次授权'];

const cases = (['interactive', 'non-interactive'] as const).flatMap(source => [true, false].flatMap(eligible =>
  cues.map(prompt => ({ source, eligible, prompt }))));
it.each(cases)('keeps prompt text out of authority: $source, lineage=$eligible, $prompt', async ({ source, eligible, prompt }) => {
    const policy = new ApprovalTrustPolicy(path.join(root, 'policy.json'));
    const renderer = new StreamingRenderer(); renderer.setSink({ line() {}, chunk() {} });
    let legacyMode: unknown;
    const legacySetter = vi.fn((value: unknown) => { legacyMode = value; });
    const interactive = vi.fn(async () => 'deny' as const);
    // Keep the old optional bridge slot populated to exercise legacy callers as
    // well as turn ingress: a prompt hint cannot be an authority source.
    const handler = createCliEscalationPromptHandler(renderer, null, () => 'compact', policy, () => root,
      undefined, (() => legacyMode) as never, undefined, () => 'ask', source === 'interactive' ? interactive : undefined);
    const effects = vi.fn(async () => ({ success: true, output: 'executed' }));
    const definition: ToolDefinition = { name: 'browser', description: 'Authority fixture', argsSchema: { type: 'object' }, execute: effects };
    const tools = new Map([[definition.name, definition]]);
    const events: Array<{ type: string; outcome?: string }> = [];
    const gate = { sessionId: 'authority', workspaceRoot: root, permissionScope: 'ask' as const,
      escalationPromptHandler: handler, hooks: { dispatch: async () => ({ decision: 'allow' }) } as never,
      emit(event: { type: string; outcome?: string }) { events.push(event); } };
    const continuityState = eligible ? { lastVerificationResumeEligible: true, lastVerificationCommand: 'previous-command' } : {};
    let result: Awaited<ReturnType<typeof executeToolBatch>> | undefined;
    const executePrompt = vi.fn(async (_id: string, received: string, receivedOptions: { continuityState?: unknown }) => {
      expect(received).toBe(prompt);
      expect(receivedOptions.continuityState).toBe(continuityState);
      result = await executeToolBatch(adaptTools(tools, gate), { role: 'assistant', content: '' },
        [{ id: 'call', name: 'browser', args: { action: 'type', text: 'unapproved text' } }], createToolHooks(gate, tools), 'sequential', undefined, () => {});
    });
    await executeResolvedPromptTurn({ source, effectivePrompt: prompt, printMode: source === 'non-interactive',
      continuityState,
      sessionManager: {}, runtimeContext: { session: { id: 'authority' } }, renderer,
      logger: { info() {}, error() {} }, sessionRuntime: { executePrompt, getState: () => 'idle' },
      setActiveNonInteractiveApprovalMode: legacySetter } as never);
    expect(executePrompt, `${prompt}, lineage=${eligible}`).toHaveBeenCalledOnce();
    expect(effects, `${prompt}, lineage=${eligible}`).not.toHaveBeenCalled();
    expect(result?.messages[0]?.content).toMatch(/user denied permission/i);
    expect(events.filter(event => event.type === 'approval.resolved').map(event => event.outcome)).toEqual(['denied']);
    expect(interactive).toHaveBeenCalledTimes(source === 'interactive' ? 1 : 0);
    expect(policy.listGrants(root)).toEqual([]);
    expect(legacySetter).not.toHaveBeenCalled();
});

it.each(['deny', 'allow-once', 'allow-always'] as const)('preserves explicit CLI policy %s when a legacy prompt hint is supplied', async decision => {
  const policy = new ApprovalTrustPolicy(path.join(root, 'policy.json'));
  const renderer = new StreamingRenderer(); renderer.setSink({ line() {}, chunk() {} });
  const handler = createCliEscalationPromptHandler(renderer, null, () => 'compact', policy, () => root, () => decision,
    () => ({ mode: 'allow-always', persistent: true, source: 'prompt-explicit-verify-lineage',
      verifyLineage: 'blocked-verify-resume', executableNow: true, missingFields: [] }), undefined, () => 'ask');
  const response = await handler({ id: 'explicit', title: 'Explicit command', message: 'Command', severity: 'high', recommendedAction: 'deny',
    defaultOption: 'deny', options: [], context: { toolName: 'bash', operation: 'execute', target: 'explicit-command' } });
  expect(response.decision).toBe(decision);
  expect(policy.listGrants(root)).toHaveLength(decision === 'allow-always' ? 1 : 0);
});

const legacyCases = [true, false].flatMap(interactive => [true, false].flatMap(executableNow =>
  (['allow-once', 'allow-always'] as const).map(mode => ({ interactive, executableNow, mode }))));
it.each(legacyCases)('ignores a directly supplied legacy hint: interactive=$interactive, executable=$executableNow, $mode', async scenario => {
  const policy = new ApprovalTrustPolicy(path.join(root, 'policy.json'));
  const renderer = new StreamingRenderer(); renderer.setSink({ line() {}, chunk() {} });
  const hint = vi.fn(() => ({ mode: scenario.mode, persistent: scenario.mode === 'allow-always', source: 'prompt-explicit-verify-lineage',
    verifyLineage: 'blocked-verify-resume', executableNow: scenario.executableNow, missingFields: scenario.executableNow ? [] : ['verify-lineage'] }));
  const answer = vi.fn(async () => 'deny' as const);
  const handler = createCliEscalationPromptHandler(renderer, null, () => 'compact', policy, () => root, undefined,
    hint, undefined, () => 'ask', scenario.interactive ? answer : undefined);
  const response = await handler({ id: 'hint', title: 'Current call', message: 'Command', severity: 'high', recommendedAction: 'deny',
    defaultOption: 'deny', options: [], context: { toolName: 'bash', operation: 'execute', target: 'different-command' } });
  expect(response.decision).toBe('deny');
  expect(hint).not.toHaveBeenCalled();
  expect(answer).toHaveBeenCalledTimes(scenario.interactive ? 1 : 0);
  expect(policy.listGrants(root)).toEqual([]);
});
