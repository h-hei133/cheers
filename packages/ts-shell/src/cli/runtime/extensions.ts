import fs from 'node:fs';
import path from 'node:path';
import { registerCatalogContribution } from '../../core/catalog/contributions.js';
import { loadInProcessExtension } from '../../extensions/runtime/inProcessLoader.js';
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
  const cliCleanups: Array<() => void> = [];
  const retiring = new Set<Promise<void>>();
  runtimes.set(context, { run: operation => runtime.commands.run(operation), cancel: async () => { await service?.cancel(); }, close: async () => {
    closed = true;
    cliCleanups.splice(0).forEach(unregister => unregister());
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
      cliCleanups.splice(0).forEach(unregister => unregister());
      registerCliExtensions(context, root, session, cliCleanups, (absolute) => {
        check();
        assertSourceAccess(absolute, context.projectRoot ?? root, context.session.workspaceRoots, runtime.getPermissionScope(), context.runtimeConfig.denyRules);
      }, gate);
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

function registerCliExtensions(
  context: ShellRuntimeContext,
  root: string,
  sessionId: string,
  cleanups: Array<() => void>,
  assertEntryAccess: (absolute: string) => void,
  gate: (tool?: string) => ToolGateOptions,
): void {
  const paths = context.cliExtensionPaths;
  if (!paths?.length) return;
  const baseDir = context.originalCwd || root;
  try {
    for (const rawPath of paths) {
      const filePath = resolveExtensionEntryFile(path.isAbsolute(rawPath) ? rawPath : path.join(baseDir, rawPath));
      assertEntryAccess(filePath);
      const loaded = loadInProcessExtension({
        filePath,
        workspaceRoot: root,
        denyRules: () => context.runtimeConfig.denyRules,
      });
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
        ? async (event: string, payload: unknown, aliases?: readonly string[]) => {
            let current = payload;
            for (const name of [event, ...(aliases ?? [])]) {
              for (const handler of loaded.handlers.get(name) ?? []) {
                const next = await handler(current);
                if (next !== undefined) current = next;
              }
            }
            return current;
          }
        : undefined;
      cleanups.push(registerCatalogContribution({
        root,
        sessionId,
        commands: loaded.commands,
        tools: guardedTools,
        skills: () => [],
        ...(onEvent ? { onEvent } : {}),
      }));
    }
  } catch (error) {
    cleanups.splice(0).forEach(unregister => unregister());
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
