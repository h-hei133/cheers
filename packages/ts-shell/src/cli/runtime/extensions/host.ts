import { catalogContributions } from '../../../core/catalog/contributions.js';
import { createCommandRegistry } from '../../../core/commands/registry.js';
import { configurationAdmission } from '../../../core/shell/configuration.js';
import type { ShellRuntimeContext } from '../../../core/shell/runtimeContext.js';
import type { ShellSessionRuntime } from '../../../core/shell/sessionRuntime.js';
import { filterVisibleToolNames } from '../../../core/tools/prefilter.js';
import { createCoreToolRegistry } from '../../../tools/registry.js';
import type { ExtensionHostBridge } from '../../../extensions/runtime/inProcessLoader.js';
import { resolveUiHost, type ExtensionUiHost } from '../../../extensions/runtime/ui.js';
import type { SessionManager } from '../../../session/SessionManager.js';
import type { CoreMcpGateway } from '../../../core/mcp/gateway.js';
import { queueExtensionMessage } from '../inputQueue.js';
import { sessionThinkingSetter } from './model.js';

interface UiBinding {
  host: Required<ExtensionUiHost>;
  readonly release: () => void;
  readonly cancel: () => void;
}
interface HostState {
  readonly host: ExtensionHostBridge;
  readonly admission: () => string | undefined;
  readonly uiAdmission: () => string | undefined;
  readonly quiesce: () => void;
  readonly close: () => void;
  refreshUi?: () => void;
}
const hosts = new WeakMap<ShellRuntimeContext, HostState>();
const surfaces = new WeakMap<ShellRuntimeContext, UiBinding>();

/** Share one session host between file, installed and embedded extensions. */
export function installExtensionHost(context: ShellRuntimeContext, runtime: ShellSessionRuntime, store?: SessionManager,
  gateway?: Pick<CoreMcpGateway, 'peekSnapshot'>, validateStartup?: () => boolean): ExtensionHostBridge {
  hosts.get(context)?.close();
  const sessionId = context.session.id;
  const createdAt = context.session.createdAt;
  const root = context.cwd;
  const replacement = runtime.commands.current && ['session-change', 'extension-reload'].includes(runtime.commands.current.kind) ? runtime.commands.current : undefined;
  const configured = configurationAdmission(context);
  let closed = false;
  let closing = false;
  let lastUi: UiBinding | undefined;
  const admission = () => closed || context.session.id !== sessionId || context.session.createdAt !== createdAt || context.cwd !== root
    ? 'Extension session or workspace changed.' : configured();
  const check = () => { const refusal = admission(); if (refusal) throw new Error(refusal); };
  const operations = () => {
    check();
    if (closing) throw new Error('Extension session is closing.');
    if (validateStartup?.() === false) throw new Error('Extension startup arguments have not been admitted.');
  };
  const uiAdmission = () => admission() ?? (closing ? 'Extension session is closing.' : undefined);
  const allTools = () => {
    check();
    return [...new Set([...createCoreToolRegistry().keys(), ...catalogContributions(root, sessionId).flatMap(entry => entry.tools.map(tool => tool.name)),
      ...(gateway?.peekSnapshot()?.tools.map(tool => tool.qualifiedName) ?? [])])];
  };
  const host: ExtensionHostBridge = {
    get ui() {
      if (uiAdmission()) { lastUi?.release(); return lastUi?.host; }
      state.refreshUi?.();
      lastUi = surfaces.get(context);
      return lastUi?.host;
    },
    getActiveTools: () => { check(); return runtime.input?.()?.activeTools?.() ?? filterVisibleToolNames(allTools(), context.runtimeConfig); },
    getAllTools: allTools,
    getCommands: () => { check(); return [...new Set([...createCommandRegistry(root, context.runtimeConfig).keys(),
      ...catalogContributions(root, sessionId).flatMap(entry => entry.commands.map(command => command.name))])]; },
    setThinkingLevel: sessionThinkingSetter(context, runtime, operations),
    sendMessage: async message => {
      operations();
      if (typeof message !== 'string' || !message.trim()) throw new Error('Extension message must be nonempty text.');
      const input = runtime.input();
      if (input) input.followUp(message, 'extension');
      else if (runtime.commands.current && ['session-change', 'extension-reload'].includes(runtime.commands.current.kind) && runtime.commands.current !== replacement) throw new Error('Messages are unavailable before session replacement.');
      else if (queueExtensionMessage(runtime, message, uiAdmission)) return;
      else await runtime.executePrompt(sessionId, message, { outputMode: 'print', inputSource:'extension' });
    },
    appendEntry: async (customType, data) => {
      operations();
      if (!store) throw new Error('Extension entry storage is unavailable.');
      const write = store.captureReportWriter(sessionId);
      const text = typeof data === 'string' ? data : JSON.stringify(data);
      operations();
      const result = write({ version: 1, title: `extension:${customType}`, facts: { customType },
        lines: [{ kind: 'text', spans: [{ text: text ?? '', role: 'text' }] }] });
      if (result !== 'saved') throw new Error(result === 'unverified' ? 'Extension entry persistence is unverified.' : 'Extension entry was not saved.');
    },
  };
  const state: HostState = { host, admission, uiAdmission, quiesce: () => {
    const ownedSurface = hosts.get(context) === state ? surfaces.get(context) : undefined;
    closing = true;
    state.refreshUi = undefined;
    lastUi?.release();
    ownedSurface?.release();
  }, close: () => {
    const ownedSurface = hosts.get(context) === state ? surfaces.get(context) : undefined;
    closed = true;
    state.refreshUi = undefined;
    lastUi?.release();
    ownedSurface?.release();
  } };
  hosts.set(context, state);
  return host;
}

export function extensionHostFor(context: ShellRuntimeContext): ExtensionHostBridge | undefined {
  return hosts.get(context)?.host;
}

/** Stop new operations while the original generation remains available to shutdown observers. */
export function quiesceExtensionHost(context: ShellRuntimeContext, expected?: ExtensionHostBridge): void {
  const state = hosts.get(context);
  if (state && (!expected || state.host === expected)) state.quiesce();
}

/** A consumer retains renewal authority; all shared-host callers acquire its current surface. */
export function bindExtensionUiRefreshFor(context: ShellRuntimeContext, refresh: () => void): () => void {
  const state = hosts.get(context);
  if (state) state.refreshUi = refresh;
  return () => { if (state?.refreshUi === refresh) state.refreshUi = undefined; };
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
    const refusal = state?.uiAdmission() || admitted();
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
  if (background.aborted || state?.uiAdmission() || admitted()) release();
  return release;
}

export function closeExtensionHost(context: ShellRuntimeContext, expected?: ExtensionHostBridge): void {
  const state = hosts.get(context);
  if (expected && state?.host !== expected) return;
  const surface = surfaces.get(context);
  try { state?.close(); } finally { surface?.release(); }
}

/** Cancel current dialogs while keeping the same surface available for later calls. */
export function cancelExtensionUiFor(context: ShellRuntimeContext): void {
  const current = surfaces.get(context);
  current?.cancel();
}
