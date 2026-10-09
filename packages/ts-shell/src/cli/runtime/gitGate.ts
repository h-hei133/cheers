import type { ShellRuntimeContext } from '../../core/shell/runtimeContext.js';
import type { ShellSessionRuntime } from '../../core/shell/sessionRuntime.js';
import type { SessionManager } from '../../session/SessionManager.js';
import { configurationAdmission } from '../../core/shell/configuration.js';
import { HookDispatcher } from '../../core/hooks/hookDispatcher.js';
import { setupBuiltinVerificationHooks } from '../../core/hooks/builtin/index.js';
import { registerDeclaredHooks } from '../../core/hooks/registration.js';
import { buildToolEscalationPrompt } from '../../core/query/toolPolicy.js';
import type { ToolGateOptions } from '../../turn/tools.js';
import { filterVisibleToolNames } from '../../core/tools/prefilter.js';
import type { StreamingRenderer } from '../../presentation/terminal/streaming.js';
import type { ApprovalTrustPolicy } from '../../core/shell/approvalTrustPolicy.js';
import type { CliApprovalModeState } from '../approval/cliApprovalModeState.js';
import type { CliOptions } from '../options/cliOptions.js';
import type { Interface as ReadlineInterface } from 'node:readline';
import type { EscalationPrompt } from '../../core/shell/approval/contract.js';
import type { InteractiveApprovalResult } from '../interactive/picker/approval.js';
import { createCliApprovalEscalationBridge } from '../approval/cliApprovalEscalationBridge.js';
import { installGitRuntime } from './git.js';

interface GitComposition {
  readonly runtimeContext: ShellRuntimeContext;
  readonly sessionManager: SessionManager;
  readonly renderer: StreamingRenderer;
  readonly getReadline: () => ReadlineInterface | null;
  readonly approvalTrustPolicy: ApprovalTrustPolicy;
  readonly approvalModeState: CliApprovalModeState;
  readonly options: CliOptions;
  readonly getPromptInteractiveApproval?: () => ((prompt: EscalationPrompt) => Promise<InteractiveApprovalResult>) | undefined;
}
export function installGitCliRuntime(input: GitComposition, runtime: ShellSessionRuntime, isStdinTty: () => boolean): (tool?: 'bash' | 'apply_patch' | 'security_propose') => ToolGateOptions {
  const gate = (tool: 'bash' | 'apply_patch' | 'security_propose' = 'bash') => gitGateFor(input.runtimeContext, input.sessionManager, runtime,
    createCliApprovalEscalationBridge({ renderer: input.renderer, readline: input.getReadline, getViewMode: () => runtime.getViewMode(),
      trustPolicy: input.approvalTrustPolicy, getProjectRoot: () => input.runtimeContext.projectRoot,
      getNonInteractiveDecision: () => !isStdinTty() ? input.options.nonInteractiveApproval : undefined,
      getApprovalModeObject: input.approvalModeState.get, sessionManager: input.sessionManager, getSessionId: () => input.runtimeContext.session.id,
      getPermissionScope: () => runtime.getPermissionScope(), promptInteractiveApproval: input.getPromptInteractiveApproval?.() }), tool);
  installGitRuntime(input.runtimeContext, input.sessionManager, runtime, gate);
  return gate;
}

export function gitGateFor(context: ShellRuntimeContext, manager: SessionManager, runtime: ShellSessionRuntime,
  approval: NonNullable<ToolGateOptions['escalationPromptHandler']>, tool: 'bash' | 'apply_patch' | 'security_propose' = 'bash'): ToolGateOptions {
  const admission = () => configurationAdmission(context)() ?? (!filterVisibleToolNames([tool], context.runtimeConfig).length ? 'The selected native capability is disabled.' : undefined);
  const hooks = new HookDispatcher(); setupBuiltinVerificationHooks(hooks);
  registerDeclaredHooks(hooks, context.cwd, { admission, bypassed: context.runtimeConfig.allowUntrustedHooks,
    requestApproval: async hook => (await approval(buildToolEscalationPrompt('bash', 'execute', hook.command,
      `Declared ${hook.event} hook from ${hook.sourcePath}; approval binds its stored fingerprint.`))).decision !== 'deny' });
  return { sessionId: context.session.id, workspaceRoot: context.cwd, workspaceRoots: context.session.workspaceRoots,
    agentMode: runtime.getAgentMode(), permissionScope: runtime.getPermissionScope(), denyRules: context.runtimeConfig.denyRules,
    admission, hooks, escalationPromptHandler: approval,
    emit: event => manager.appendQueryEvent(context.session.id, event) };
}
