import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { HookDispatcher } from '../core/hooks/hookDispatcher.js';
import type { EscalationPrompt } from '../core/shell/approval/contract.js';
import { ApprovalTrustPolicy } from '../core/shell/approvalTrustPolicy.js';
import { createCliEscalationPromptHandler } from '../entrypoints/cliApprovalModule.js';
import { StreamingRenderer } from '../presentation/terminal/streaming.js';
import type { ToolDefinition } from '../tools/types.js';
import { runPreparedTool } from './invoke.js';

interface Selection { readonly args: Record<string, unknown>; readonly permissionArgs: Record<string, unknown>; readonly preview: string }
const cases: readonly { name: string; label: string; first: Selection; next: Selection }[] = [
  { name: 'desktop', label: 'literal input',
    first: { args: { action: 'type', text: 'approved' }, permissionArgs: { action: 'type' }, preview: 'Input request' },
    next: { args: { action: 'type', text: 'different' }, permissionArgs: { action: 'type' }, preview: 'Input request' } },
  { name: 'collaboration', label: 'captured recipient',
    first: { args: {}, permissionArgs: { operation: 'change ACL' }, preview: 'Grant observe to bob' },
    next: { args: {}, permissionArgs: { operation: 'change ACL' }, preview: 'Grant control to carol' } },
  { name: 'native_operation', label: 'prepared arguments',
    first: { args: {}, permissionArgs: { operation: 'send', recipient: 'bob' }, preview: 'Send request' },
    next: { args: {}, permissionArgs: { operation: 'send', recipient: 'carol' }, preview: 'Send request' } },
  { name: 'native_operation', label: 'captured execution preview',
    first: { args: {}, permissionArgs: { operation: 'send' }, preview: 'Send complete payload A' },
    next: { args: {}, permissionArgs: { operation: 'send' }, preview: 'Send complete payload B' } },
];
class QuietRenderer extends StreamingRenderer { override renderLine(): void {} }
let root: string;
beforeEach(() => {
  const scratch = fileURLToPath(new URL('../../../../.tmp/', import.meta.url));
  fs.mkdirSync(scratch, { recursive: true }); root = fs.mkdtempSync(path.join(scratch, 'approval-'));
});
afterEach(() => { fs.rmSync(root, { recursive: true, force: true }); });

it.each(cases)('binds every prepared execution before dispatch: $name / $label', async ({ name, first, next }) => {
  let selected = first;
  const executed = vi.fn(async () => ({ success: true, output: 'executed' }));
  const tool: ToolDefinition = { name, description: 'Prepared operation fixture', argsSchema: { type: 'object' },
    prepare: () => ({ targets: [], previewKind: 'execution', permissionArgs: selected.permissionArgs, preview: selected.preview, execute: executed }),
    execute: async () => { throw new Error('Unprepared execution'); } };
  const policyPath = path.join(root, 'policy.json');
  const interactive = vi.fn().mockResolvedValueOnce('allow-always').mockResolvedValue('deny');
  const handlerFor = (policy: ApprovalTrustPolicy) => createCliEscalationPromptHandler(new QuietRenderer(), null, () => 'compact', policy,
    () => root, undefined, undefined, undefined, () => 'ask', interactive);
  let handler = handlerFor(new ApprovalTrustPolicy(policyPath));
  const prompts: EscalationPrompt[] = [];
  const options = { workspaceRoot: root, sessionId: 'approval', permissionScope: 'ask' as const, hooks: new HookDispatcher(), emit() {},
    escalationPromptHandler: async (prompt: EscalationPrompt) => { prompts.push(prompt); return handler(prompt); } };
  expect(await runPreparedTool(tool, selected.args, options)).toMatchObject({ isError: false, output: 'executed' });
  handler = handlerFor(new ApprovalTrustPolicy(policyPath));
  expect(await runPreparedTool(tool, selected.args, options)).toMatchObject({ isError: false, output: 'executed' });
  expect(interactive).toHaveBeenCalledOnce();
  selected = next;
  expect((await runPreparedTool(tool, selected.args, options)).isError).toBe(true);
  expect(interactive).toHaveBeenCalledTimes(2); expect(executed).toHaveBeenCalledTimes(2);
  expect(prompts[2]!.context.target).toBe(prompts[0]!.context.target);
  const reopened = new ApprovalTrustPolicy(policyPath);
  const original = reopened.evaluate(prompts[0]!, root); const changed = reopened.evaluate(prompts[2]!, root);
  reopened.rememberAllowOnce(original.cacheKey);
  expect(reopened.consumeAllowOnce(changed.cacheKey)).toBe(false);
  expect(reopened.consumeAllowOnce(original.cacheKey)).toBe(true);
  expect(reopened.consumeAllowOnce(original.cacheKey)).toBe(false);
  const legacy = { ...prompts[0]!, context: { ...prompts[0]!.context } }; delete legacy.context.callBinding;
  const legacyPolicy = new ApprovalTrustPolicy(path.join(root, 'legacy.json')); legacyPolicy.rememberAllowAlways(legacy, root);
  expect(legacyPolicy.evaluate(prompts[0]!, root).matchedGrant).toBeUndefined();
  expect(legacyPolicy.revokeGrant(root, '1').removed).toBe(1);
});
