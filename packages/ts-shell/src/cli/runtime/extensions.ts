import { registerCatalogContribution, type CatalogContribution } from '../../core/catalog/contributions.js';
import type { ExtensionHostBridge, ExtensionShortcut } from '../../extensions/runtime/inProcessLoader.js';
import type { ShellRuntimeContext } from '../../core/shell/runtimeContext.js';
import type { ShellSessionRuntime } from '../../core/shell/sessionRuntime.js';
import type { ToolGateOptions } from '../../turn/tools.js';
import type { CommandContext } from '../../core/commands/types.js';
import { configurationAdmission } from '../../core/shell/configuration.js';
import { assertSourceAccess } from '../../core/query/sourcePolicy.js';
import { selectWorkspaceRoot } from '../../core/workspace/roots.js';
import { ExtensionService } from '../../extensions/service.js';
import { marketplaceCommand } from '../../extensions/command/marketplace.js';
import { pluginCommand, type PluginCommandResult } from '../../extensions/command/plugin.js';
import { extensionManager, type ExtensionRun } from '../../extensions/view/manager.js';
import type { ExtensionManager } from '../../extensions/view/model.js';
import type { SessionManager } from '../../session/SessionManager.js';
import { cancelExtensionUiFor, closeExtensionHost, extensionHostFor, installExtensionHost } from './extensions/host.js';
import { runExtensionInvocation } from '../../extensions/runtime/context.js';
import { runEventHandlers } from '../../extensions/events/dispatch.js';
import type { CoreMcpGateway } from '../../core/mcp/gateway.js';
import { ExtensionSessionLifecycle } from './extensions/lifecycle.js';
import type { ExtensionSessionEvent } from '../../extensions/events/model.js';
import { createExtensionReload, type ExtensionReloadResult } from './extensions/reload.js';
import { ExtensionShortcuts } from './extensions/shortcuts.js';
import type { CliExtensionArguments } from '../options/extensions.js';
import { loadExtensionFiles, type PreparedExtensionFiles } from './extensions/files.js';
export { bindExtensionUiFor, extensionHostFor } from './extensions/host.js';

interface ExtensionRuntime {
  readonly service: () => ExtensionService; readonly ready: () => Promise<void>; readonly close: () => Promise<void>; readonly cancel: () => Promise<readonly string[]>; readonly run: ExtensionRun;
  readonly start: (reason: Extract<ExtensionSessionEvent, { type: 'session_start' }>['reason'], signal?: AbortSignal) => Promise<void>;
  readonly shutdown: (reason: Extract<ExtensionSessionEvent, { type: 'session_shutdown' }>['reason'], settle?: () => Promise<void>, signal?: AbortSignal) => Promise<void>;
  readonly replace: (signal?: AbortSignal) => Promise<ExtensionHostBridge>;
  readonly retire: () => Promise<void>;
  readonly reload: (signal?: AbortSignal) => Promise<ExtensionReloadResult>;
  readonly current: () => boolean;
  readonly diagnostics: () => readonly string[];
  readonly shortcuts: () => ExtensionShortcuts | undefined;
}
const runtimes = new WeakMap<ShellRuntimeContext, ExtensionRuntime>();
export function installExtensionRuntime(context: ShellRuntimeContext, runtime: ShellSessionRuntime, gate: (tool?: string) => ToolGateOptions, store?: SessionManager,
  gateway?: Pick<CoreMcpGateway, 'peekSnapshot'>, cliArguments?: CliExtensionArguments, startupFiles?: PreparedExtensionFiles): void {
  let service: ExtensionService | undefined; let identity: string | undefined;
  let closed = false; let closing = false; let retiredUnknown = false;
  const cliCleanups: Array<() => void> = [];
  const retiring = new Set<Promise<void>>();
  let initialization: AbortController | undefined;
  let initializing = false;
  let ready: Promise<void> = Promise.resolve();
  let lifecycle: ExtensionSessionLifecycle | undefined;
  let ownedHost: ExtensionHostBridge | undefined;
  let shortcuts: ExtensionShortcuts | undefined;
  let retirement: Promise<void> | undefined;
  const retire = () => retirement ??= Promise.resolve().then(async () => {
    closing = true;
    shortcuts?.retire();
    initialization?.abort();
    const retiringService = service, retiringReady = ready;
    const results = await Promise.allSettled([...cliCleanups.splice(0).map(unregister => Promise.resolve().then(unregister)),
      ...retiring, ...(retiringService ? [Promise.resolve().then(() => retiringService.close())] : [])]);
    await retiringReady.catch(() => {});
    if (retiredUnknown || results.some(result => result.status === 'rejected')) {
      retiredUnknown = true;
      throw new Error('Extension cleanup remains unknown; runtime reentry is blocked.');
    }
    service = undefined;
    identity = undefined;
  });
  const rebind = async (signal?: AbortSignal) => {
    if (closed || runtimes.get(context) !== bound || retiredUnknown || service || retiring.size > 0) throw new Error('Extension retirement must complete before replacement.');
    closing = false;
    retirement = undefined;
    bound.service();
    const controller = initialization;
    const candidate = ownedHost!, prepared = ready;
    const cancel = () => controller?.abort();
    signal?.addEventListener('abort', cancel, { once: true });
    if (signal?.aborted) cancel();
    try {
      await prepared; signal?.throwIfAborted();
      if (closed || runtimes.get(context) !== bound || ownedHost !== candidate || extensionHostFor(context) !== candidate) throw new Error('Extension replacement owner changed.');
      return candidate;
    }
    finally { signal?.removeEventListener('abort', cancel); }
  };
  const bound: ExtensionRuntime = { run: operation => runtime.commands.run(operation), ready: () => ready, shortcuts: () => shortcuts,
    start: (reason, signal) => lifecycle!.start(() => ready, reason, signal),
    shutdown: (reason, settle, signal) => {
      closing = true; shortcuts?.retire();
      return lifecycle!.shutdown(settle ?? (() => runtimes.get(context) === bound ? runtime.cancelAndWait() : Promise.resolve()), reason, signal);
    },
    replace: rebind,
    retire,
    cancel: async () => {
      const command = runtime.commands.current;
      if (runtimes.get(context) === bound && command?.kind === 'extension-reload') {
        command.controller.abort();
        const result = await command.settled as ExtensionReloadResult;
        return 'reason' in result ? [result.reason] : result.diagnostics;
      }
      if (initializing) initialization?.abort();
      const selected = service;
      await selected?.cancel();
      return [...selected?.errors ?? [], ...(retiredUnknown || closing || closed || context.workspaceIssue
        ? ['Extension cancellation is not verified; the original runtime cannot reenter.'] : [])];
    }, close: async () => {
    closed = true;
    shortcuts?.retire();
    const command = runtime.commands.current;
    if (runtimes.get(context) === bound && command?.kind === 'extension-reload') command.controller.abort();
    closeExtensionHost(context, ownedHost);
    await retire();
  }, service: () => {
    if (closed || closing || retiredUnknown) throw new Error('Extension runtime is closing, closed or prior cleanup is unknown.');
    const key = JSON.stringify([context.session.id, context.session.createdAt, context.cwd, context.configuration.substrateRevision, context.workspaceRevision]);
    if (!service || identity !== key) {
      initialization?.abort();
      if (service) {
        const retirement = service.close().catch(() => { retiredUnknown = true; }).finally(() => retiring.delete(retirement));
        retiring.add(retirement);
      }
      identity = key; const session = context.session.id; const root = context.cwd;
      let argumentsAdmitted = !cliArguments;
      const extensionHost = installExtensionHost(context, runtime, store, gateway, () => argumentsAdmitted);
      ownedHost = extensionHost;
      lifecycle = new ExtensionSessionLifecycle(context);
      const check = () => { const refused = configurationAdmission(context)() ?? (context.session.id !== session || context.cwd !== root ? 'Extension session or workspace changed.' : undefined); if (refused) throw new Error(refused); };
      service = new ExtensionService({ root, gate: tool => ({ ...gate(tool), admission: () => gate(tool).admission?.() ?? (context.session.id !== session || context.cwd !== root ? 'Extension session changed.' : undefined) }),
        check, extensionHost, offline: () => context.runtimeConfig.offline === true, denyRules: () => context.runtimeConfig.denyRules,
        assertSourceAccess: absolute => { check(); assertSourceAccess(absolute, context.projectRoot ?? root, context.session.workspaceRoots, runtime.getPermissionScope(), context.runtimeConfig.denyRules); },
        assertWorkspace: write => { check(); const primary = context.projectRoot ?? root; assertSourceAccess(root, primary, context.session.workspaceRoots, runtime.getPermissionScope(), context.runtimeConfig.denyRules); if (write) selectWorkspaceRoot(primary, context.session.workspaceRoots ?? [], root, 'write'); } });
      cliCleanups.splice(0).forEach(unregister => unregister());
      initialization = new AbortController();
      initializing = true;
      const signal = initialization.signal;
      const configured = configurationAdmission(context);
      const createdAt = context.session.createdAt;
      const shortcutBinding = new ExtensionShortcuts(extensionHost, signal, () => !closed && !closing && !initializing
        && ownedHost === extensionHost && extensionHostFor(context) === extensionHost && runtimes.get(context) === bound
        && context.cwd === root && context.session.id === session && context.session.createdAt === createdAt && !configured());
      shortcuts = shortcutBinding;
      const preparedFiles = startupFiles;
      startupFiles = undefined;
      ready = registerCliExtensions(context, root, session, cliCleanups, (absolute) => {
        signal.throwIfAborted();
        check();
        assertSourceAccess(absolute, context.projectRoot ?? root, context.session.workspaceRoots, runtime.getPermissionScope(), context.runtimeConfig.denyRules);
      }, gate, signal, extensionHost, shortcutBinding, cliArguments, preparedFiles).then(() => { argumentsAdmitted = true; });
      // Consumers await the same initialization; observe failures during startup as well.
      void ready.then(() => { if (initialization?.signal === signal) initializing = false; }, () => {
        if (initialization?.signal === signal) { initializing = false; initialization.abort(); }
      });
    }
    return service;
  }, current: () => !closed && runtimes.get(context) === bound, diagnostics: () => service?.errors ?? [], reload: createExtensionReload(context, runtime, {
    current: () => !closed && runtimes.get(context) === bound,
    ready: () => ready,
    shutdown: signal => { closing = true; shortcuts?.retire(); return lifecycle!.shutdown(async () => {}, 'reload', signal); },
    retire, replace: async signal => ({ host: await rebind(signal) }),
    start: signal => lifecycle!.start(() => ready, 'reload', signal),
    diagnostics: () => service?.errors ?? [],
  }) };
  runtimes.set(context, bound);
  runtimes.get(context)!.service();
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
  shortcuts: ExtensionShortcuts,
  cliArguments?: CliExtensionArguments,
  preparedFiles?: PreparedExtensionFiles,
): Promise<void> {
  const paths = context.cliExtensionPaths;
  if (!paths?.length) return;
  const denyRules = () => {
    signal.throwIfAborted();
    const refused = configurationAdmission(context)();
    if (refused) throw new Error(refused);
    return context.runtimeConfig.denyRules;
  };
  const pendingCleanups: Array<() => void> = [];
  const contributions: CatalogContribution[] = [];
  const pendingShortcuts: ExtensionShortcut[] = [];
  try {
    const extensions = preparedFiles ? preparedFiles.bind({ assertEntryAccess, denyRules, signal, host })
      : (await loadExtensionFiles({ paths, baseDir: context.originalCwd || root, root, assertEntryAccess, denyRules,
        signal, host, cliArguments })).extensions;
    for (const loaded of extensions) {
      pendingShortcuts.push(...loaded.shortcuts);
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
    signal.throwIfAborted();
    shortcuts.publish(pendingShortcuts);
    cleanups.push(...pendingCleanups);
  } catch (error) {
    preparedFiles?.retire();
    pendingCleanups.splice(0).forEach(unregister => unregister());
    throw error;
  }
}
export function dispatchExtensionShortcut(context: ShellRuntimeContext, keyId: string, signal: AbortSignal, reportFailure: () => void): boolean {
  return runtimes.get(context)?.shortcuts()?.dispatch(keyId, signal, reportFailure) ?? false;
}
export function extensionCommandFor(context: ShellRuntimeContext) {
  return async (kind: 'marketplace' | 'plugin', args: string[], commandContext: Pick<CommandContext, 'sessionId' | 'cwd' | 'projectRoot' | 'interactive' | 'signal'>,
    explicitApproval = false): Promise<PluginCommandResult> => {
    if (commandContext.sessionId !== context.session.id || commandContext.cwd !== context.cwd) return { kind: 'local', output: 'Extensions refused: session or workspace changed.' };
    const owner = runtimes.get(context);
    if (kind === 'plugin' && args.length === 1 && args[0] === 'reload' && owner) {
      const result = await owner.reload(commandContext.signal);
      return { kind: 'local', output: result.status === 'reloaded' ? 'Extensions reloaded from current reviewed identities and workspace grants.'
        : result.status === 'partial' ? `Extension reload completed with withheld capabilities:\n${result.diagnostics.join('\n')}`
          : `Extension reload ${result.status}: ${result.reason}` };
    }
    if (kind === 'plugin' && args.length === 1 && args[0] === 'cancel' && owner) {
      const diagnostics = await owner.cancel();
      return { kind: 'local', output: diagnostics.length ? `Extension cancellation is not verified:\n${diagnostics.join('\n')}` : 'Extension calls cancelled and drained.' };
    }
    const service = owner?.service();
    return service ? kind === 'marketplace' ? marketplaceCommand(args, service)
      : pluginCommand(args, service, { signal: commandContext.signal, explicitApproval })
      : { kind: 'local', output: 'Extensions require a bound session runtime.' };
  };
}
export function cancelExtensionsFor(context: ShellRuntimeContext): void { cancelExtensionUiFor(context); void runtimes.get(context)?.cancel().catch(() => {}); }
export async function closeExtensionsFor(context: ShellRuntimeContext): Promise<void> { await runtimes.get(context)?.close(); }
export async function startExtensionsFor(context: ShellRuntimeContext, reason: Extract<ExtensionSessionEvent, { type: 'session_start' }>['reason'] = 'startup', signal?: AbortSignal): Promise<void> {
  const owner = runtimes.get(context);
  if (owner) { owner.service(); await owner.start(reason, signal); }
}
export function shutdownExtensionsFor(context: ShellRuntimeContext, reason: Extract<ExtensionSessionEvent, { type: 'session_shutdown' }>['reason'] = 'quit', settle?: () => Promise<void>): Promise<void> {
  const owner = runtimes.get(context);
  return owner ? owner.shutdown(reason, settle) : settle?.() ?? Promise.resolve();
}
/** Explicit replacement reuses the installed runtime, its resource retirement and initialization owners. */
export async function replaceExtensionsFor(context: ShellRuntimeContext): Promise<void> {
  await runtimes.get(context)?.replace();
}
/** Capture the original resource owner before reload schedules its first await. */
export function captureExtensionRuntimeFor(context: ShellRuntimeContext): Pick<ExtensionRuntime, 'current' | 'ready' | 'shutdown' | 'retire' | 'replace' | 'start' | 'diagnostics' | 'close'> | undefined {
  return runtimes.get(context);
}
/** Join the original resources while its session is still published. */
export async function retireExtensionsFor(context: ShellRuntimeContext): Promise<void> {
  await runtimes.get(context)?.retire();
}
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
