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
import type { SecurityInspection, SecurityInspector } from '../../security/view/inspection.js';

interface SecurityRuntime { readonly service: () => SecurityService }
const runtimes = new WeakMap<ShellRuntimeContext, SecurityRuntime>();
export function installSecurityRuntime(context: ShellRuntimeContext, manager: SessionManager, runtime: ShellSessionRuntime,
  gate: (tool?: 'bash' | 'apply_patch' | 'security_propose') => ToolGateOptions): void {
  let service: SecurityService | undefined; let binding: string | undefined;
  runtimes.set(context, { service: () => {
    const current = JSON.stringify([context.session.id, context.session.createdAt, context.session.projectRoot, context.cwd]);
    if (!service || binding !== current) {
      const session = context.session; const root = context.cwd; binding = current;
      const admission = () => context.session.id !== session.id || context.cwd !== root ? 'Security session or workspace changed.' : undefined;
      service = new SecurityService({ sessionId: session.id, store: securityStore(manager, () => session), root: () => root,
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
export function securityInspectorFor(context: ShellRuntimeContext): SecurityInspector | undefined {
  const service = runtimes.get(context)?.service();
  if (!service) return undefined;
  const session = context.session; const root = context.cwd;
  const read = (): SecurityInspection => {
    if (context.session !== session || context.cwd !== root) return { state: 'stale' };
    try {
      const snapshot = service.inspection();
      return snapshot.identity.sessionId === session.id && snapshot.identity.workspaceRoot === root
        ? { state: 'ready', snapshot } : { state: 'stale' };
    }
    catch { return { state: 'unavailable' }; }
  };
  return { read, subscribe: listener => {
    let released = false; let previous: string | undefined;
    const publish = () => {
      if (released) return;
      const inspection = read();
      const revision = inspection.state === 'ready' ? inspection.snapshot.version : inspection.state;
      if (revision === previous) return;
      previous = revision;
      try { listener(inspection); } catch { /* view delivery cannot affect the diagnostic owner */ }
    };
    const release = service.subscribeInspection(publish);
    // The persisted owner has no cross-process events. Observe external changes
    // only while this view is open; native publication updates remain immediate.
    const timer = setInterval(publish, 1000); timer.unref?.();
    publish();
    return () => { released = true; clearInterval(timer); release(); };
  } };
}
export function isSecurityControl(text: string): boolean { return /^\/security(?:\s+(?:status|cancel|scans|show|compare)(?:\s|$)|\s*$)/i.test(text.trim()); }
