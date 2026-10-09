import type { ShellRuntimeContext } from '../../core/shell/runtimeContext.js';
import type { ShellSessionRuntime } from '../../core/shell/sessionRuntime.js';
import type { ToolGateOptions } from '../../turn/tools.js';
import type { CommandContext } from '../../core/commands/types.js';
import { configurationAdmission } from '../../core/shell/configuration.js';
import { assertSourceAccess } from '../../core/query/sourcePolicy.js';
import { selectWorkspaceRoot } from '../../core/workspace/roots.js';
import { ExtensionService } from '../../extensions/service.js';
import { marketplaceCommand } from '../../extensions/command/marketplace.js';
import { pluginCommand } from '../../extensions/command/plugin.js';

interface ExtensionRuntime { readonly service: () => ExtensionService }
const runtimes = new WeakMap<ShellRuntimeContext, ExtensionRuntime>();
export function installExtensionRuntime(context: ShellRuntimeContext, runtime: ShellSessionRuntime, gate: (tool?: string) => ToolGateOptions): void {
  let service: ExtensionService | undefined; let identity: string | undefined;
  runtimes.set(context, { service: () => {
    const key = `${context.session.id}:${context.cwd}`;
    if (!service || identity !== key) {
      if (service) void service.close(); identity = key; const session = context.session.id; const root = context.cwd;
      const check = () => { const refused = configurationAdmission(context)() ?? (context.session.id !== session || context.cwd !== root ? 'Extension session or workspace changed.' : undefined); if (refused) throw new Error(refused); };
      service = new ExtensionService({ root, gate: tool => ({ ...gate(tool), admission: () => gate(tool).admission?.() ?? (context.session.id !== session || context.cwd !== root ? 'Extension session changed.' : undefined) }),
        check, offline: () => context.runtimeConfig.offline === true, denyRules: () => context.runtimeConfig.denyRules,
        assertSourceAccess: absolute => { check(); assertSourceAccess(absolute, context.projectRoot ?? root, context.session.workspaceRoots, runtime.getPermissionScope(), context.runtimeConfig.denyRules); },
        assertWorkspace: write => { check(); const primary = context.projectRoot ?? root; assertSourceAccess(root, primary, context.session.workspaceRoots, runtime.getPermissionScope(), context.runtimeConfig.denyRules); if (write) selectWorkspaceRoot(primary, context.session.workspaceRoots ?? [], root, 'write'); } });
    }
    return service;
  } });
  runtimes.get(context)!.service();
}
export function extensionCommandFor(context: ShellRuntimeContext): NonNullable<CommandContext['extensionCommand']> {
  return async (kind, args, commandContext) => {
    if (commandContext.sessionId !== context.session.id || commandContext.cwd !== context.cwd) return { kind: 'local', output: 'Extensions refused: session or workspace changed.' };
    const service = runtimes.get(context)?.service();
    return service ? kind === 'marketplace' ? marketplaceCommand(args, service) : pluginCommand(args, service) : { kind: 'local', output: 'Extensions require a bound session runtime.' };
  };
}
export function cancelExtensionsFor(context: ShellRuntimeContext): void { void runtimes.get(context)?.service().cancel(); }
export function refreshExtensionsFor(context: ShellRuntimeContext): void { runtimes.get(context)?.service(); }
export function isExtensionControl(text: string): boolean { return /^\/(?:plugin|plugins)(?:\s+(?:cancel|list|details|disable|revoke|reload)(?:\s|$)|\s*$)|^\/reload-plugins(?:\s|$)/i.test(text.trim()); }
