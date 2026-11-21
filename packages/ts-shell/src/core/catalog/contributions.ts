import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { createStateChanges } from '../state/changes.js';
import { captureMessageRenderer, MAX_MESSAGE_RENDERERS, rendererType, type InstalledMessageRenderers,
  type RegisteredMessageRenderer } from '../../extensions/runtime/renderer.js';
import { captureExtensionMcpServer, MAX_EXTENSION_MCP_SERVERS, type RegisteredMcpServer } from '../../extensions/runtime/mcp.js';
import { captureExtensionProvider, EXTENSION_MODEL_PREFIX, MAX_EXTENSION_PROVIDERS } from '../../extensions/runtime/provider.js';
import { commandInvocations } from '../commands/invocation.js';
import type { CommandDefinition } from '../commands/types.js';
import type { Skill } from '../skills/skillLoader.js';
import type { SkillDiscovery } from '../skills/discovery.js';
import type { ToolDefinition } from '../../tools/types.js';
import { registerExtensionEventProvider } from '../hooks/extensionBridge.js';
import type { ExtensionEventRunner } from '../hooks/extensionBridge.js';
import type { CatalogProvider } from '../models/catalog.js';
import type { CapturedVirtualModelDefinition } from '../models/virtual/contract.js';
import { captureVirtualDefinitions, MAX_VIRTUAL_MODELS } from '../models/virtual/capture.js';
import {snapshotData} from '../values/data.js';
import {callbackCancellation, captureCallbackResult} from '../values/promise.js';
import {InputRefusal} from '../hooks/input/error.js';
import {captureCompactResult} from '../../extensions/events/compact.js';
import {captureToolResult} from '../../extensions/events/result.js';
import { captureMessageResult } from '../../extensions/events/message.js';
import { mcpExtensionApproval, mcpStdioLaunch, type McpExtensionApproval, type McpStdioLaunch } from '../mcp/config/stdio.js';

interface StdioMcpContribution extends McpStdioLaunch {
  readonly name: string;
  readonly approval: McpExtensionApproval;
  readonly assertCurrent: () => void;
  readonly extensionOwner?: string;
}

/** Neutral session composition port. The feature owner retains lifecycle and authority. */
export interface CatalogContribution {
  readonly root: string;
  readonly sessionId: string;
  readonly commands: readonly CommandDefinition[];
  readonly tools: readonly ToolDefinition[];
  readonly skills: (signal?: AbortSignal, discovery?: SkillDiscovery) => readonly Skill[] | Promise<readonly Skill[]>;
  readonly onEvent?: (event: string, payload: unknown, aliases?: readonly string[], signal?: AbortSignal) => Promise<unknown>;
  readonly virtualModels?: readonly CapturedVirtualModelDefinition[];
  readonly messageRenderers?: readonly RegisteredMessageRenderer[];
  readonly installedRenderers?: readonly InstalledMessageRenderers[];
  readonly mcpServers?: readonly RegisteredMcpServer[];
  readonly stdioMcpServers?: readonly StdioMcpContribution[];
  readonly providers?: readonly CatalogProvider[];
  readonly providerAdmission?: () => void;
  /** The generation that owns these callbacks, independent of an individual request. */
  readonly signal?: AbortSignal;
}
const entries = new Set<CatalogContribution>();
const changes = createStateChanges();
export function registerCatalogContribution(entry: CatalogContribution, physicalCatalog: readonly CatalogProvider[] = []): () => void {
  // Capture caller properties before any collision decisions; getters may register another owner.
  entry = { ...entry };
  entry = { ...entry, root: path.resolve(entry.root) };
  const signal = entry.signal;
  const assertSignal = signal && AbortSignal.prototype.throwIfAborted.bind(signal);
  assertSignal?.();
  let active = true;
  const eventLifetime = new AbortController();
  const admission = () => { if (!active) throw new Error('Catalog contribution is retired.'); assertSignal?.(); };
  const virtualModels = captureVirtualDefinitions(entry.virtualModels ?? [], admission);
  const providers = Object.freeze((entry.providers ?? []).map(({ id, label, runtime, baseUrl, models }) =>
    captureExtensionProvider(id, { label, runtime, baseUrl, models })));
  const assertProviders = entry.providerAdmission;
  const providerAdmission = () => { admission(); assertProviders?.(); admission(); };
  const activeProviders = catalogContributions(entry.root, entry.sessionId).flatMap(contributedProviders);
  if (providers.length + activeProviders.length > MAX_EXTENSION_PROVIDERS) throw new Error('Extension provider registration limit exceeded.');
  const registeredProviders = [...activeProviders, ...providers];
  if (new Set(registeredProviders.map(value => value.id)).size !== registeredProviders.length
    || new Set(registeredProviders.map(value => JSON.stringify([value.runtime, value.baseUrl]))).size !== registeredProviders.length
    || providers.some(provider => physicalCatalog.some(existing => existing.id === provider.id))) {
    throw new Error('Extension provider registration collision.');
  }
  const mcpServers = Object.freeze((entry.mcpServers ?? []).map(({ name, config }) => {
    const definition = captureExtensionMcpServer(name, { url: config.url, enabled: config.enabled });
    return Object.freeze({ name: definition.name, config: Object.freeze({ ...definition.config, extensionOwner: randomUUID() }) });
  }));
  const stdioMcpServers = Object.freeze((entry.stdioMcpServers ?? []).map(server => {
    const assertCurrent = server.assertCurrent;
    return Object.freeze({ ...mcpStdioLaunch(server.command, server.args), name: server.name,
      approval: mcpExtensionApproval(server.approval), extensionOwner: randomUUID(),
      assertCurrent: () => { admission(); assertCurrent(); admission(); } });
  }));
  const activeServers = catalogContributions(entry.root, entry.sessionId).flatMap(value => [...value.mcpServers ?? [], ...value.stdioMcpServers ?? []]);
  const serverNames = [...activeServers, ...mcpServers, ...stdioMcpServers].map(server => server.name);
  if (serverNames.length > MAX_EXTENSION_MCP_SERVERS) throw new Error('Extension MCP server registration limit exceeded.');
  if (new Set(serverNames).size !== serverNames.length) {
    throw new Error('Extension MCP server registration collision.');
  }
  const activeRenderers = catalogContributions(entry.root, entry.sessionId).flatMap(value => [
    ...(value.messageRenderers ?? []).map(renderer => renderer.customType),
    ...(value.installedRenderers ?? []).flatMap(renderer => renderer.customTypes),
  ]);
  const messageRenderers = Object.freeze((entry.messageRenderers ?? []).map(renderer => {
    const definition = captureMessageRenderer(renderer.customType, renderer.render);
    return Object.freeze({ customType: definition.customType, render: (message: Parameters<typeof definition.render>[0]) => {
      admission();
      const result = definition.render(message);
      admission();
      return result;
    } });
  }));
  const installedRenderers = Object.freeze((entry.installedRenderers ?? []).map(renderer => {
    const customTypes = Object.freeze(renderer.customTypes.map(rendererType));
    const assertCurrent = renderer.admission;
    const renderBatch = renderer.renderBatch;
    const current = () => { admission(); assertCurrent(); admission(); };
    return Object.freeze({ customTypes, admission: current,
      renderBatch: async (messages: Parameters<typeof renderBatch>[0], signal: AbortSignal) => {
        current();
        const active = AbortSignal.any([signal, eventLifetime.signal]);
        active.throwIfAborted();
        const result = await renderBatch(messages, active);
        active.throwIfAborted();
        current();
        return result;
      } });
  }));
  const rendererTypes = [...activeRenderers, ...messageRenderers.map(value => value.customType),
    ...installedRenderers.flatMap(value => value.customTypes)];
  if (rendererTypes.length > MAX_MESSAGE_RENDERERS) throw new Error('Message renderer registration limit exceeded.');
  if (new Set(rendererTypes).size !== rendererTypes.length) {
    throw new Error('Message renderer registration collision.');
  }
  const existing = catalogContributions(entry.root, entry.sessionId).flatMap(value => value.commands).flatMap(commandInvocations).map(value => value.name);
  const invocations = entry.commands.flatMap(commandInvocations).map(value => value.name);
  if (new Set(invocations).size !== invocations.length || invocations.some(value => existing.includes(value))) throw new Error('Dynamic command registration collision.');
  const toolNames = entry.tools.map(tool => tool.name); const existingTools = catalogContributions(entry.root, entry.sessionId).flatMap(value => value.tools).map(tool => tool.name);
  if (new Set(toolNames).size !== toolNames.length || toolNames.some(value => existingTools.includes(value))) throw new Error('Dynamic tool registration collision.');
  const priorVirtualModels = catalogContributions(entry.root, entry.sessionId).flatMap(value => value.virtualModels ?? []);
  const allProviders = [...physicalCatalog, ...registeredProviders];
  if ([...priorVirtualModels, ...virtualModels].some(model => allProviders.some(provider =>
    (provider.id === model.provider || registeredProviders.includes(provider) && `${EXTENSION_MODEL_PREFIX}${provider.id}` === model.provider)
      && provider.models.some(value => value.id === model.id)))) {
    throw new Error('Virtual model registration collides with a physical model.');
  }
  const currentModels = priorVirtualModels;
  if (virtualModels.length + currentModels.length > MAX_VIRTUAL_MODELS) throw new Error('Virtual model registration limit exceeded.');
  const identities = new Set(currentModels.map(model => JSON.stringify([model.provider, model.id])));
  for (const model of virtualModels) {
    const key = JSON.stringify([model.provider, model.id]);
    if (identities.has(key)) throw new Error('Virtual model registration collision.');
    identities.add(key);
  }
  const originalOnEvent = entry.onEvent;
  const onEvent: ExtensionEventRunner | undefined = originalOnEvent && Object.assign(async (event: string, payload: unknown, aliases?: readonly string[], callerSignal?: AbortSignal) => {
    admission();
    const currentSignal = callerSignal ? AbortSignal.any([eventLifetime.signal, callerSignal]) : eventLifetime.signal;
    const assertCurrentSignal = AbortSignal.prototype.throwIfAborted.bind(currentSignal);
    assertCurrentSignal();
    const input = event === 'input' || event === 'UserPromptSubmit';
    const compact = event === 'session_before_compact';
    const toolResult = event === 'tool_result';
    const messageEnd = event === 'message_end';
    const result = input || compact || toolResult || messageEnd
      ? (await captureCallbackResult<unknown>(() => originalOnEvent(event, payload, aliases, currentSignal),
        compact ? captureCompactResult : toolResult ? captureToolResult : messageEnd ? captureMessageResult
          : value => value === undefined ? undefined : snapshotData(value, {bytes:64*1024*1024, nodes:4096, depth:12, allowCrossRealm:true}),
        {check:() => {admission(); assertCurrentSignal();}, cancellation:callbackCancellation(currentSignal),
          ...(input ? { invalid:() => new InputRefusal(), failed:() => new InputRefusal(), cancelled:() => new InputRefusal() } : {})})).value
      : await originalOnEvent(event, payload, aliases, currentSignal);
    admission(); assertCurrentSignal();
    return result;
  }, { admission });
  const captured = Object.freeze({ ...entry, root: path.resolve(entry.root), virtualModels, messageRenderers, installedRenderers,
    mcpServers, stdioMcpServers, providers, providerAdmission, ...(onEvent ? { onEvent } : {}) });
  const retire = () => {
    if (!active) return;
    active = false;
    if (signal) EventTarget.prototype.removeEventListener.call(signal, 'abort', retire);
    const removed = entries.delete(captured);
    eventLifetime.abort();
    if (removed) changes.notify(captured.root, '*');
  };
  if (signal) EventTarget.prototype.addEventListener.call(signal, 'abort', retire, { once: true });
  admission(); entries.add(captured);
  try { admission(); } catch (error) { retire(); throw error; }
  changes.notify(captured.root, '*');
  return retire;
}
export function catalogContributions(root = process.cwd(), sessionId?: string): readonly CatalogContribution[] {
  const selected = [...entries].filter(entry => path.resolve(entry.root) === path.resolve(root) && (sessionId === undefined || entry.sessionId === sessionId));
  // A root-only compatibility caller cannot borrow one of several sessions' gates.
  return sessionId === undefined && new Set(selected.map(entry => entry.sessionId)).size > 1 ? [] : selected;
}
export function contributedProviders(entry: CatalogContribution): readonly CatalogProvider[] {
  if (!entry.providers?.length) return [];
  try { entry.providerAdmission?.(); return entry.providers; }
  catch { return []; }
}
export function observeCatalogContributions(root: string | undefined, changed: () => void): () => void { return changes.subscribe(root === undefined ? '*' : path.resolve(root), changed); }

registerExtensionEventProvider((root, sessionId) =>
  catalogContributions(root, sessionId).flatMap(entry => (entry.onEvent ? [entry.onEvent] : [])),
);
