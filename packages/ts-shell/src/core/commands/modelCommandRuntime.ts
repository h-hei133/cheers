import { parseEffortFlag } from "./model/preference.js";
import { setModel } from "./model/selection.js";
import {
  RUNTIME_PROVIDERS,
  getRuntimeConfig,
  type ProviderConnectionConfig,
  type RuntimeConfig,
  type RuntimeProvider,
} from "../../config/runtimeConfig.js";
import type { CommandContext, LocalCommandResult } from "./types.js";
import { parseModelArgs, modelSyntax } from "./model/syntax.js";
import { syntaxHelp } from "./syntax/projection.js";
import { projectSessionModel } from "../../session/model/projection.js";
import { loadCatalogSnapshot, ensureUserCatalog, userCatalogPath } from "../models/catalogStore.js";
import { catalogProvider } from '../models/catalog.js';
import { refreshCatalog, type RefreshResult } from "../models/catalogRefresh.js";
import { renderCatalog } from "../models/catalogSurface.js";
import { availabilitySnapshot, catalogAvailabilitySnapshot, type AvailabilitySnapshot } from "../models/availability.js";
import { selectionRequest } from './model/target.js';
import { resolveProviderCredential } from "../shell/providerCredentials.js";
import { needsUserEndpoint, providerFacts } from "../providers/facts.js";
import { runModelPresetCommand } from './model/presetCommand.js';
import { providerCredentialBaseUrl } from '../auth/account/target.js';
import { modelDefaultSource, modelDefaultSourceLine, sessionOwnsModel } from './model/defaultSource.js';
import { sessionModelCatalog } from '../catalog/models.js';
import { EXTENSION_MODEL_PREFIX, sessionProviderScope } from '../catalog/providers.js';
import { readLogicalModel } from '../../session/model/logical.js';
import type { VirtualModelMetadata } from '../models/virtual/contract.js';


/**
 * The models an OpenAI account connection can use.
 *
 * Read from the provider's declaration rather than kept here. The same list was
 * spelled out in this file and in the login runtime, so a model added to one and
 * missed in the other would be offered by `/model list` and then refused by the
 * switch.
 */
function accountAuthModelFacts(): { readonly allowed: readonly string[]; readonly defaultModel?: string } {
  const facts = providerFacts("openai");
  return { allowed: facts.accountAuthAllowedModels ?? [], defaultModel: facts.accountAuthDefaultModel };
}

export async function runModelCommand(
  args: string[],
  context: CommandContext,
): Promise<LocalCommandResult> {
  const parsed = parseModelArgs(args);
  if (!parsed.ok) return { kind: "local", output: `Invalid model arguments: ${parsed.reason}\n${getModelHelpText()}` };
  const action = parsed.action.name;
  const rest = [...parsed.args];
  if (!action) {
    return { kind: "local", output: renderCatalogView(context) };
  }
  if (action === "status") {
    return { kind: "local", output: renderModelStatus(context) };
  }
  if (action === "refresh") {
    return runCatalogOperation<LocalCommandResult>(context, async captured =>
      ({ kind: "local", output: (await refreshModels(captured)).output }));
  }

  if (action === "config") {
    const path = ensureUserCatalog();
    return {
      kind: "local",
      output: [
        `Your model catalogue is \`${path}\` (user profile only).`,
        "",
        "An entry with a known provider id patches it — a different base URL, extra models, a different key variable. An unknown id adds a provider outright.",
        "Add entries inside the existing providers object. Settings and global model defaults are stored in config.json; connections and credentials in auth.json.",
      ].join("\n"),
    };
  }

  if (action === "preset" || action === "presets") {
    return runModelPresetCommand(rest, context);
  }

  if (action === "list" || action === "ls") {
    return parsed.flags.has("refresh")
      ? runCatalogOperation<LocalCommandResult>(context, async captured =>
        ({ kind: "local", output: await listModels(rest, true, captured) }))
      : { kind: "local", output: await listModels(rest, false, context) };
  }

  if (action === "use" || action === "set") {
    return { kind: "local", output: await setModel(rest, context, parsed.flags.has("global"), parseEffortFlag(parsed.flags.get("effort"))) };
  }
  if (action === "help" || action === "--help" || action === "-h") {
    return {
      kind: "local",
      output: getModelHelpText(),
    };
  }

  return { kind: "local", output: getModelHelpText() };
}
/**
 * The catalogue, with this session's connection state folded in.
 *
 * Bare `/model` answers "what can I use", which is a question about providers and
 * models together — the old bare form answered "what am I using", which is
 * `/model status`.
 */
function modelConfiguration(context: CommandContext) {
  const publication = context.readConfiguration?.();
  const local = publication ? undefined : loadCatalogSnapshot();
  const config = publication?.config ?? context.runtimeConfig ?? projectSessionModel(getRuntimeConfig(context.projectRoot ?? context.cwd), context.sessionId);
  return { config, catalog: publication?.catalog ?? local!.providers, catalogDiagnostics: publication?.catalogDiagnostics ?? local?.diagnostics ?? [],
    active: context.resolveConfigTarget?.(config, context.sessionId)
      ?? resolveProviderCredential({ runtimeConfig: config, ...(context.sessionId ? { pool: { sessionId: context.sessionId } } : {}) }) };
}

function renderCatalogView(context: CommandContext): string {
  const { config, catalog, active, catalogDiagnostics } = modelConfiguration(context);
  const physical = renderCatalog({ providers: catalog, configPath: userCatalogPath(), diagnostics: catalogDiagnostics,
    availability: modelCatalogAvailability(context, { config, catalog, active }) });
  const virtual = context.sessionId ? sessionModelCatalog(context.cwd, context.sessionId, catalog).virtual : [];
  const extension = context.sessionId && sessionProviderScope(context.cwd, context.sessionId, catalog, active).registration;
  return [physical,
    ...(virtual.length ? [`Virtual models\n${virtual.map(model => `- ${model.provider}/${model.id} (${model.name})`).join('\n')}`] : []),
    ...(extension ? [`Extension models\n${extension.models.map(model => `- ${EXTENSION_MODEL_PREFIX}${extension.id}/${model.id}`).join('\n')}`] : []),
  ].join('\n\n');
}

function modelCatalogAvailability(context: CommandContext, input: Pick<ReturnType<typeof modelConfiguration>, 'config' | 'catalog' | 'active'>) {
  return catalogAvailabilitySnapshot({ ...input,
    // Local presence uses neither CLI overrides nor a live session's pool affinity.
    resolveLocal: (provider, connectionId) => selectionRequest({ cwd: context.cwd }, input.config, {
      provider, model: '', ...(connectionId === undefined ? { connectionScope: 'provider' } : { connectionScope: 'session', connectionId }),
    }) });
}

function renderModelStatus(context: CommandContext): string {
  const { config, catalog, active: request, catalogDiagnostics } = modelConfiguration(context);
  const logical = readLogicalModel(context.sessionId);
  if (logical) {
    const available = Boolean(context.sessionId && sessionModelCatalog(context.cwd, context.sessionId, catalog).virtual
      .some(model => model.provider === logical.provider && model.id === logical.model));
    return ['Model selection status', ...catalogDiagnostics, `Model: ${logical.provider}/${logical.model}`,
      `Thinking effort: ${logical.thinkingEffort ?? 'auto'}`, `Virtual model: ${available ? 'registered' : 'unavailable'}`,
      'Physical destination and request authentication are resolved per request.',
      `Saved physical provider: ${config.provider}`, `Saved physical model: ${request.model ?? 'unset'}`,
      'Use /model use <provider>/<model> to select a model.'].join('\n');
  }
  const connections = normalizeConnections(config);
  const activeId = config.activeProviderConnectionId?.trim();
  const activeConnection = connections.find((item) => item.id === activeId);
  const signed = modelCatalogAvailability(context, { config, catalog, active: request })
    .some(entry => entry.active && entry.state === 'signed');
  const provider = activeConnection?.provider ?? config.provider ?? "openai";
  const authType = activeConnection?.authType ?? "api-key";
  // Provenance children are indexed by the stored array, so read the index
  // from the configuration rather than from the normalized copy above.
  const storedIndex = activeConnection
    ? config.providerConnections.findIndex(item => item.id.trim() === activeId) : -1;
  const connectionIndex = storedIndex < 0 ? undefined : storedIndex;
  const source = modelDefaultSource({
    connectionModel: activeConnection?.model,
    providerModel: config.providerCredentials?.[provider]?.model,
    accountDefault: provider === "openai" && authType === "account-auth"
      ? providerFacts("openai").accountAuthDefaultModel : undefined,
    // A projected session selection overwrites the stored leaf it shadows, so
    // name it as the session's choice rather than as a saved default.
    sessionSelected: sessionOwnsModel(config, provider, connectionIndex),
  });
  const model = source.effective;
  const sourceLine = modelDefaultSourceLine(source);

  return [
    "Model selection status",
    ...catalogDiagnostics,
    `Provider: ${provider}`,
    `Auth type: ${authType}`,
    `Active connection: ${activeId ?? "none"}`,
    `Model: ${model ?? "unset"}`,
    ...(sourceLine ? [sourceLine] : []),
    `Request provider: ${request.provider}`,
    `Request model: ${request.model ?? "unset"}`,
    ...(signed ? ['Request auth: authentication at request'] : []),
    "",
    ...renderProviderReadinessLines({
      activeConnectionId: activeId,
      activeConnection,
      model,
      signed,
      availability: availabilitySnapshot({ config, catalog }),
    }),
    "",
    "Use /model list to inspect available models.",
    "Use /model use <model-id> to switch active model.",
  ].join("\n");
}

function renderProviderReadinessLines(input: {
  readonly activeConnectionId?: string;
  readonly activeConnection?: ProviderConnectionConfig;
  readonly model?: string;
  readonly signed?: boolean;
  readonly availability: AvailabilitySnapshot;
}): string[] {
  const projected = input.availability.providers.flatMap(provider => provider.connections)
    .find(connection => connection.connectionId === input.activeConnectionId?.trim());
  if (input.signed) return [
    'Request readiness',
    '- Request status: authentication at request.',
    '- Signing credentials and live endpoint are unverified.',
  ];
  if (!input.activeConnectionId) {
    return [
      "Provider readiness",
      "- Config status: no active connection selected.",
      "- Next: run /connect status, then /connect login or /connect use.",
    ];
  }

  if (!input.activeConnection) {
    return [
      "Provider readiness",
      `- Config status: active connection not found (${input.activeConnectionId}).`,
      "- Next: run /connect status, then /connect use <connection-id>.",
    ];
  }

  if (projected?.state === "pending" || input.activeConnection.status === "pending") {
    return [
      "Provider readiness",
      "- Config status: connection setup is pending.",
      "- Next: finish the login/browser flow or rerun /connect login.",
    ];
  }

  if (projected?.state === "error" || input.activeConnection.status === "error") {
    return [
      "Provider readiness",
      "- Config status: connection setup is in error state.",
      "- Next: rerun /connect login for this provider.",
    ];
  }

  if (projected?.state === "pool-unavailable") {
    return [
      "Provider readiness",
      "- Config status: active connection is unavailable in the account pool.",
      "- Next: select an available pool member or correct the account pool configuration.",
    ];
  }

  if (projected?.state === "credential-missing" || (input.activeConnection.authType !== "account-auth" && !input.activeConnection.apiKey?.trim())) {
    return [
      "Provider readiness",
      "- Config status: credential missing for active connection.",
      `- Next: run /connect login ${input.activeConnection.provider} --api-key <key>.`,
    ];
  }

  if (
    needsUserEndpoint(input.activeConnection.provider) &&
    !input.activeConnection.baseUrl?.trim()
  ) {
    return [
      "Provider readiness",
      `- Config status: ${input.activeConnection.provider} requires base URL.`,
      `- Next: run /connect login ${input.activeConnection.provider} --api-key <key> --base-url <url> --model <model>.`,
    ];
  }

  if (!input.model) {
    return [
      "Provider readiness",
      "- Config status: active connection exists, but no model is selected.",
      "- Next: run /model list, then /model use <model-id>.",
    ];
  }

  return [
    "Provider readiness",
    "- Config status: active connection and model are configured.",
    "- Live check: run npm run verify:provider-readiness from the project root.",
    "- If the live check reports provider-network-inconclusive, retry later or check proxy/firewall/network.",
  ];
}

export interface ModelCatalog {
  readonly provider: RuntimeProvider;
  readonly models: readonly string[];
  readonly active?: string;
  /** The list is read locally; network refresh is always an explicit separate action. */
  readonly offline: boolean;
  readonly virtual?: readonly VirtualModelMetadata[];
  readonly logical?: { readonly provider: string; readonly model: string };
  /** Present for explicit refresh, including saved, unknown and unchanged failures. */
  readonly refresh?: RefreshResult;
  readonly refreshNotice?: string;
}

/**
 * The model catalog as data, for callers that present a chooser rather than
 * text. Shares the local catalogue and explicit refresh owner with `/model list` so
 * the two can never offer different models.
 */
/** Rejects unavailable read data while retaining this refresh's own storage outcome. */
export class CatalogReadError extends Error {
  readonly refresh: RefreshResult | undefined;

  constructor(refresh: RefreshResult | undefined, readonly refreshNotice: string, cause: unknown, cancelled = false) {
    super(cancelled ? 'Catalogue data read was cancelled after refresh.' : 'Catalogue data is unavailable after refresh.', { cause });
    this.name = cancelled ? 'AbortError' : 'CatalogReadError';
    this.refresh = refresh ? Object.freeze({ ...refresh }) : undefined;
  }
}

export async function readModelCatalog(refresh = false, sessionId?: string, runtimeConfig?: RuntimeConfig, suppliedContext?: CommandContext): Promise<ModelCatalog> {
  const context = suppliedContext ?? { cwd: process.cwd(), sessionId, runtimeConfig };
  if (refresh) return runCatalogOperation<ModelCatalog>(context, async captured => {
    const refreshed = await refreshModels(captured);
    try {
      captured.signal?.throwIfAborted();
      const blocked = captured.admission?.();
      captured.signal?.throwIfAborted();
      if (blocked) throw new Error(blocked);
      const result = await readModelCatalog(false, sessionId, runtimeConfig, captured);
      captured.signal?.throwIfAborted();
      const changed = captured.admission?.();
      captured.signal?.throwIfAborted();
      if (changed) throw new Error(changed);
      return { ...result, refresh: refreshed.result, refreshNotice: refreshed.output };
    } catch (error) {
      throw new CatalogReadError(refreshed.result, refreshed.output, error, captured.signal?.aborted);
    }
  });
  const { catalog, active } = modelConfiguration(context);
  const allowed = active.credential?.authMode === 'account-auth' ? providerFacts(active.provider).accountAuthAllowedModels : undefined;
  const binding = catalogProvider(catalog, active.provider, providerCredentialBaseUrl(catalog, active));
  return { provider: active.provider, models: binding.ambiguous ? [] : allowed ?? binding.entry?.models.map(model => model.id) ?? [],
    active: active.model, offline: true,
    ...(context.sessionId ? { virtual: sessionModelCatalog(context.cwd, context.sessionId, catalog).virtual,
      logical: readLogicalModel(context.sessionId) } : {}) };
}

/** Capture the original command owner once; child readers must not register again. */
function runCatalogOperation<T>(context: CommandContext, operation: (captured: CommandContext) => Promise<T>): Promise<T> {
  const { runCancellable, ...captured } = context;
  if (runCancellable) return runCancellable(signal => {
    const owned = { ...captured, signal: captured.signal ? AbortSignal.any([captured.signal, signal]) : signal };
    owned.signal.throwIfAborted();
    return operation(owned);
  });
  captured.signal?.throwIfAborted();
  return operation(captured);
}

async function refreshModels(context: CommandContext): Promise<{ readonly output: string; readonly result?: RefreshResult }> {
  context.signal?.throwIfAborted();
  const blocked = context.admission?.();
  context.signal?.throwIfAborted();
  if (blocked) return { output: `Catalogue refresh blocked: ${blocked}` };
  const result = await refreshCatalog(undefined, { signal: context.signal, admission: context.admission });
  if (result.cacheOutcome === 'unknown') {
    return { result, output: `Catalogue refresh failed (${result.error ?? 'cache write was not confirmed'}). Catalogue cache write outcome is unknown.` };
  }
  const receipt = `${result.providers} providers, ${result.models} models${result.cachePath ? `, cached in \`${result.cachePath}\`` : ''}.`;
  if (!result.ok) {
    if (result.cacheOutcome === 'saved') return { result, output: [
      `Catalogue saved: ${receipt}`,
      `Catalogue refresh did not finish (${result.error ?? 'cache cleanup is unverified'}). The saved catalogue was not applied.`,
    ].join('\n') };
    return { result, output: `Catalogue refresh failed (${result.error ?? 'refresh outcome is unavailable'}).${result.cacheOutcome === 'unchanged' ? ' Catalogue cache is unchanged.' : ''}` };
  }
  const saved = result.cacheOutcome === 'saved' || (result.cacheOutcome === undefined && !result.notModified && Boolean(result.cachePath));
  const summary = [
    `Catalogue ${result.notModified ? 'not modified' : 'refreshed'}: ${receipt}`,
    ...(result.notModified && saved ? ['Cache validator saved.'] : []),
  ];
  try {
    summary[0] += ` Your own entries in \`${userCatalogPath()}\` still win.`;
    const changed = context.admission?.();
    const cancelled = context.signal?.aborted;
    if (changed || cancelled) return { result, output: [...summary,
      `${saved ? 'Catalogue saved but not applied' : 'Catalogue not applied'}: ${cancelled ? 'Catalogue refresh was cancelled.' : changed}`,
    ].join('\n') };
    let notice = saved ? 'Catalogue saved for the next load.' : 'Existing catalogue remains available for the next load.';
    if (context.refreshRuntimeConfig) {
      try {
        const application = context.refreshRuntimeConfig('catalog');
        const stale = context.admission?.();
        if (application.status !== 'applied') {
          notice = `Configuration was not applied (${application.status}).${application.admissionBlocked ? ' New actions are blocked until a valid configuration is loaded.' : ''}`;
        } else if (context.signal?.aborted || stale) {
          notice = `Configuration application outcome is unverified.${stale ? ` ${stale}` : ' Catalogue refresh was cancelled.'}`;
        } else {
          notice = 'Catalogue applied for the next operation.';
        }
      } catch {
        notice = 'Configuration application outcome is unverified.';
      }
    }
    return { result, output: [...summary, notice].join('\n') };
  } catch {
    return { result, output: [...summary,
      `${saved ? 'Catalogue saved but not applied' : 'Catalogue not applied'}: Catalogue refresh admission is unavailable.`,
    ].join('\n') };
  }
}

async function listModels(args: string[], refresh: boolean, context: CommandContext): Promise<string> {
  if (refresh) {
    context.signal?.throwIfAborted();
    const blocked = context.admission?.();
    context.signal?.throwIfAborted();
    if (blocked) return `Catalogue refresh blocked: ${blocked}`;
  }
  let snapshot = modelConfiguration(context);
  if (refresh) {
    context.signal?.throwIfAborted();
    const changed = context.admission?.();
    context.signal?.throwIfAborted();
    if (changed) return `Catalogue refresh blocked: ${changed}`;
  }
  const hint = args[0]?.trim();
  const requested = hint ? (snapshot.catalog.some(entry => entry.id === hint) ? hint : normalizeProvider(hint) ?? hint) : undefined;
  const virtual = context.sessionId ? sessionModelCatalog(context.cwd, context.sessionId, snapshot.catalog).virtual : [];
  const logical = readLogicalModel(context.sessionId);
  const virtualProvider = requested ?? logical?.provider;
  const virtualRows = virtual.filter(model => model.provider === virtualProvider);
  if (virtualRows.length || logical && virtualProvider === logical.provider) return [
    `Virtual models for provider=${virtualProvider}`,
    'Source: current session extensions',
    ...virtualRows.map(model => `${logical?.provider === model.provider && logical.model === model.id ? '*' : '-'} ${model.id} (${model.name})`),
    ...(!virtualRows.length ? ['The selected virtual model is unavailable.'] : []),
  ].join('\n');
  if (requested && !snapshot.catalog.some(entry => entry.id === requested) && !RUNTIME_PROVIDERS.some(id => id === requested)) {
    return [...snapshot.catalogDiagnostics, 'Unknown provider. Use /model to inspect the catalogue.'].join('\n');
  }
  const notice = refresh ? (await refreshModels(context)).output : undefined;
  if (refresh) {
    try {
      const changed = context.admission?.();
      if (context.signal?.aborted || changed) return [notice,
        context.signal?.aborted ? 'Catalogue list cancelled.' : `Catalogue list unavailable: ${changed}`,
      ].join('\n');
      snapshot = modelConfiguration(context);
      const stale = context.admission?.();
      if (context.signal?.aborted || stale) return [notice,
        context.signal?.aborted ? 'Catalogue list cancelled.' : `Catalogue list unavailable: ${stale}`,
      ].join('\n');
    } catch {
      return [notice, 'Catalogue list is unavailable.'].join('\n');
    }
  }
  const { catalog, active, catalogDiagnostics } = snapshot;
  const provider = requested ?? active.provider;
  const binding = catalogProvider(catalog, provider, provider === active.provider ? providerCredentialBaseUrl(catalog, active) : undefined);
  if (binding.ambiguous) return [notice, ...catalogDiagnostics, 'Model list unavailable: multiple catalogue entries claim the active endpoint.']
    .filter(line => line !== undefined).join('\n');
  const entry = binding.entry;

  const activeModel = provider === active.provider ? active.model : undefined;
  if (provider === 'openai' && active.provider === provider && active.credential?.authMode === 'account-auth') {
    return [notice, ...catalogDiagnostics, renderOpenAIAccountAuthModelList(activeModel)].filter(Boolean).join('\n');
  }
  return [
    notice,
    ...catalogDiagnostics,
    `Models for provider=${provider}`,
    'Catalogue: models.json (user profile only); settings: config.json; connections: auth.json.',
    context.readConfiguration ? 'Source: accepted session catalogue' : 'Source: local catalogue (shipped, refreshed, then user entries)',
    ...(entry?.models ?? []).map(model => model.id === activeModel ? `* ${model.id} (active)` : `- ${model.id}`),
    entry?.models.length ? undefined : 'No models listed for this provider.',
    '',
    'Use /model use <model-id> to switch active model.',
  ].filter(line => line !== undefined).join('\n');
}

function renderOpenAIAccountAuthModelList(activeModel?: string): string {
  return [
    "Models for provider=openai (account-auth)",
    "Source: local account-auth allowed model set",
    ...accountAuthModelFacts().allowed.map((model) =>
      model === activeModel ? `* ${model} (active)` : `- ${model}`,
    ),
    "",
    "Use /model use <model-id> to switch active model.",
  ].join("\n");
}


function normalizeProvider(input?: string): RuntimeProvider | undefined {
  const value = input?.trim().toLowerCase();
  const normalized = value === "siliconflow" || value === "openai_compatible" ? "openai-compatible"
    : value === "gemini" ? "google" : value;
  return RUNTIME_PROVIDERS.find(provider => provider === normalized);
}

function normalizeConnections(config: { readonly providerConnections?: readonly ProviderConnectionConfig[] }): ProviderConnectionConfig[] {
  if (!config.providerConnections || config.providerConnections.length === 0) {
    return [];
  }
  return config.providerConnections
    .filter((item) => Boolean(item.id && item.provider))
    .map((item) => ({
      ...item,
      id: item.id.trim(),
      label: normalizeText(item.label),
      baseUrl: normalizeBaseUrl(item.baseUrl),
      model: normalizeText(item.model),
      apiKey: normalizeText(item.apiKey),
      status: item.status ?? "connected",
      createdAt: item.createdAt || new Date().toISOString(),
      updatedAt: item.updatedAt || new Date().toISOString(),
    }));
}

function normalizeText(value?: string): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

function normalizeBaseUrl(baseUrl?: string): string | undefined {
  const trimmed = normalizeText(baseUrl);
  if (!trimmed) {
    return undefined;
  }
  return trimmed.replace(/\/+$/, "");
}

function getModelHelpText(): string {
  return `Model selection commands\n${syntaxHelp(modelSyntax)}\n/model <model-id> [--global]\nDefault: current session, saved for resume. --global also changes the global default.`;
}
