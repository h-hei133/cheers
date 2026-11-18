import fs from 'node:fs';
import path from 'node:path';
import { registerCatalogContribution, type CatalogContribution } from '../../core/catalog/contributions.js';
import { loadInProcessExtensionAsync, type ExtensionHostBridge } from '../../extensions/runtime/inProcessLoader.js';
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
import type { SessionManager } from '../../session/SessionManager.js';
import { cancelExtensionUiFor, closeExtensionHost, installExtensionHost } from './extensions/host.js';
import { runExtensionInvocation } from '../../extensions/runtime/context.js';
import { runEventHandlers } from '../../extensions/events/dispatch.js';
import type { CoreMcpGateway } from '../../core/mcp/gateway.js';
export { bindExtensionUiFor, extensionHostFor } from './extensions/host.js';

interface ExtensionRuntime { readonly service: () => ExtensionService; readonly ready: () => Promise<void>; readonly close: () => Promise<void>; readonly cancel: () => Promise<void>; readonly run: ExtensionRun }
const runtimes = new WeakMap<ShellRuntimeContext, ExtensionRuntime>();
export function installExtensionRuntime(context: ShellRuntimeContext, runtime: ShellSessionRuntime, gate: (tool?: string) => ToolGateOptions, store?: SessionManager,
  gateway?: Pick<CoreMcpGateway, 'peekSnapshot'>): void {
  let service: ExtensionService | undefined; let identity: string | undefined;
  let closed = false; let retiredUnknown = false;
  const cliCleanups: Array<() => void> = [];
  const retiring = new Set<Promise<void>>();
  let initialization: AbortController | undefined;
  let initializing = false;
  let ready: Promise<void> = Promise.resolve();
  runtimes.set(context, { run: operation => runtime.commands.run(operation), ready: () => ready, cancel: async () => { if (initializing) initialization?.abort(); await service?.cancel(); }, close: async () => {
    closed = true;
    closeExtensionHost(context);
    initialization?.abort();
    cliCleanups.splice(0).forEach(unregister => unregister());
    const results = await Promise.allSettled([...retiring, ...(service ? [service.close()] : [])]);
    await ready.catch(() => {});
    if (retiredUnknown || results.some(result => result.status === 'rejected')) throw new Error('Extension cleanup remains unknown; runtime reentry is blocked.');
  }, service: () => {
    if (closed || retiredUnknown) throw new Error('Extension runtime is closed or prior cleanup is unknown.');
    const key = JSON.stringify([context.session.id, context.session.createdAt, context.cwd, context.configuration.substrateRevision, context.workspaceRevision]);
    if (!service || identity !== key) {
      initialization?.abort();
      if (service) {
        const retirement = service.close().catch(() => { retiredUnknown = true; }).finally(() => retiring.delete(retirement));
        retiring.add(retirement);
      }
      identity = key; const session = context.session.id; const root = context.cwd;
      const extensionHost = installExtensionHost(context, runtime, store, gateway);
      const check = () => { const refused = configurationAdmission(context)() ?? (context.session.id !== session || context.cwd !== root ? 'Extension session or workspace changed.' : undefined); if (refused) throw new Error(refused); };
      service = new ExtensionService({ root, gate: tool => ({ ...gate(tool), admission: () => gate(tool).admission?.() ?? (context.session.id !== session || context.cwd !== root ? 'Extension session changed.' : undefined) }),
        check, extensionHost, offline: () => context.runtimeConfig.offline === true, denyRules: () => context.runtimeConfig.denyRules,
        assertSourceAccess: absolute => { check(); assertSourceAccess(absolute, context.projectRoot ?? root, context.session.workspaceRoots, runtime.getPermissionScope(), context.runtimeConfig.denyRules); },
        assertWorkspace: write => { check(); const primary = context.projectRoot ?? root; assertSourceAccess(root, primary, context.session.workspaceRoots, runtime.getPermissionScope(), context.runtimeConfig.denyRules); if (write) selectWorkspaceRoot(primary, context.session.workspaceRoots ?? [], root, 'write'); } });
      cliCleanups.splice(0).forEach(unregister => unregister());
      initialization = new AbortController();
      initializing = true;
      const signal = initialization.signal;
      ready = registerCliExtensions(context, root, session, cliCleanups, (absolute) => {
        signal.throwIfAborted();
        check();
        assertSourceAccess(absolute, context.projectRoot ?? root, context.session.workspaceRoots, runtime.getPermissionScope(), context.runtimeConfig.denyRules);
      }, gate, signal, extensionHost);
      // Consumers await the same initialization; observe failures during startup as well.
      void ready.then(() => { if (initialization?.signal === signal) initializing = false; }, () => {
        if (initialization?.signal === signal) { initializing = false; initialization.abort(); }
      });
    }
    return service;
  } });
  runtimes.get(context)!.service();
}

function resolveExtensionEntryFile(candidate: string): string {
  const resolved = path.resolve(candidate);
  if (fs.existsSync(resolved) && fs.statSync(resolved).isDirectory()) {
    for (const entry of ['index.ts', 'index.mts', 'index.mjs', 'index.js']) {
      const indexFile = path.join(resolved, entry);
      if (fs.existsSync(indexFile)) return indexFile;
    }
  }
  return resolved;
}

async function registerCliExtensions(
  context: ShellRuntimeContext,
  root: string,
  sessionId: string,
  cleanups: Array<() => void>,
  assertEntryAccess: (absolute: string) => void,
  gate: (tool?: string) => ToolGateOptions,
  signal: AbortSignal,
  host: ExtensionHostBridge,
): Promise<void> {
  const paths = context.cliExtensionPaths;
  if (!paths?.length) return;
  const baseDir = context.originalCwd || root;
  const pendingCleanups: Array<() => void> = [];
  const contributions: CatalogContribution[] = [];
  try {
    for (const rawPath of paths) {
      const filePath = resolveExtensionEntryFile(path.isAbsolute(rawPath) ? rawPath : path.join(baseDir, rawPath));
      assertEntryAccess(filePath);
      const loaded = await loadInProcessExtensionAsync({
        filePath,
        workspaceRoot: root,
        denyRules: () => context.runtimeConfig.denyRules,
        signal,
        host,
      });
      assertEntryAccess(filePath);
      const guardedTools = loaded.tools.map((tool) => ({
        ...tool,
        execute: async (args: Record<string, unknown>, toolContext: Parameters<typeof tool.execute>[1]) => {
          const g = gate(tool.name);
          const blocked = g.admission?.();
          if (blocked) throw new Error(blocked);
          return tool.execute(args, { ...toolContext, admission: g.admission ?? toolContext.admission });
        },
      }));
      const onEvent = loaded.handlers.size > 0
        ? async (event: string, payload: unknown, aliases?: readonly string[], signal?: AbortSignal) => runExtensionInvocation(host.ui, signal,
          () => runEventHandlers({ handlers: loaded.handlers, event, payload, aliases, signal, ownerSignal: loaded.signal }))
        : undefined;
      contributions.push({
        root,
        sessionId,
        commands: loaded.commands,
        tools: guardedTools,
        virtualModels: loaded.virtualModels,
        signal: loaded.signal,
        skills: () => [],
        ...(onEvent ? { onEvent } : {}),
      });
    }
    signal.throwIfAborted();
    for (const contribution of contributions) pendingCleanups.push(registerCatalogContribution(contribution, context.configuration.current.catalog));
    cleanups.push(...pendingCleanups);
  } catch (error) {
    pendingCleanups.splice(0).forEach(unregister => unregister());
    throw error;
  }
}
export function extensionCommandFor(context: ShellRuntimeContext): NonNullable<CommandContext['extensionCommand']> {
  return async (kind, args, commandContext) => {
    if (commandContext.sessionId !== context.session.id || commandContext.cwd !== context.cwd) return { kind: 'local', output: 'Extensions refused: session or workspace changed.' };
    const service = runtimes.get(context)?.service();
    return service ? kind === 'marketplace' ? marketplaceCommand(args, service) : pluginCommand(args, service) : { kind: 'local', output: 'Extensions require a bound session runtime.' };
  };
}
export function cancelExtensionsFor(context: ShellRuntimeContext): void { cancelExtensionUiFor(context); void runtimes.get(context)?.cancel(); }
export async function closeExtensionsFor(context: ShellRuntimeContext): Promise<void> { await runtimes.get(context)?.close(); }
export function refreshExtensionsFor(context: ShellRuntimeContext): void { runtimes.get(context)?.service(); }
export async function waitForExtensionsFor(context: ShellRuntimeContext): Promise<void> {
  const runtime = runtimes.get(context);
  runtime?.service();
  await runtime?.ready();
}
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
