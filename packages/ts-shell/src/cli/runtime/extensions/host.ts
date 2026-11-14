import { catalogContributions } from '../../../core/catalog/contributions.js';
import { createCommandRegistry } from '../../../core/commands/registry.js';
import { configurationAdmission } from '../../../core/shell/configuration.js';
import type { ShellRuntimeContext } from '../../../core/shell/runtimeContext.js';
import type { ShellSessionRuntime } from '../../../core/shell/sessionRuntime.js';
import { filterVisibleToolNames } from '../../../core/tools/prefilter.js';
import { createCoreToolRegistry } from '../../../core/tools/registry.js';
import type { ExtensionHostBridge } from '../../../extensions/runtime/inProcessLoader.js';
import { resolveUiHost, type ExtensionUiHost } from '../../../extensions/runtime/ui.js';
import type { SessionManager } from '../../../session/SessionManager.js';
import type { CoreMcpGateway } from '../../../core/mcp/gateway.js';

interface UiBinding {
  host: Required<ExtensionUiHost>;
  readonly release: () => void;
  readonly cancel: () => void;
}
interface HostState {
  readonly host: ExtensionHostBridge;
  readonly admission: () => string | undefined;
  readonly close: () => void;
}
const hosts = new WeakMap<ShellRuntimeContext, HostState>();
const surfaces = new WeakMap<ShellRuntimeContext, UiBinding>();

/** Share one session host between file, installed and embedded extensions. */
export function installExtensionHost(context: ShellRuntimeContext, runtime: ShellSessionRuntime, store?: SessionManager,
  gateway?: Pick<CoreMcpGateway, 'peekSnapshot'>): ExtensionHostBridge {
  hosts.get(context)?.close();
  const sessionId = context.session.id;
  const createdAt = context.session.createdAt;
  const root = context.cwd;
  const configured = configurationAdmission(context);
  let closed = false;
  let lastUi: UiBinding | undefined;
  const admission = () => closed || context.session.id !== sessionId || context.session.createdAt !== createdAt || context.cwd !== root
    ? 'Extension session or workspace changed.' : configured();
  const check = () => { const refusal = admission(); if (refusal) throw new Error(refusal); };
  const allTools = () => {
    check();
    return [...new Set([...createCoreToolRegistry().keys(), ...catalogContributions(root, sessionId).flatMap(entry => entry.tools.map(tool => tool.name)),
      ...(gateway?.peekSnapshot()?.tools.map(tool => tool.qualifiedName) ?? [])])];
  };
  const host: ExtensionHostBridge = {
    get ui() {
      if (admission()) { lastUi?.release(); return lastUi?.host; }
      lastUi = surfaces.get(context);
      return lastUi?.host;
    },
    getActiveTools: () => { check(); return runtime.input?.()?.activeTools?.() ?? filterVisibleToolNames(allTools(), context.runtimeConfig); },
    getAllTools: allTools,
    getCommands: () => { check(); return [...new Set([...createCommandRegistry(root, context.runtimeConfig).keys(),
      ...catalogContributions(root, sessionId).flatMap(entry => entry.commands.map(command => command.name))])]; },
    sendMessage: async message => {
      check();
      if (typeof message !== 'string' || !message.trim()) throw new Error('Extension message must be nonempty text.');
      const input = runtime.input();
      if (input) input.followUp(message, 'extension');
      else await runtime.executePrompt(sessionId, message, { outputMode: 'print' });
    },
    appendEntry: async (customType, data) => {
      check();
      if (!store) throw new Error('Extension entry storage is unavailable.');
      const write = store.captureReportWriter(sessionId);
      const text = typeof data === 'string' ? data : JSON.stringify(data);
      check();
      const result = write({ version: 1, title: `extension:${customType}`, facts: { customType },
        lines: [{ kind: 'text', spans: [{ text: text ?? '', role: 'text' }] }] });
      if (result !== 'saved') throw new Error(result === 'unverified' ? 'Extension entry persistence is unverified.' : 'Extension entry was not saved.');
    },
  };
  const state: HostState = { host, admission, close: () => {
    closed = true;
    lastUi?.release();
    if (hosts.get(context) === state) surfaces.get(context)?.release();
  } };
  hosts.set(context, state);
  return host;
}

export function extensionHostFor(context: ShellRuntimeContext): ExtensionHostBridge | undefined {
  return hosts.get(context)?.host;
}

/** Surface replacement cancels old work; its late release cannot retire its successor. */
export function bindExtensionUiFor(context: ShellRuntimeContext, ui: ExtensionUiHost, onRelease?: () => void): () => void {
  // A surface can exist without any configured extensions, including test hosts.
  const state = hosts.get(context);
  surfaces.get(context)?.release();
  let controller = new AbortController();
  let surface: ExtensionUiHost | undefined = ui;
  let releasedCallback = onRelease;
  const admitted = configurationAdmission(context);
  const background = context.configuration.backgroundSignal;
  let released = false;
  const release = () => {
    if (released) return;
    released = true;
    background.removeEventListener('abort', release);
    controller.abort();
    surface = undefined;
    const callback = releasedCallback;
    releasedCallback = undefined;
    callback?.();
  };
  const admission = () => {
    const refusal = state?.admission() || admitted();
    if (refusal) release();
    return refusal;
  };
  const capture = () => {
    const signal = controller.signal;
    return resolveUiHost(() => ({ host: surface, signal, admission }));
  };
  const binding: UiBinding = { host: capture(), release, cancel: () => {
    if (released) return;
    controller.abort();
    controller = new AbortController();
    binding.host = capture();
  } };
  surfaces.set(context, binding);
  background.addEventListener('abort', release, { once: true });
  if (background.aborted || state?.admission() || admitted()) release();
  return release;
}

export function closeExtensionHost(context: ShellRuntimeContext): void {
  hosts.get(context)?.close();
  surfaces.get(context)?.release();
}

/** Cancel current dialogs while keeping the same surface available for later calls. */
export function cancelExtensionUiFor(context: ShellRuntimeContext): void {
  const current = surfaces.get(context);
  current?.cancel();
}
