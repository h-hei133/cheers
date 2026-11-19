import {defaultHookDispatcher, type HookDispatcher} from './hookDispatcher.js';
import {setupBuiltinVerificationHooks} from './builtin/index.js';
import {registerDeclaredHooks} from './registration.js';
import {createHookApprovalRequest} from './approval.js';
import type {EscalationPrompt, EscalationResponse} from '../shell/approval/contract.js';

/** Prompt admission and tool execution share the same hook registration and trust owners. */
export function prepareSessionHooks(input: {readonly workspaceRoot: string; readonly admission?: () => string | undefined;
  readonly allowUntrustedHooks?: boolean; readonly escalationPromptHandler?: (prompt: EscalationPrompt) => Promise<EscalationResponse>},
  suppliedHooks?: HookDispatcher): HookDispatcher {
  const hooks = suppliedHooks ?? defaultHookDispatcher;
  setupBuiltinVerificationHooks(hooks);
  registerDeclaredHooks(hooks, input.workspaceRoot, {admission:input.admission, bypassed:input.allowUntrustedHooks === true,
    requestApproval:createHookApprovalRequest(input.escalationPromptHandler)});
  return suppliedHooks ? hooks : hooks.fork();
}
