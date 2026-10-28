import type { OpenAIAccountAuthConfig } from '../../config/runtimeConfig.js';
import { sameValue } from '../../config/values.js';
import type { ProviderCredentialResolution } from '../../core/shell/providerCredentials.js';
import { captureAccountEdit } from '../../core/auth/account/state.js';
import { AccountUsageError } from '../../core/auth/account/usage/remote.js';
import { hashContent } from '../../core/workspace/files.js';
import type { ToolGateOptions } from '../../turn/tools.js';
import type { EscalationPrompt, EscalationResponse } from '../../core/shell/approval/contract.js';

export interface AccountUsageHost {
  current(): { readonly workspace: string; readonly sessionId: string; readonly resolution: ProviderCredentialResolution };
  check(): void;
  gate(tool: string): ToolGateOptions;
  approveReset(prompt: EscalationPrompt): Promise<EscalationResponse>;
}
export interface Binding {
  readonly workspace: string;
  readonly sessionId: string;
  readonly resolution: ProviderCredentialResolution;
  readonly account: OpenAIAccountAuthConfig;
  readonly accountKey: string;
  readonly credentialKey: string;
}

/** Local receipts need the selected persisted identity, while remote requests also need fresh credentials. */
export function bind(host: AccountUsageHost, requireFresh = true): Binding {
  host.check(); const current = host.current(); const account = current.resolution.credential?.accountAuth;
  if (current.resolution.provider !== 'openai' || account?.type !== 'openai-chatgpt-account'
    || !account.accountId || !/^[^\x00-\x20\x7f]{1,512}$/.test(account.accountId)) throw new AccountUsageError('unsupported');
  if (requireFresh && (!Number.isFinite(account.expiresAt) || account.expiresAt <= Date.now() + 60000)) throw new AccountUsageError('authentication');
  captureAccountEdit(current.workspace, current.resolution, current.sessionId);
  const accountKey = hashContent(`openai\0${account.accountId}`);
  const credentialKey = hashContent(JSON.stringify({ provider: current.resolution.provider, baseUrl: current.resolution.baseUrl,
    source: current.resolution.credential!.source, connectionId: current.resolution.credential!.connectionId, account }));
  return { ...current, account, accountKey, credentialKey };
}
export function checkBinding(host: AccountUsageHost, binding: Binding): void {
  host.check(); const current = host.current();
  if (current.workspace !== binding.workspace || current.sessionId !== binding.sessionId
    || !sameValue(current.resolution.credential, binding.resolution.credential) || current.resolution.provider !== binding.resolution.provider
    || current.resolution.baseUrl !== binding.resolution.baseUrl) throw new Error('Account selection changed; reopen /usage before continuing.');
  captureAccountEdit(binding.workspace, binding.resolution, binding.sessionId);
}
