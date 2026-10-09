import type { ShellRuntimeContext } from '../../core/shell/runtimeContext.js';
import type { ShellSessionRuntime } from '../../core/shell/sessionRuntime.js';
import type { SessionManager } from '../../session/SessionManager.js';
import type { CommandContext } from '../../core/commands/types.js';
import type { ToolGateOptions } from '../../turn/tools.js';
import { assertSourceAccess } from '../../core/query/sourcePolicy.js';
import { securityStore } from '../../security/findings/store.js';
import { SecurityService } from '../../security/service.js';
import { runSecurityCommand } from '../../security/view/command.js';
import { securityProposalTool } from '../../security/remediation/tool.js';
import { configurationAdmission } from '../../core/shell/configuration.js';
import { filterVisibleToolNames } from '../../core/tools/prefilter.js';

interface SecurityRuntime { readonly service: () => SecurityService }
const runtimes = new WeakMap<ShellRuntimeContext, SecurityRuntime>();
export function installSecurityRuntime(context: ShellRuntimeContext, manager: SessionManager, runtime: ShellSessionRuntime,
  gate: (tool?: 'bash' | 'apply_patch' | 'security_propose') => ToolGateOptions): void {
  let service: SecurityService | undefined; let sessionId: string | undefined;
  runtimes.set(context, { service: () => {
    if (!service || sessionId !== context.session.id) {
      const session = context.session; const root = context.cwd; sessionId = session.id;
      const admission = () => context.session.id !== session.id || context.cwd !== root ? 'Security session or workspace changed.' : undefined;
      service = new SecurityService({ store: securityStore(manager, () => session), root: () => root,
        homeParent: () => manager.getSessionDirPath(session.id), busy: () => runtime.getCurrentRunController() !== null,
        sourceAccess: absolute => { const refused = configurationAdmission(context)() ?? admission(); if (refused) throw new Error(refused);
          assertSourceAccess(absolute, root, context.session.workspaceRoots, runtime.getPermissionScope(), context.runtimeConfig.denyRules); },
        gate: (tool = 'bash') => { const options = gate(tool); return { ...options, admission: () => options.admission?.() ?? admission()
          ?? (!filterVisibleToolNames([tool], context.runtimeConfig).length ? 'Security native capability is disabled.' : undefined) }; } });
    }
    return service;
  } });
}
export function securityCommandFor(context: ShellRuntimeContext): NonNullable<CommandContext['securityCommand']> {
  return async (args, commandContext) => {
    if (commandContext.sessionId !== context.session.id || commandContext.cwd !== context.cwd) return { kind: 'local', output: 'Security refused: session or workspace changed.' };
    const service = runtimes.get(context)?.service();
    return service ? runSecurityCommand(args, service) : { kind: 'local', output: 'Security analysis requires a bound session runtime.' };
  };
}
export function securityFeatureTools(context: ShellRuntimeContext) { const service = runtimes.get(context)?.service(); return service ? [securityProposalTool(service)] : []; }
export function cancelSecurityFor(context: ShellRuntimeContext): void { runtimes.get(context)?.service().cancel(); }
export function isSecurityControl(text: string): boolean { return /^\/security(?:\s+(?:status|cancel|scans|show|compare)(?:\s|$)|\s*$)/i.test(text.trim()); }
