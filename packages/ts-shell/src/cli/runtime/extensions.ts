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
import { extensionManager, type ExtensionRun } from '../../extensions/view/manager.js';
import type { ExtensionManager } from '../../extensions/view/model.js';

interface ExtensionRuntime { readonly service: () => ExtensionService; readonly close: () => Promise<void>; readonly cancel: () => Promise<void>; readonly run: ExtensionRun }
const runtimes = new WeakMap<ShellRuntimeContext, ExtensionRuntime>();
export function installExtensionRuntime(context: ShellRuntimeContext, runtime: ShellSessionRuntime, gate: (tool?: string) => ToolGateOptions): void {
  let service: ExtensionService | undefined; let identity: string | undefined;
  let closed = false; let retiredUnknown = false;
  const retiring = new Set<Promise<void>>();
  runtimes.set(context, { run: operation => runtime.commands.run(operation), cancel: async () => { await service?.cancel(); }, close: async () => {
    closed = true;
    const results = await Promise.allSettled([...retiring, ...(service ? [service.close()] : [])]);
    if (retiredUnknown || results.some(result => result.status === 'rejected')) throw new Error('Extension cleanup remains unknown; runtime reentry is blocked.');
  }, service: () => {
    if (closed || retiredUnknown) throw new Error('Extension runtime is closed or prior cleanup is unknown.');
    const key = `${context.session.id}:${context.cwd}`;
    if (!service || identity !== key) {
      if (service) {
        const retirement = service.close().catch(() => { retiredUnknown = true; }).finally(() => retiring.delete(retirement));
        retiring.add(retirement);
      }
      identity = key; const session = context.session.id; const root = context.cwd;
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
export function cancelExtensionsFor(context: ShellRuntimeContext): void { void runtimes.get(context)?.cancel(); }
export async function closeExtensionsFor(context: ShellRuntimeContext): Promise<void> { await runtimes.get(context)?.close(); }
export function refreshExtensionsFor(context: ShellRuntimeContext): void { runtimes.get(context)?.service(); }
export function extensionManagerFor(context: ShellRuntimeContext): ExtensionManager | undefined {
  const runtime = runtimes.get(context);
  if (!runtime) return undefined;
  try {
    const service = runtime.service();
    const binding = JSON.stringify([context.session.id, context.session.createdAt, context.session.projectRoot, context.cwd]);
    const admitted = configurationAdmission(context);
    const admission = () => binding !== JSON.stringify([context.session.id, context.session.createdAt, context.session.projectRoot, context.cwd])
      ? 'Extension binding changed.' : admitted();
    return extensionManager(service, admission, runtime.run);
  } catch { return undefined; }
}
export function isExtensionControl(text: string): boolean { return /^\/(?:plugin|plugins|extensions)(?:\s+(?:cancel|list|details|disable|revoke|reload)(?:\s|$)|\s*$)|^\/reload-plugins(?:\s|$)/i.test(text.trim()); }
