import type { CatalogProvider } from '../../core/models/catalog.js';
import { loadCatalog } from '../../core/models/catalogStore.js';
import { registerCatalogContribution } from '../../core/catalog/contributions.js';
import { isRecord } from '../../core/values/record.js';
import type { PackageRecord } from '../model.js';
import type { ExtensionCalls } from './calls.js';
import { executeScript, type ExecutionHost } from './execute.js';
import type { InProcessExtensionInvoke } from './inProcessLoader.js';
import { scriptOptions, type InstalledOptionValue } from './options.js';
import { captureExtensionProvider, MAX_EXTENSION_PROVIDERS, type InstalledProvider } from './provider.js';
import { MAX_MESSAGE_RENDERERS, MAX_RENDER_BATCH_BYTES, MAX_RENDER_BATCH_MESSAGES, MAX_RENDER_TEXT_BYTES,
  type InstalledMessageRenderers, type InstalledRenderer } from './renderer.js';

class QualificationCleanupError extends Error {}

interface QualificationHost {
  readonly host: ExecutionHost;
  readonly sessionId: string;
  readonly calls: ExtensionCalls;
  readonly installedValues?: () => readonly InstalledOptionValue[] | undefined;
  readonly physicalCatalog?: () => readonly CatalogProvider[];
  readonly isCurrent: () => boolean;
  readonly current: (record: PackageRecord, grants: readonly string[]) => void;
  readonly publish: (unregister: () => void) => void;
  readonly report: (message: string) => void;
  readonly loseProcessAuthority: () => void;
}

export async function qualifyInstalled(context: QualificationHost, records: readonly PackageRecord[], signal: AbortSignal): Promise<void> {
  const timeout = AbortSignal.any([signal, AbortSignal.timeout(5000)]);
  for (const record of records) {
    if (timeout.aborted || !context.isCurrent()) break;
    const activation = record.activation[context.host.root];
    if (!activation?.enabled) continue;
    const declarations = record.active.manifest.providers ?? [];
    const rendererDeclarations = record.active.manifest.messageRenderers ?? [];
    const admitted = (grant: string, script: string) => {
      if (!activation.grants.includes(grant)) return false;
      if (activation.grants.includes(`script:${script}`)) return true;
      context.report(`${record.name}: ${grant} withheld because the separate script:${script} grant is missing.`);
      return false;
    };
    const providers = declarations.filter(provider => admitted(`provider:${provider.name}`, provider.script));
    const renderers = rendererDeclarations.filter(renderer => admitted(`renderer:${renderer.customType}`, renderer.script));
    for (const script of new Set([...providers, ...renderers].map(entry => entry.script))) {
      if (timeout.aborted || !context.isCurrent()) break;
      const scriptProviders = providers.filter(provider => provider.script === script);
      const scriptRenderers = renderers.filter(renderer => renderer.script === script);
      const providerGrants = scriptProviders.map(provider => `provider:${provider.name}`);
      const rendererGrants = scriptRenderers.map(renderer => `renderer:${renderer.customType}`);
      const check = (names: readonly string[]) => context.current(record, [`script:${script}`, ...names]);
      const current = () => {
        timeout.throwIfAborted();
        check([...providerGrants, ...rendererGrants]);
      };
      try {
        current();
        const flags = scriptOptions(record, context.host.file, script, context.installedValues?.());
        const host = { ...context.host, flags };
        const definitions = await qualifyScript(host, record, script, {
          providers: declarations.filter(provider => provider.script === script),
          renderers: rendererDeclarations.filter(renderer => renderer.script === script),
        }, current, context.sessionId, timeout);
        const selected = definitions.providers.filter(definition => scriptProviders.some(provider => provider.name === definition.id));
        const customTypes = scriptRenderers.map(renderer => renderer.customType);
        if (selected.length !== scriptProviders.length || customTypes.some(type => !definitions.renderers.includes(type))) {
          throw new Error('An approved capability was not registered.');
        }
        current();
        const unregister = registerCatalogContribution({ root: host.root, sessionId: context.sessionId, commands: [], tools: [], skills: () => [],
          providers: selected, providerAdmission: () => check(providerGrants),
          ...(customTypes.length ? { installedRenderers: [messageRenderers(context, host, record, script, customTypes, () => check(rendererGrants))] } : {}),
        }, context.physicalCatalog?.() ?? loadCatalog());
        try {
          current();
          context.publish(unregister);
        } catch (error) { unregister(); throw error; }
      } catch (error) {
        if (error instanceof QualificationCleanupError) {
          context.loseProcessAuthority();
          throw error;
        }
        if (context.isCurrent() && !signal.aborted) {
          if (scriptProviders.length) context.report(`${record.name}: installed provider registration was withheld.`);
          if (scriptRenderers.length) context.report(`${record.name}: installed renderer registration was withheld.`);
        }
      }
    }
  }
  signal.throwIfAborted();
}

function messageRenderers(context: QualificationHost, host: ExecutionHost, record: PackageRecord, script: string,
  customTypes: readonly string[], current: () => void): InstalledMessageRenderers {
  return { customTypes, admission: current, renderBatch: (messages, signal) => context.calls.run(async signal => {
    if (!messages.length || messages.length > MAX_RENDER_BATCH_MESSAGES
      || messages.some(message => message.role !== 'custom' || !message.display || !customTypes.includes(message.customType))
      || Buffer.byteLength(JSON.stringify(messages)) > MAX_RENDER_BATCH_BYTES) throw new Error('Renderer messages exceed their approved scope.');
    try {
      const data = await executeIsolated(host, record, script, current, context.sessionId, signal, { kind: 'render', messages });
      if (!Array.isArray(data) || data.length !== messages.length || data.some(value => value !== null
        && (typeof value !== 'string' || Buffer.byteLength(value) > MAX_RENDER_TEXT_BYTES))) throw new Error('Invalid renderer output.');
      return data as (string | null)[];
    } catch (error) {
      if (error instanceof QualificationCleanupError) context.loseProcessAuthority();
      throw error;
    }
  }, signal) };
}

type IsolatedInvocation = Extract<InProcessExtensionInvoke, { kind: 'qualify' | 'render' }>;

async function executeIsolated(host: ExecutionHost, record: PackageRecord, script: string, current: () => void,
  sessionId: string, signal: AbortSignal, invoke: IsolatedInvocation): Promise<unknown> {
  signal.throwIfAborted();
  const result = await executeScript(host, record.active, script, [], current,
    { taskId: `extension-${invoke.kind}`, workspaceRoot: host.root, sessionId, abortSignal: signal }, invoke);
  if (result.metadata?.cleanup !== 'confirmed') throw new QualificationCleanupError('Isolated extension worker cleanup remains unknown.');
  signal.throwIfAborted();
  current();
  const output = result.metadata.eventOutput;
  const limit = invoke.kind === 'qualify' ? MAX_EXTENSION_PROVIDERS * 132 * 1024 + MAX_MESSAGE_RENDERERS * 132
    : MAX_RENDER_BATCH_MESSAGES * (MAX_RENDER_TEXT_BYTES * 6 + 3) + 2;
  if (!result.success || typeof output !== 'string' || Buffer.byteLength(output) > limit) {
    throw new Error('Isolated extension invocation failed.');
  }
  return JSON.parse(output) as unknown;
}

async function qualifyScript(host: ExecutionHost, record: PackageRecord, script: string,
  declared: { readonly providers: readonly InstalledProvider[]; readonly renderers: readonly InstalledRenderer[] },
  current: () => void, sessionId: string, signal: AbortSignal): Promise<{
    readonly providers: readonly CatalogProvider[]; readonly renderers: readonly string[];
  }> {
  const data = await executeIsolated(host, record, script, current, sessionId, signal, { kind: 'qualify' });
  if (!isRecord(data) || !Array.isArray(data.renderers) || data.renderers.length > declared.renderers.length
    || new Set(data.renderers).size !== data.renderers.length
    || data.renderers.some(name => !declared.renderers.some(renderer => renderer.customType === name))) {
    throw new Error('Invalid installed renderer registrations.');
  }
  return { providers: qualifiedProviders(data.providers, declared.providers), renderers: data.renderers as string[] };
}

function qualifiedProviders(data: unknown, declared: readonly InstalledProvider[]): readonly CatalogProvider[] {
  if (!Array.isArray(data) || data.length > declared.length) throw new Error('Invalid installed provider registrations.');
  const definitions = new Map<string, CatalogProvider>();
  for (const entry of data) {
    if (!Array.isArray(entry) || entry.length !== 2 || !isRecord(entry[1])) throw new Error('Invalid installed provider registration.');
    const definition = captureExtensionProvider(entry[0], entry[1]);
    const expected = declared.find(value => value.name === definition.id);
    if (definitions.has(definition.id) || expected?.runtime !== definition.runtime || expected?.baseUrl !== definition.baseUrl) {
      throw new Error('Installed provider differs from its reviewed declaration.');
    }
    definitions.set(definition.id, definition);
  }
  return [...definitions.values()];
}
