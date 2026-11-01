import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Interface as ReadlineInterface } from 'node:readline';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { HookDispatcher } from '../core/hooks/hookDispatcher.js';
import { ApprovalTrustPolicy } from '../core/shell/approvalTrustPolicy.js';
import { applyInteractiveApprovalDecisionWiring } from '../core/shell/interactiveApprovalWiring.js';
import type { EscalationPrompt } from '../core/shell/approval/contract.js';
import { buildToolEscalationPrompt, evaluateToolPermissionScope } from '../core/query/toolPolicy.js';
import { createCoreToolRegistry } from '../core/tools/registry.js';
import type { CoreMcpGateway } from '../core/mcp/gateway.js';
import { StreamingRenderer } from '../presentation/terminal/streaming.js';
import { approvalPicker } from '../cli/interactive/picker/approval.js';
import { runPreparedTool } from '../turn/invoke.js';
import { createCliEscalationPromptHandler } from './cliApprovalModule.js';
import type { ApprovalAuditRecord } from './approvalPromptBridge.js';

const name = 'mcp__fixture__publish';
let root: string;
beforeEach(() => {
  const scratch = fileURLToPath(new URL('../../../../.tmp/', import.meta.url));
  fs.mkdirSync(scratch, { recursive: true }); root = fs.mkdtempSync(path.join(scratch, 'mcp-approval-'));
  const home = path.join(root, 'home'); fs.mkdirSync(home);
  vi.stubEnv('HOME', home); vi.stubEnv('USERPROFILE', home); vi.stubEnv('CHEERS_TEST_ROOT', path.join(root, 'data'));
});
afterEach(() => { vi.unstubAllEnvs(); fs.rmSync(root, { recursive: true, force: true }); });

class QuietRenderer extends StreamingRenderer {
  readonly lines: string[] = [];
  override renderLine(line: string): void { this.lines.push(line); }
}
function prompt(tool = name): EscalationPrompt {
  const decision = evaluateToolPermissionScope(tool, { value: 'selected' }, 'ask', root);
  return buildToolEscalationPrompt(tool, decision.operation, decision.target, decision.reason);
}
function host(options: { cli?: 'deny' | 'allow-once' | 'allow-always';
  interactive?: Parameters<typeof createCliEscalationPromptHandler>[9] } = {}) {
  const policy = new ApprovalTrustPolicy(path.join(root, 'policy.json')), renderer = new QuietRenderer(), audits: ApprovalAuditRecord[] = [];
  const handle = createCliEscalationPromptHandler(renderer, null, () => 'compact', policy, () => root,
    () => options.cli, undefined, record => audits.push(record), () => 'ask', options.interactive);
  return { handle, policy, audits, renderer };
}

it('limits an explicit headless MCP allow-always policy to the current call without persistence', async () => {
  const initial = host({ cli: 'allow-always' });
  expect(await initial.handle(prompt())).toMatchObject({ decision: 'allow-once' });
  expect(initial.policy.listGrants(root)).toEqual([]);
  expect(initial.audits).toEqual([expect.objectContaining({ decision: 'allow-once', decisionSource: 'cli-policy', persistent: false, cacheEffect: 'none' })]);
  const reopened = host();
  expect(await reopened.handle(prompt())).toMatchObject({ decision: 'deny' });
  expect(reopened.policy.listGrants(root)).toEqual([]);
});

it.each(['headless', 'interactive'] as const)('ignores legacy reusable MCP grants in %s while retaining explicit revocation', async channel => {
  const legacy = new ApprovalTrustPolicy(path.join(root, 'policy.json')); legacy.rememberAllowAlways(prompt(), root);
  const before = fs.readFileSync(legacy.sourcePath);
  const interactive = vi.fn().mockResolvedValue('deny');
  const current = host(channel === 'interactive' ? { interactive } : {});
  expect(await current.handle(prompt())).toMatchObject({ decision: 'deny' });
  expect(interactive).toHaveBeenCalledTimes(channel === 'interactive' ? 1 : 0);
  expect(current.audits[0]).toMatchObject({ decision: 'deny', persistent: false, cacheEffect: 'none' });
  expect(fs.readFileSync(legacy.sourcePath).equals(before)).toBe(true);
  expect(current.policy.listGrants(root)).toHaveLength(1);
  expect(current.policy.revokeGrant(root, '1').removed).toBe(1);
});

it.each(['headless', 'interactive'] as const)('does not consume a legacy name-only MCP once cache in %s', async channel => {
  const answer = vi.fn().mockResolvedValue('deny');
  const current = host(channel === 'interactive' ? { interactive: answer } : {});
  const request = prompt(), key = current.policy.evaluate(request, root).cacheKey;
  current.policy.rememberAllowOnce(key);
  expect(await current.handle(request)).toMatchObject({ decision: 'deny' });
  expect(current.policy.hasAllowOnce(key)).toBe(true);
  expect(current.audits[0]).toMatchObject({ decision: 'deny', persistent: false, cacheEffect: 'none' });
  expect(answer).toHaveBeenCalledTimes(channel === 'interactive' ? 1 : 0);
});

it.each(['deny', 'allow-once'] as const)('preserves the explicit MCP CLI decision %s', async cli => {
  const current = host({ cli });
  expect(await current.handle(prompt())).toMatchObject({ decision: cli });
  expect(current.policy.listGrants(root)).toEqual([]);
});

it('offers only once or deny through the actual picker and tolerates an older host returning always', async () => {
  const choices: string[] = [];
  const current = host({ interactive: async request => {
    expect(request.options.map(option => option.value)).toEqual(['allow-once', 'deny']);
    choices.push(...(await approvalPicker(request, () => {}).load('')).map(option => option.id));
    return 'allow-always';
  } });
  expect(await current.handle(prompt())).toMatchObject({ decision: 'allow-once',
    userComment: 'This tool comes from an extension; the grant covers this call only.' });
  expect(choices).toEqual(['allow-once', 'deny']);
  expect(current.policy.listGrants(root)).toEqual([]);
});

it('never offers or applies a persistent MCP choice even with an older empty options prompt', async () => {
  const request = { ...prompt(), options: [] }, settle = vi.fn();
  const picker = approvalPicker(request, settle);
  expect((await picker.load('')).map(option => option.id)).toEqual(['allow-once', 'deny']);
  await picker.apply(['allow-always']);
  expect(settle).toHaveBeenCalledWith({ decision: 'deny' });
});

it('does not persist an MCP decision through direct interactive storage wiring', () => {
  const current = host(), request = prompt();
  expect(applyInteractiveApprovalDecisionWiring({ decision: 'allow-always', prompt: request,
    projectRoot: root, evaluation: current.policy.evaluate(request, root), trustPolicy: current.policy })).toEqual({});
  expect(current.policy.listGrants(root)).toEqual([]);
});

it('shows a truthful once-only readline menu and normalizes an older always key', async () => {
  const current = host(), request = prompt();
  current.policy.rememberAllowAlways(request, root);
  const readline = { question: (_question: string, answer: (text: string) => void) => answer('a') } as ReadlineInterface;
  const handle = createCliEscalationPromptHandler(current.renderer, readline, () => 'verbose', current.policy, () => root);
  expect(await handle(request)).toMatchObject({ decision: 'allow-once' });
  const output = current.renderer.lines.join('\n');
  expect(output).toContain('Decision: y=allow-once, n=deny (default n)');
  expect(output).not.toContain('a=allow-always');
  expect(output).not.toContain('Decision basis: matched stored allow-always grant.');
  expect(current.policy.listGrants(root)).toHaveLength(1);
});

it('does not widen a headless MCP approval to later arguments through the actual registry and tool gate', async () => {
  const marker = path.join(root, 'effects.txt');
  const gateway = { invokeTool: vi.fn(async (_server: string, _tool: string, args: Record<string, unknown>) => {
    fs.appendFileSync(marker, String(args.value) + '\n'); return { content: 'Published fixture', isError: false };
  }) };
  const tool = createCoreToolRegistry({ mcpGateway: gateway as unknown as CoreMcpGateway, mcpTools: [{
    serverName: 'fixture', toolName: 'publish', qualifiedName: name, description: 'Publish selected fixture',
    inputSchema: { type: 'object', properties: { value: { type: 'string' } }, required: ['value'] },
  }] }).get(name)!;
  let current = host({ cli: 'allow-always' });
  const options = { workspaceRoot: root, sessionId: 'mcp-approval', permissionScope: 'ask' as const,
    hooks: new HookDispatcher(), emit() {}, escalationPromptHandler: (request: EscalationPrompt) => current.handle(request) };
  expect((await runPreparedTool(tool, { value: 'first' }, options)).isError).toBe(false);
  current = host();
  expect((await runPreparedTool(tool, { value: 'different' }, options)).isError).toBe(true);
  expect(gateway.invokeTool).toHaveBeenCalledOnce();
  expect(fs.readFileSync(marker, 'utf8')).toBe('first\n');
  expect(current.policy.listGrants(root)).toEqual([]);
});

it('keeps ordinary command permanent grants and once-cache consumption working', async () => {
  const first = host({ cli: 'allow-always' }); const request = prompt('bash');
  expect(await first.handle(request)).toMatchObject({ decision: 'allow-always' });
  const reopened = host(); expect(await reopened.handle(request)).toMatchObject({ decision: 'allow-always' });
  expect(reopened.policy.resetProject(root).removed).toBe(1);
  const key = reopened.policy.evaluate(request, root).cacheKey; reopened.policy.rememberAllowOnce(key);
  expect(await reopened.handle(request)).toMatchObject({ decision: 'allow-once' });
  expect(await reopened.handle(request)).toMatchObject({ decision: 'deny' });
});
