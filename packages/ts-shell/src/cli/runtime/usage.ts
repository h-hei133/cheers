import type { ShellRuntimeContext } from '../../core/shell/runtimeContext.js';
import type { CommandContext } from '../../core/commands/types.js';
import type { ToolGateOptions } from '../../turn/tools.js';
import { configurationAdmission } from '../../core/shell/configuration.js';
import { resolveProviderCredential } from '../../core/shell/providerCredentials.js';
import { parseUsageArgs } from '../../core/commands/usage/syntax.js';
import { inspectAccountUsage, applyAccountReset } from '../usage/service.js';
import { inspectResetStatus } from '../usage/status.js';
import { redactReportText } from '../../core/security/redaction.js';
import type { AccountUsageHost } from '../usage/binding.js';
import type { SessionManager } from '../../session/SessionManager.js';
import type { EscalationPrompt } from '../../core/shell/approval/contract.js';
import type { InteractiveApprovalResult } from '../interactive/picker/approval.js';

const gates = new WeakMap<ShellRuntimeContext, { readonly gate: (tool: string) => ToolGateOptions; readonly approve?: AccountUsageHost['approveReset'] }>();
const pending = new WeakSet<ShellRuntimeContext>();
export function installUsageRuntime(context: ShellRuntimeContext, gate: (tool?: string) => ToolGateOptions, approve?: AccountUsageHost['approveReset']): void { gates.set(context, { gate, approve }); }
/** Account consumption needs a fresh user choice, independent of cached tool grants. */
export function usageResetApproval(context: ShellRuntimeContext, manager: SessionManager,
  handler: () => ((prompt: EscalationPrompt) => Promise<InteractiveApprovalResult>) | undefined): AccountUsageHost['approveReset'] {
  return async prompt => {
    const sessionId = context.session.id;
    const answer = await handler()?.({ ...prompt, options: prompt.options.filter(option => option.value !== 'allow-always') });
    const choice = typeof answer === 'string' ? answer : answer?.decision;
    const decision = choice === 'allow-once' && context.session.id === sessionId ? 'allow-once' : 'deny';
    manager.recordApprovalAuditDecision(sessionId, { decision, decisionSource: 'account-reset-confirmation', persistent: false,
      cacheEffect: 'none', projectRoot: context.projectRoot, cacheKey: prompt.id, scopeLabel: 'exact-account-credit', channel: 'interactive' });
    return { promptId: prompt.id, decision, respondedAt: Date.now() };
  };
}
export function usageCommandFor(context: ShellRuntimeContext): NonNullable<CommandContext['usageCommand']> {
  return async (args, command) => {
    const installed = gates.get(context); const gate = installed?.gate; const sessionId = context.session.id; const workspace = context.projectRoot;
    const parsed = parseUsageArgs(args);
    if (!gate || !parsed.ok || command.sessionId !== sessionId || command.projectRoot !== workspace || command.interactive !== true) return { kind: 'local', output: 'Account usage requires the current bound interactive session. Nothing was consumed.' };
    const status = parsed.action.name === 'reset' && parsed.args[0] === 'status';
    if (pending.has(context) && !status) return { kind: 'local', output: 'Account usage is already pending; inspect /usage reset status or settle its request or approval first.' };
    const admission = configurationAdmission(context);
    const check = () => {
      const refusal = admission() ?? command.admission?.();
      if (refusal || context.session.id !== sessionId || context.projectRoot !== workspace) throw new Error(refusal ?? 'Account session or workspace changed.');
    };
    const host = { current: () => ({ workspace: context.projectRoot, sessionId: context.session.id,
      resolution: command.resolveConfigTarget?.(context.runtimeConfig) ?? resolveProviderCredential({ runtimeConfig: context.runtimeConfig }) }),
    check, gate: (tool: string) => { const original = gate(tool); return { ...original, admission: () => { try { check(); return original.admission?.(); } catch { return 'Account request authority changed.'; } } }; },
    approveReset: installed!.approve ?? (async prompt => ({ promptId: prompt.id, decision: 'deny' as const, respondedAt: Date.now(), userComment: 'Explicit account confirmation is unavailable.' })) };
    if (!status) pending.add(context);
    try {
      const output = status ? await inspectResetStatus(host, parsed.args[1]) : parsed.action.name === 'reset' && parsed.args[0] === 'apply'
        ? await applyAccountReset(host, parsed.args[1]!) : await inspectAccountUsage(host, parsed.action.name === 'reset');
      return { kind: 'local', output };
    } catch (error) { return { kind: 'local', output: redactReportText(error instanceof Error ? error.message : 'Account usage unavailable; no confirmed reset.', 4096) }; }
    finally { if (!status) pending.delete(context); }
  };
}
