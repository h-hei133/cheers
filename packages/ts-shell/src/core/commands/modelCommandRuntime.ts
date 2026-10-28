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
import { loadCatalog, ensureUserCatalog, userCatalogPath } from "../models/catalogStore.js";
import { catalogProvider } from '../models/catalog.js';
import { refreshCatalog } from "../models/catalogRefresh.js";
import { renderCatalog } from "../models/catalogSurface.js";
import { availabilitySnapshot, type AvailabilitySnapshot } from "../models/availability.js";
import { resolveProviderCredential } from "../shell/providerCredentials.js";
import { configurationApplicationNotice } from "./configuration.js";
import { needsUserEndpoint, providerFacts } from "../providers/facts.js";
import { runModelPresetCommand } from './model/presetCommand.js';


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
    return { kind: "local", output: await refreshModels(context) };
  }

  if (action === "config") {
    const path = ensureUserCatalog();
    return {
      kind: "local",
      output: [
        `Your provider file is \`${path}\`.`,
        "",
        "An entry with a known provider id patches it — a different base URL, extra models, a different key variable. An unknown id adds a provider outright.",
      ].join("\n"),
    };
  }

  if (action === "preset" || action === "presets") {
    return runModelPresetCommand(rest, context);
  }

  if (action === "list" || action === "ls") {
    return { kind: "local", output: await listModels(rest, parsed.flags.has("refresh"), context) };
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
  const config = publication?.config ?? context.runtimeConfig ?? projectSessionModel(getRuntimeConfig(context.projectRoot ?? context.cwd), context.sessionId);
  return { config, catalog: publication?.catalog ?? loadCatalog(),
    active: context.resolveConfigTarget?.(config, context.sessionId)
      ?? resolveProviderCredential({ runtimeConfig: config, ...(context.sessionId ? { pool: { sessionId: context.sessionId } } : {}) }) };
}

function renderCatalogView(context: CommandContext): string {
  const { config, catalog, active } = modelConfiguration(context);
  const projected = availabilitySnapshot({ config, catalog });
  return renderCatalog({ providers: catalog, configPath: userCatalogPath(),
    availability: { ...projected, activeProvider: active.provider, ...(active.model ? { activeModel: active.model } : {}) } });
}

function renderModelStatus(context: CommandContext): string {
  const { config, catalog, active: request } = modelConfiguration(context);
  const connections = normalizeConnections(config);
  const activeId = config.activeProviderConnectionId?.trim();
  const activeConnection = connections.find((item) => item.id === activeId);
  const provider = activeConnection?.provider ?? config.provider ?? "openai";
  const authType = activeConnection?.authType ?? "api-key";
  const model =
    normalizeText(activeConnection?.model) ??
    normalizeText(config.providerCredentials?.[provider]?.model) ??
    (provider === "openai" && authType === "account-auth"
      ? providerFacts("openai").accountAuthDefaultModel
      : undefined);

  return [
    "Model selection status",
    `Provider: ${provider}`,
    `Auth type: ${authType}`,
    `Active connection: ${activeId ?? "none"}`,
    `Model: ${model ?? "unset"}`,
    `Request provider: ${request.provider}`,
    `Request model: ${request.model ?? "unset"}`,
    "",
    ...renderProviderReadinessLines({
      activeConnectionId: activeId,
      activeConnection,
      model,
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
  readonly availability: AvailabilitySnapshot;
}): string[] {
  const projected = input.availability.providers.flatMap(provider => provider.connections)
    .find(connection => connection.connectionId === input.activeConnectionId?.trim());
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
}

/**
 * The model catalog as data, for callers that present a chooser rather than
 * text. Shares the local catalogue and explicit refresh owner with `/model list` so
 * the two can never offer different models.
 */
export async function readModelCatalog(refresh = false, sessionId?: string, runtimeConfig?: RuntimeConfig): Promise<ModelCatalog> {
  const context = { cwd: process.cwd(), sessionId, runtimeConfig };
  if (refresh) await refreshModels(context);
  const { catalog, active } = modelConfiguration(context);
  const allowed = active.credential?.authMode === 'account-auth' ? providerFacts(active.provider).accountAuthAllowedModels : undefined;
  const binding = catalogProvider(catalog, active.provider, active.baseUrl ?? active.credential?.baseUrl);
  return { provider: active.provider, models: binding.ambiguous ? [] : allowed ?? binding.entry?.models.map(model => model.id) ?? [],
    active: active.model, offline: true };
}

async function refreshModels(context: CommandContext): Promise<string> {
  const blocked = context.admission?.();
  if (blocked) return `Catalogue refresh blocked: ${blocked}`;
  const result = await refreshCatalog();
  if (!result.ok) return `Catalogue refresh failed (${result.error}). The accepted catalogue is unchanged.`;
  const changed = context.admission?.();
  const notice = changed ? `Catalogue saved but not applied: ${changed}` : configurationApplicationNotice(context);
  return [
    `Catalogue refreshed: ${result.providers} providers, ${result.models} models, cached in \`${result.cachePath}\`. Your own entries in \`${userCatalogPath()}\` still win.`,
    notice ?? (context.refreshRuntimeConfig ? 'Catalogue applied for the next operation.' : 'Catalogue saved for the next load.'),
  ].join('\n');
}

async function listModels(args: string[], refresh: boolean, context: CommandContext): Promise<string> {
  let snapshot = modelConfiguration(context);
  const hint = args[0]?.trim();
  const requested = hint ? (snapshot.catalog.some(entry => entry.id === hint) ? hint : normalizeProvider(hint) ?? hint) : undefined;
  if (requested && !snapshot.catalog.some(entry => entry.id === requested) && !RUNTIME_PROVIDERS.some(id => id === requested)) return 'Unknown provider. Use /model to inspect the catalogue.';
  const notice = refresh ? await refreshModels(context) : undefined;
  if (refresh) snapshot = modelConfiguration(context);
  const { catalog, active } = snapshot;
  const provider = requested ?? active.provider;
  const binding = catalogProvider(catalog, provider, provider === active.provider ? active.baseUrl ?? active.credential?.baseUrl : undefined);
  if (binding.ambiguous) return 'Model list unavailable: multiple catalogue entries claim the active endpoint.';
  const entry = binding.entry;

  const activeModel = provider === active.provider ? active.model : undefined;
  if (provider === 'openai' && active.provider === provider && active.credential?.authMode === 'account-auth') {
    return [notice, renderOpenAIAccountAuthModelList(activeModel)].filter(Boolean).join('\n');
  }
  return [
    notice,
    `Models for provider=${provider}`,
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
