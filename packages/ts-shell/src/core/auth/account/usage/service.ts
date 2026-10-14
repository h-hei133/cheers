import { randomUUID } from 'node:crypto';
import type { OpenAIAccountAuthConfig } from '../../../../config/runtimeConfig.js';
import { sameValue } from '../../../../config/values.js';
import type { ProviderCredentialResolution } from '../../../shell/providerCredentials.js';
import { captureAccountEdit } from '../state.js';
import { hashContent } from '../../../workspace/files.js';
import { loadAccountUsage, consumeResetCredit, AccountUsageError } from './remote.js';
import { readResetAttempts, updateResetAttempts } from './state.js';
import type { ResetAttempt, AccountUsage } from './model.js';
import type { ToolDefinition, ToolExecutionContext } from '../../../../tools/types.js';
import { runPreparedTool } from '../../../../turn/invoke.js';
import type { ToolGateOptions } from '../../../../turn/tools.js';
import { readOnlyTool } from '../../../tools/capability.js';
import { neutraliseForDisplay } from '../../../text/safety.js';
import type { EscalationPrompt, EscalationResponse } from '../../../shell/approval/contract.js';

export interface AccountUsageHost {
  current(): { readonly workspace: string; readonly sessionId: string; readonly resolution: ProviderCredentialResolution };
  check(): void;
  gate(tool: string): ToolGateOptions;
  approveReset(prompt: EscalationPrompt): Promise<EscalationResponse>;
}
interface Binding {
  readonly workspace: string;
  readonly sessionId: string;
  readonly resolution: ProviderCredentialResolution;
  readonly account: OpenAIAccountAuthConfig;
  readonly accountKey: string;
  readonly credentialKey: string;
}

function bind(host: AccountUsageHost): Binding {
  host.check(); const current = host.current(); const account = current.resolution.credential?.accountAuth;
  if (current.resolution.provider !== 'openai' || account?.type !== 'openai-chatgpt-account'
    || !account.accountId || !/^[^\x00-\x20\x7f]{1,512}$/.test(account.accountId)) throw new AccountUsageError('unsupported');
  if (!Number.isFinite(account.expiresAt) || account.expiresAt <= Date.now() + 60000) throw new AccountUsageError('authentication');
  captureAccountEdit(current.workspace, current.resolution);
  const accountKey = hashContent(`openai\0${account.accountId}`);
  const credentialKey = hashContent(JSON.stringify({ provider: current.resolution.provider, baseUrl: current.resolution.baseUrl,
    source: current.resolution.credential!.source, connectionId: current.resolution.credential!.connectionId, account }));
  return { ...current, account, accountKey, credentialKey };
}
function checkBinding(host: AccountUsageHost, binding: Binding): void {
  host.check(); const current = host.current();
  if (current.workspace !== binding.workspace || current.sessionId !== binding.sessionId
    || !sameValue(current.resolution.credential, binding.resolution.credential) || current.resolution.provider !== binding.resolution.provider
    || current.resolution.baseUrl !== binding.resolution.baseUrl) throw new Error('Account selection changed; reopen /usage reset before spending.');
  captureAccountEdit(binding.workspace, binding.resolution);
}
function assertUnspent(attempts: readonly ResetAttempt[], creditId?: string): void {
  if (attempts.some(attempt => ['pending', 'unknown'].includes(attempt.status))) throw new Error('An account reset is pending or unknown. Its external result must be reconciled before another consume; automatic replay is refused.');
  if (creditId && attempts.some(attempt => attempt.credit.id === creditId && ['reset'].includes(attempt.status))) throw new Error('This credit already has a confirmed reset receipt; it cannot be spent again.');
}
function safeLabel(binding: Binding): string {
  return neutraliseForDisplay(`openai/${binding.resolution.credential!.connectionId ?? 'configured-account'}; account ${binding.account.accountId}`);
}
function usageText(binding: Binding, snapshot: AccountUsage): string {
  return [`Account: ${safeLabel(binding)}`, `Source: ${snapshot.source}`, `Fetched: ${snapshot.fetchedAt}`,
    ...snapshot.windows.map(window => `${window.name}: ${window.usedPercent}% used${window.resetsAt ? `; resets ${window.resetsAt}` : '; reset time unknown'}.`),
    ...(!snapshot.windows.length ? ['Account quota windows: unknown.'] : []),
    snapshot.creditStatus === 'available' ? `Reset credits: ${snapshot.availableCount} reported available; ${snapshot.credits.length} valid unexpired offers.`
      : `Reset credits: ${snapshot.creditStatus}; available count unknown.`].join('\n');
}

export async function inspectAccountUsage(host: AccountUsageHost, prepareReset: boolean): Promise<string> {
  const binding = bind(host); const check = () => checkBinding(host, binding);
  if (prepareReset) assertUnspent(readResetAttempts(binding.accountKey));
  let output = '';
  const tool = readOnlyTool({ name: 'account_usage', description: 'Read the currently selected account quota and expiring reset offers.', argsSchema: { type: 'object', additionalProperties: false },
    async execute(_args, context) {
      const snapshot = await loadAccountUsage(binding.account, check, context.abortSignal); check();
      output = usageText(binding, snapshot);
      if (prepareReset) {
        const credit = (snapshot.availableCount ?? 0) > 0 ? snapshot.credits[0] : undefined;
        if (!credit) throw new Error('No valid available reset credit was returned; nothing was prepared or spent.');
        const attempt: ResetAttempt = { schemaVersion: 1, id: randomUUID(), accountKey: binding.accountKey, credentialKey: binding.credentialKey,
          sessionId: binding.sessionId, credit, createdAt: new Date().toISOString(), expiresAt: new Date(Math.min(Date.now() + 120000, Date.parse(credit.expiresAt))).toISOString(), status: 'prepared' };
        updateResetAttempts(binding.accountKey, attempts => {
          check(); assertUnspent(attempts, credit.id);
          // A fresh preview replaces unused offers; retained external outcomes keep their fence.
          return [...attempts.filter(value => value.status !== 'prepared' && value.status !== 'refused'), attempt];
        });
        output += `\nPreview ${attempt.id}: spend one ${credit.resetType} credit ${credit.id}; expires ${credit.expiresAt}.\nNothing was consumed. Use /usage reset apply ${attempt.id} for separate approval within two minutes.`;
      }
      return { success: true, output };
    } }, { network: true });
  const result = await runPreparedTool(tool, {}, host.gate(tool.name), undefined, undefined, 'Account usage');
  return result.output;
}

export async function applyAccountReset(host: AccountUsageHost, id: string): Promise<string> {
  const binding = bind(host); const check = () => checkBinding(host, binding);
  const attempt = readResetAttempts(binding.accountKey).find(value => value.id === id);
  if (!attempt || attempt.status !== 'prepared' || attempt.sessionId !== binding.sessionId || attempt.credentialKey !== binding.credentialKey
    || Date.parse(attempt.expiresAt) <= Date.now()) throw new Error('Reset preview is unavailable, expired or belongs to another session/account.');
  assertUnspent(readResetAttempts(binding.accountKey), attempt.credit.id);
  const tool: ToolDefinition = { name: 'account_reset', description: 'Consume one exact account reset credit after a separate explicit approval.', argsSchema: { type: 'object', additionalProperties: false },
    prepare() {
      check(); return Object.freeze({ targets: [], previewKind: 'execution' as const,
        permissionArgs: Object.freeze({ account: binding.account.accountId, creditId: attempt.credit.id, requestId: attempt.id }),
        preview: `Account: ${safeLabel(binding)}\nConsumes one saved rate-limit reset; credit ${attempt.credit.id}, expires ${attempt.credit.expiresAt}.\nRequest ${attempt.id}. External consumption cannot be undone locally.`,
        execute: async (context: ToolExecutionContext) => {
          check();
          // Approval is followed by a real offer re-read, before any pending intent or POST.
          const latest = await loadAccountUsage(binding.account, check, context.abortSignal); check();
          if (Date.parse(attempt.expiresAt) <= Date.now() || !latest.credits.some(credit => sameValue(credit, attempt.credit)) || (latest.availableCount ?? 0) < 1) throw new Error('Reset offer changed or expired after approval; nothing was spent.');
          const pending = { ...attempt, status: 'pending' as const };
          updateResetAttempts(binding.accountKey, attempts => {
            check(); assertUnspent(attempts, attempt.credit.id);
            if (!sameValue(attempts.find(value => value.id === id), attempt)) throw new Error('Reset receipt changed before dispatch.');
            return attempts.map(value => value.id === id ? pending : value);
          });
          let code: NonNullable<ResetAttempt['code']> | 'unknown' = 'unknown';
          try { check(); context.abortSignal?.throwIfAborted(); code = await consumeResetCredit(binding.account, pending, check, context.abortSignal); }
          catch { /* An intent without a confirmed business response cannot be replayed. */ }
          const status = code === 'reset' ? 'reset' : code === 'no_credit' || code === 'nothing_to_reset' ? 'refused' : 'unknown';
          try { updateResetAttempts(binding.accountKey, attempts => {
            if (!sameValue(attempts.find(value => value.id === id), pending)) throw new Error('Reset receipt changed before settlement.');
            return attempts.map(value => value.id === id ? { ...pending, status, ...(code === 'unknown' ? {} : { code }) } : value);
          }); } catch { return { success: false, output: `Account reset ${id}: external result ${status}; local receipt unconfirmed. Inspect the retained request before further consumption.`, metadata: { status: 'unknown', externalStatus: status } }; }
          return { success: status === 'reset', output: `Account reset ${id}: ${status}${code !== 'unknown' ? ` (${code})` : ''}.\n${status === 'unknown' ? 'External result is unconfirmed; automatic replay is refused.' : status === 'reset' ? 'The exact account protocol confirmed this rate-limit reset.' : 'The account protocol confirmed no reset was applied.'}`, metadata: { status, requestId: id } };
        } });
    }, async execute() { throw new Error('An original prepared reset and explicit approval are required.'); } };
  const original = host.gate(tool.name);
  const result = await runPreparedTool(tool, {}, { ...original, permissionScope: 'ask', escalationPromptHandler: async prompt => {
    const answer = await host.approveReset(prompt);
    return { ...answer, decision: answer.promptId === prompt.id && answer.decision === 'allow-once' ? 'allow-once' : 'deny' };
  } },
    undefined, attempt.id, 'Account reset', { eventKey: 'accountReset' });
  return result.output;
}
