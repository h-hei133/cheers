import type { ThinkingPreference } from '../core/models/effort.js';
import os from "node:os";
import path from "node:path";
import { resolveUserDataFile, userDataDir } from "../core/paths/userHome.js"
import { type DenyRule } from "../core/shell/approval/deny.js"
import { createConfigFields, type ConfigField } from "./fields.js";
import { readConfigDocument } from "./document.js";
import { ConfigDocumentError } from "./syntax.js";
import { readConfigEdit, persistConfigEdit, type ConfigEdit } from "./persistence.js";
import { normalizeBaseUrl, normalizeConnectionId, normalizeConfigDenials } from "./values.js";
import { normalizeProviderAccountAuth, type AccountAuthConfig, type ProviderAccountAuthConfig } from './account.js';
export type { OpenAIAccountAuthConfig, GoogleAccountAuthConfig, SubscriptionAccountAuthConfig, AccountAuthConfig, ProviderAccountAuthConfig } from './account.js';
import { loadConfigLayers, validateRawConfig } from "./layers.js";
import { captureConfigTrust, type ConfigTrustBinding } from './trust.js';
import type { ConfigProvenance } from './provenance/model.js';
import { projectConfigOrigins } from './provenance/projection.js';
import type { ComposerShapeId } from '../presentation/tui/composer/contract.js';
import type { ConfigInputs } from './inputs/model.js';
import type { ConfigScopes } from './scope/model.js';
import type { PathRule } from './scope/contract.js';
import type { SessionModelPolicy } from '../session/model/contract.js';
import { captureConfigScopes, scopeSettings } from './scope/capture.js';

/**
 * Token budgets for one model.
 *
 * Declared here rather than beside the resolver because it is part of the
 * configuration file's shape: the resolver reads it, the config owns it.
 */
export interface ModelTokenBudget {
  readonly reserveTokens?: number;
  readonly keepRecentTokens?: number;
}

/**
 * The providers this build knows, as a list as well as a type.
 *
 * One list, because the type alone was not enough: a provider added to the union
 * below was checked against the declaration table by `satisfies`, but every place
 * that had to *iterate* providers kept its own copy of the names. Those copies
 * failed the same silent way — a credentials entry for a provider missing from
 * the copy was dropped without a word, and the config file looked like it had
 * been read.
 */
export const RUNTIME_PROVIDERS = [
  "openai",
  "anthropic",
  "openai-compatible",
  "google",
  // Providers reached through their own protocol rather than a compatible
  // gateway. They are members because a connection names its provider by this
  // id, and a protocol nothing can name is a protocol nobody can use.
  "bedrock",
  "google-ai",
  "vertex",
  "antigravity",
  "claudecode",
  "github-copilot",
] as const;

export type RuntimeProvider = (typeof RUNTIME_PROVIDERS)[number];

/** Whether a value names a provider this build knows. */
export function isRuntimeProvider(value: unknown): value is RuntimeProvider {
  return typeof value === "string" && (RUNTIME_PROVIDERS as readonly string[]).includes(value);
}
export type ProviderConnectionAuthType =
  | "api-key"
  | "account-auth"
  | "browser-assisted-capture";

export interface ProviderCredentialConfig {
  readonly apiKey?: string;
  readonly baseUrl?: string;
  readonly model?: string;
  readonly thinkingEffort?: ThinkingPreference;
  readonly serviceTier?: string;
  readonly accountAuth?: ProviderAccountAuthConfig;
}

export interface AccountPoolEntry {
  /** Explicit authorization; an empty list permits no request for this provider. */
  readonly connections: readonly string[];
  /** When present, every member must share this endpoint. */
  readonly baseUrl?: string;
}
export type AccountPool = Readonly<Partial<Record<RuntimeProvider, AccountPoolEntry>>>;

export interface ProviderConnectionConfig {
  readonly id: string;
  readonly provider: RuntimeProvider;
  readonly authType: ProviderConnectionAuthType;
  readonly label?: string;
  readonly apiKey?: string;
  readonly baseUrl?: string;
  readonly model?: string;
  readonly thinkingEffort?: ThinkingPreference;
  readonly serviceTier?: string;
  readonly accountAuth?: ProviderAccountAuthConfig;
  readonly status?: "connected" | "pending" | "error";
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface RuntimeConfig {
  /** Value-free origin trees published with the settings they describe. */
  readonly configProvenance: ConfigProvenance;
  readonly configTrust: ConfigTrustBinding;
  readonly configInputs?: ConfigInputs;
  readonly configScopes?: ConfigScopes;
  readonly pathRules?: readonly PathRule[];
  /** Absent means no model restriction; [] permits no model requests. */
  readonly allowedModels?: readonly string[];
  /** Structured acceptance facts; diagnostic wording never decides publication. */
  readonly configValidation: { readonly valid: boolean; readonly securityBlocked: boolean; readonly constraintsBlocked?: boolean };
  readonly provider: RuntimeProvider;
  readonly maxTurns: number;
  /**
   * The only tools this run may offer, when the user named any.
   *
   * Absent means no allowlist. An empty array is a deliberate "offer nothing" -
   * the two are different answers and are kept apart, because collapsing them
   * would make one of them inexpressible.
   */
  readonly allowedTools?: readonly string[];
  readonly disabledTools: readonly string[];
  readonly hiddenToolPrefixes: readonly string[];
  /**
   * Calls this session refuses outright, whatever approval would say.
   *
   * Distinct from `disabledTools`, which takes a tool off the list the model
   * sees. This leaves the tool available and refuses particular calls within it,
   * so "use bash, but never that command" is expressible — a statement neither
   * of the other two fields can make.
   */
  readonly denyRules: readonly DenyRule[];
  readonly enableMcpTools: boolean;
  /** Dynamic discovery is the default; full is a diagnostic/parity mode. */
  readonly toolDiscovery: 'dynamic' | 'full';
  readonly activeProviderConnectionId?: string;
  /** Session-owned target assertion, derived at publication and never persisted as configuration. */
  readonly sessionConnection?: { readonly id: string; readonly provider: string; readonly scope?: never }
    | { readonly scope: 'provider'; readonly provider: string; readonly id?: never };
  /** Runtime projection from the session; never a stored configuration field. */
  readonly sessionModelRoles?: SessionModelPolicy;
  readonly providerConnections: readonly ProviderConnectionConfig[];
  /** Absent means no pool is declared and existing selection applies. */
  readonly accountPool?: AccountPool;
  readonly providerCredentials: Readonly<
    Partial<Record<RuntimeProvider, ProviderCredentialConfig>>
  >;
  readonly temperature?: number;
  readonly topP?: number;
  readonly maxOutputTokens?: number;
  /**
   * The context window to use, overriding whatever the model's catalog entry
   * says.
   *
   * Absent means "ask the catalog", which is the normal case. Present means the
   * user knows something the catalog does not — a proxy, a self-hosted model, or
   * a window the catalog has not caught up with.
   */
  readonly contextWindow?: number;
  readonly reserveTokens?: number;
  /**
   * Token budgets for specific models, keyed `"provider/modelId"`.
   *
   * One global budget cannot fit every model: keeping the last twenty thousand
   * tokens verbatim is most of a small model's window and a rounding error in a
   * large one. Keyed by provider as well as model because two providers can
   * serve the same model id, and a budget tuned for one must not silently apply
   * to the other.
   */
  readonly modelTokenBudgets?: Readonly<Record<string, ModelTokenBudget>>;
  /**
   * How many bytes of project instruction file content may be read.
   *
   * The budget covers the files' own bytes. The tags that frame them in the
   * prompt add a fixed amount per file on top — a couple of hundred bytes
   * overall, not proportional to the budget — so the prompt as a whole is
   * slightly larger than this number rather than equal to it.
   *
   * Zero disables loading them entirely, which is the opt-out: a run that wants
   * to see how the model behaves without a repository's rules should not have to
   * delete the file.
   */
  readonly instructionBudgetBytes?: number;
  /**
   * Whether declared hook commands may run without approval for this run.
   *
   * Set only by a command-line flag, never by a configuration file — see the
   * resolution below for why. It exists because a repository someone is already
   * auditing by hand should not need its hooks approving one at a time, and it
   * announces itself when it takes effect so it cannot be mistaken for the gate
   * working.
   */
  readonly allowUntrustedHooks?: boolean;
  /**
   * Skip requests this session would make on its own initiative.
   *
   * A release check and a catalogue refresh are the only ones today. A prompt or
   * a tool the user asked for is unaffected: this is about being the party that
   * decides when this machine talks to the network, not about working offline.
   */
  readonly offline?: boolean;
  /**
   * Signal when a turn finishes while the user is elsewhere: a bell, plus a
   * notification sequence for terminals that support it. Disabled by default;
   * emitting the sequence does not prove that the desktop displayed it.
   */
  readonly attentionOnIdle?: boolean;
  /**
   * Whether to keep a prompt cached between requests.
   *
   * `streaming` refreshes only while a run is under way, where the next request
   * is certainly coming; `idle` also refreshes while the session waits, which
   * spends money on a bet that the user returns before the window lapses. `off`
   * sends nothing. It only ever applies to a model whose prices are published,
   * because the decision is arithmetic on those prices.
   */
  readonly cacheWarming?: "off" | "streaming" | "idle";
  readonly agentMode?: "plan" | "build";
  readonly theme?: string;
  /** Modal editing in the prompt; Insert is the starting mode. */
  readonly vimMode?: boolean;
  readonly backgroundFollowUp?: boolean;
  /**
   * Explicit override of the interactive surface.
   *
   * `fullscreen` is the private screen: it restores the terminal exactly on exit
   * and takes the transcript with it. It is the default because it is what the
   * surface did before this field had a reader — a default decides what everyone
   * who never set the field sees, so it preserves what they already had rather
   * than adopting another tool's choice.
   *
   * `regular` keeps the conversation in the terminal's own scrollback and only
   * redraws the fixed block at the bottom, so a session that ends leaves
   * something to scroll back through. **Experimental and not yet adapted**: only
   * "do not take the alternate screen" and "write the transcript back on exit"
   * are implemented. The fixed block is re-anchored on resize but not as content
   * grows, so the prompt and the output drift out of place during a turn. Use it
   * for the scrollback, not for the layout.
   *
   * The terminal decides what an unknown value means; this type states which
   * values a configuration file may claim.
   */
  readonly tuiMode?: "regular" | "fullscreen";
  readonly tui?: TuiPreferences;
  /**
   * Whether a failed model call is asked for again.
   *
   * A rate limit or a dropped socket is answered differently a moment later;
   * without this the turn ends and the user sees a failure where waiting would
   * have worked. Absent means enabled.
   */
  readonly retryEnabled?: boolean;
  /**
   * How many times the turn layer retries, after the first attempt.
   *
   * The turn layer is the one that retries by default, because it runs between
   * steps and so can retry after the context has been reshaped — compaction
   * being the case that matters. Zero disables it without disabling the
   * mechanism.
   */
  readonly retryMaxRetries?: number;
  /**
   * How many times the provider layer retries a single request.
   *
   * Separate from the count above and zero by default, so one transient failure
   * costs one retry rather than one per layer. It exists for a host whose
   * failures are best absorbed at the request, which is where a server's own
   * `Retry-After` can be honoured.
   */
  readonly providerRetryMaxRetries?: number;
  /** First backoff before a retry, doubled per attempt. */
  readonly retryBaseDelayMs?: number;
  /** Ceiling on a backoff, so a long run stays interruptible. */
  readonly retryMaxDelayMs?: number;
  /**
   * How many queued steering messages reach the model at once.
   *
   * Steering is delivered before the model's next step. `all` hands over
   * everything waiting, `one-at-a-time` hands over the oldest and waits for the
   * response before the next — which keeps a burst of corrections from arriving
   * as one wall of text the model has to sort out. Absent means `one-at-a-time`.
   */
  readonly steeringMode?: "one-at-a-time" | "all";
  /**
   * How many queued follow-up messages reach the model at once.
   *
   * Follow-ups wait until the current work has stopped, so the same choice
   * applies at a coarser boundary. Absent means `one-at-a-time`.
   */
  readonly followUpMode?: "one-at-a-time" | "all";
  /**
   * How long a provider connection may take to establish, in milliseconds.
   *
   * A request that never answers leaves a turn waiting forever, and a retry
   * cannot rescue it: retries classify a failure *after* a response arrives, and
   * a connection that hangs never produces one. So the connection has to be
   * given a deadline of its own.
   *
   * Three separate values rather than one, because the three failures are
   * different problems: connecting to an unreachable host should give up quickly,
   * while a model that thinks for a long time before sending headers is not
   * broken. A single number would have to be loose enough for the slowest case,
   * which makes it useless for the fastest.
   */
  readonly providerConnectTimeoutMs?: number;
  /**
   * How long the provider may take to send response headers, in milliseconds.
   *
   * Idle, not total: a stream that keeps producing bytes is not timing out, only
   * one that stops. This is the deadline a long reasoning model runs against.
   */
  readonly providerHeadersTimeoutMs?: number;
  /**
   * How long the provider may pause while streaming the body, in milliseconds.
   *
   * Also idle. A model that streams a long answer is fine; one that sends nothing
   * for this long has stopped being useful.
   */
  readonly providerBodyTimeoutMs?: number;
  /**
   * Controlled source/field diagnostics without supplied values or parser text.
   * Ordinary invalid values preserve validated lower layers. Unreadable or
   * malformed documents and security fields block tool use at startup.
   */
  readonly configDiagnostics: readonly string[];
  readonly configSources: string[];
}

/**
 * What the interactive surface remembers between sessions.
 *
 * These belong to the user rather than to a session, so they live in the same
 * file as the rest of the user's configuration instead of a second one that
 * only this module reads.
 */
export interface TuiPreferences {
  /** Input shape. Absent means `default`; accepted changes apply immediately. */
  readonly composerShape?: ComposerShapeId;
  /** Status band item ids, in canonical order. Absent means the defaults. */
  readonly statusItems?: readonly string[];
  /**
   * How `mermaid` fenced blocks are shown.
   *
   * Absent means diagrams are drawn. Drawing them is the default because a
   * diagram the author wrote is meant to be read as a picture, and the fallback
   * when one cannot be drawn is the code block it already was.
   */
  readonly diagrams?: "off" | "streaming";
}

export interface RuntimeConfigFile {
  schemaVersion?: 1;
  provider?: RuntimeProvider;
  maxTurns?: number;
  allowedTools?: string[];
  allowedModels?: string[];
  pathRules?: PathRule[];
  disabledTools?: string[];
  hiddenToolPrefixes?: string[];
  denyRules?: unknown[];
  enableMcpTools?: boolean;
  toolDiscovery?: 'dynamic' | 'full';
  activeProviderConnectionId?: string;
  providerConnections?: ProviderConnectionConfig[];
  accountPool?: Record<string, { connections: string[]; baseUrl?: string }>;
  providerCredentials?: Partial<
    Record<RuntimeProvider, ProviderCredentialConfig>
  >;
  temperature?: number;
  topP?: number;
  maxOutputTokens?: number;
  contextWindow?: number;
  reserveTokens?: number;
  modelTokenBudgets?: Record<string, ModelTokenBudget>;
  instructionBudgetBytes?: number;
  offline?: boolean;
  attentionOnIdle?: boolean;
  cacheWarming?: "off" | "streaming" | "idle";
  agentMode?: "plan" | "build";
  theme?: string;
  vimMode?: boolean;
  backgroundFollowUp?: boolean;
  tuiMode?: "regular" | "fullscreen";
  tui?: TuiPreferences;
  retryEnabled?: boolean;
  retryMaxRetries?: number;
  providerRetryMaxRetries?: number;
  retryBaseDelayMs?: number;
  retryMaxDelayMs?: number;
  steeringMode?: "one-at-a-time" | "all";
  followUpMode?: "one-at-a-time" | "all";
  providerConnectTimeoutMs?: number;
  providerHeadersTimeoutMs?: number;
  providerBodyTimeoutMs?: number;
}

export const CONFIG_FIELDS = createConfigFields(RUNTIME_PROVIDERS) satisfies Record<keyof RuntimeConfigFile | "allowUntrustedHooks", ConfigField>;

export const DEFAULT_CONFIG: Omit<RuntimeConfig, "configSources" | "configProvenance" | "configTrust"> = {
  configValidation: { valid: true, securityBlocked: false },
  provider: "openai",
  maxTurns: 15,
  disabledTools: [],
  denyRules: [],
  hiddenToolPrefixes: [],
  enableMcpTools: true,
  toolDiscovery: 'dynamic',
  activeProviderConnectionId: undefined,
  providerConnections: [],
  providerCredentials: {},
  temperature: 0.7,
  topP: 1.0,
  maxOutputTokens: 4096,
  reserveTokens: 8_000,
  modelTokenBudgets: {},
  instructionBudgetBytes: 32 * 1024,
  allowUntrustedHooks: false,
  offline: false,
  attentionOnIdle: false,
  cacheWarming: "streaming",
  agentMode: "build",
  theme: "dark",
  vimMode: false,
  backgroundFollowUp: false,
  // The surface took the alternate screen unconditionally before this field was
  // wired, so that is the behaviour a default has to preserve: wiring a field
  // must not change how the product looks for someone who never set it. The
  // `regular` value below is the other choice, made deliberately by whoever
  // wants the conversation in their own scrollback.
  tuiMode: "fullscreen",
  tui: {},
  // Retrying is on by default because the failures it absorbs are the ones a
  // user cannot act on: a rate limit or a dropped socket is not a mistake in
  // their request, and the turn ends for a reason that would not have repeated.
  retryEnabled: true,
  // The turn layer carries the retries, so the provider layer starts at none:
  // one transient failure then costs one retry rather than one per layer. The
  // turn layer is also the one that can retry after compaction has reshaped the
  // context, which is the retry worth having.
  retryMaxRetries: 3,
  providerRetryMaxRetries: 0,
  retryBaseDelayMs: 2_000,
  retryMaxDelayMs: 60_000,
  // Both queues delivered one message at a time before these fields had a
  // reader, so that is the behaviour the defaults preserve.
  steeringMode: "one-at-a-time",
  followUpMode: "one-at-a-time",
  // The same values the provider fetch layer used before they were configurable,
  // so a run that sets none of them behaves exactly as it did.
  providerConnectTimeoutMs: 30_000,
  providerHeadersTimeoutMs: 120_000,
  providerBodyTimeoutMs: 120_000,
  // Empty is the normal case: nothing was wrong with any file.
  configDiagnostics: [],
};

/**
 * Overrides a command-line flag has already decided.
 *
 * A flag is a statement about this run, so it outranks both config files. Passed
 * in rather than read here so the config layer stays free of argument parsing.
 */
export interface RuntimeConfigOverrides {
  readonly attentionOnIdle?: boolean;
  readonly theme?: string;
  readonly instructionBudgetBytes?: number
  /** Skip self-initiated requests; `undefined` leaves the configured value. */
  readonly offline?: boolean
  /** Further restrict the configured allowlist; an empty list offers no tools. */
  readonly allowedTools?: readonly string[]
  /** Run declared hook commands without asking. Off unless a flag says otherwise. */
  readonly allowUntrustedHooks?: boolean
}

export function getRuntimeConfig(
  rootDir: string = process.cwd(),
  overrides?: RuntimeConfigOverrides,
  inputs?: ConfigInputs,
): RuntimeConfig {
  const configTrust = captureConfigTrust(rootDir);
  const layer = loadConfigLayers([
    { path: getProjectConfigPath(configTrust.workspaceRoot), source: "project" },
    { path: getUserConfigPath(), source: "user" },
  ], overrides, CONFIG_FIELDS, configTrust.decision, inputs, configTrust.workspaceRoot);
  // Every accepted field has passed its registry schema before this projection.
  const merged = layer.values as RuntimeConfigFile & RuntimeConfigOverrides;
  const diagnostics = layer.diagnostics;
  const sources = layer.sources;
  const provider = merged.provider ?? DEFAULT_CONFIG.provider;
  const maxTurns = merged.maxTurns ?? DEFAULT_CONFIG.maxTurns;
  const providerConnections = normalizeProviderConnections(merged.providerConnections);
  const accountPool = normalizeAccountPool(merged.accountPool);
  const poolIssue = accountPoolIssue(accountPool, providerConnections);

  const config: Omit<RuntimeConfig, 'configProvenance'> = {
    configTrust,
    ...(inputs ? { configInputs: inputs } : {}),
    ...(merged.pathRules !== undefined ? { pathRules: merged.pathRules } : {}),
    ...(merged.allowedModels !== undefined ? { allowedModels: merged.allowedModels } : {}),
    configScopes: captureConfigScopes(layer.scopeLayers ?? [], scopeSettings(DEFAULT_CONFIG), configTrust.workspaceRoot),
    configValidation: { valid: layer.valid && !poolIssue, securityBlocked: layer.blocked },
    provider,
    maxTurns,
    // Left absent when unset, rather than defaulted to an empty list: an empty
    // allowlist means "offer nothing", and defaulting to it would disable every
    // tool for everyone.
    ...(merged.allowedTools !== undefined
      ? { allowedTools: merged.allowedTools }
      : {}),
    disabledTools: merged.disabledTools ?? DEFAULT_CONFIG.disabledTools,
    denyRules: merged.denyRules !== undefined ? normalizeConfigDenials(merged.denyRules as DenyRule[]) : DEFAULT_CONFIG.denyRules,
    hiddenToolPrefixes:
      merged.hiddenToolPrefixes ?? DEFAULT_CONFIG.hiddenToolPrefixes,
    enableMcpTools: merged.enableMcpTools ?? DEFAULT_CONFIG.enableMcpTools,
    toolDiscovery: merged.toolDiscovery ?? DEFAULT_CONFIG.toolDiscovery,
    activeProviderConnectionId: normalizeConnectionId(
      merged.activeProviderConnectionId,
    ),
    providerConnections,
    ...(accountPool ? { accountPool } : {}),
    providerCredentials: normalizeProviderCredentials(
      merged.providerCredentials,
    ),
    temperature: merged.temperature ?? DEFAULT_CONFIG.temperature,
    topP: merged.topP ?? DEFAULT_CONFIG.topP,
    maxOutputTokens: merged.maxOutputTokens ?? DEFAULT_CONFIG.maxOutputTokens,
    // Left undefined when the user did not set it: the window is resolved per
    // model from the catalog, and a default filled in here would be
    // indistinguishable from a deliberate override, so the catalog would never
    // be consulted.
    ...(merged.contextWindow !== undefined ? { contextWindow: merged.contextWindow } : {}),
    reserveTokens: merged.reserveTokens ?? DEFAULT_CONFIG.reserveTokens,
    modelTokenBudgets: merged.modelTokenBudgets ?? DEFAULT_CONFIG.modelTokenBudgets,
    instructionBudgetBytes:
      merged.instructionBudgetBytes ??
      DEFAULT_CONFIG.instructionBudgetBytes,
    offline: merged.offline ?? DEFAULT_CONFIG.offline,
    attentionOnIdle: merged.attentionOnIdle ?? DEFAULT_CONFIG.attentionOnIdle,
    cacheWarming: merged.cacheWarming ?? DEFAULT_CONFIG.cacheWarming,
    // The registry accepts this exemption only from validated CLI overrides.
    // A malformed security document also suppresses the exemption.
    allowUntrustedHooks: merged.allowUntrustedHooks ?? DEFAULT_CONFIG.allowUntrustedHooks,
    agentMode: merged.agentMode ?? DEFAULT_CONFIG.agentMode,
    theme: merged.theme ?? DEFAULT_CONFIG.theme,
    vimMode: merged.vimMode ?? DEFAULT_CONFIG.vimMode,
    backgroundFollowUp: merged.backgroundFollowUp ?? DEFAULT_CONFIG.backgroundFollowUp,
    tuiMode: merged.tuiMode ?? DEFAULT_CONFIG.tuiMode,
    tui: merged.tui ?? DEFAULT_CONFIG.tui,
    retryEnabled: merged.retryEnabled ?? DEFAULT_CONFIG.retryEnabled,
    retryMaxRetries: merged.retryMaxRetries ?? DEFAULT_CONFIG.retryMaxRetries,
    providerRetryMaxRetries:
      merged.providerRetryMaxRetries ?? DEFAULT_CONFIG.providerRetryMaxRetries,
    retryBaseDelayMs: merged.retryBaseDelayMs ?? DEFAULT_CONFIG.retryBaseDelayMs,
    retryMaxDelayMs: merged.retryMaxDelayMs ?? DEFAULT_CONFIG.retryMaxDelayMs,
    steeringMode: merged.steeringMode ?? DEFAULT_CONFIG.steeringMode,
    followUpMode: merged.followUpMode ?? DEFAULT_CONFIG.followUpMode,
    providerConnectTimeoutMs: merged.providerConnectTimeoutMs ?? DEFAULT_CONFIG.providerConnectTimeoutMs,
    providerHeadersTimeoutMs: merged.providerHeadersTimeoutMs ?? DEFAULT_CONFIG.providerHeadersTimeoutMs,
    providerBodyTimeoutMs: merged.providerBodyTimeoutMs ?? DEFAULT_CONFIG.providerBodyTimeoutMs,
    configDiagnostics: dedupeDiagnostics([...diagnostics, ...(poolIssue ? [poolIssue] : [])]),
    configSources: sources,
  };
  layer.verify();
  return { ...config, configProvenance: projectConfigOrigins(layer.values, config, layer.origins, CONFIG_FIELDS) };
}

/**
 * The user file followed by the project file, for existing path-list consumers.
 * Loading and merging use explicit source policies rather than this list order.
 *
 * Named separately because readers and writers do not want the same one. A
 * reader takes everything; a writer has to say which scope it is changing, and
 * "the project's file" and "the user's file" are different answers to that.
 */
export function getUserConfigPath(): string {
  return resolveUserDataFile("config.json");
}

export function getProjectConfigPath(rootDir: string = process.cwd()): string {
  return path.join(rootDir, ".cheers.json");
}

export function getCandidateConfigPaths(
  rootDir: string = process.cwd(),
): string[] {
  return [getUserConfigPath(), getProjectConfigPath(rootDir)];
}

export function getUserRuntimeConfigPath(): string {
  return resolveUserDataFile("config.json");
}

/**
 * A config file read to be modified and written back.
 *
 * A missing primary document is editable as an empty one; an unreadable or bad
 * document always throws. Callers here take the result, change one field and
 * write the file again; returning an empty object
 * for a file that could not be parsed would make that write replace everything
 * the file held with the one field the command was setting. Losing a config file
 * to a typo is worse than refusing the command that would have done it, so the
 * error stops the caller instead.
 */
export function readRuntimeConfigFileAt(configPath: string): RuntimeConfigFile {
  try {
    const document = readConfigDocument(configPath) ?? {};
    validateRawConfig(document, CONFIG_FIELDS);
    return document as RuntimeConfigFile;
  } catch (error) {
    const reason = error instanceof ConfigDocumentError ? error.message : "invalid-field";
    // Field errors contain registry IDs only; parser and filesystem errors never escape.
    if (error instanceof Error && error.message.startsWith("Invalid config field ")) throw error;
    throw new Error(`Failed to read user runtime config: ${reason}.`);
  }
}

/** The user's config file, read to be modified and written back. */
export function readUserRuntimeConfigFile(): RuntimeConfigFile {
  return readRuntimeConfigFileAt(getUserRuntimeConfigPath());
}

/** The project's config file, read to be modified and written back. */
export function readProjectRuntimeConfigFile(rootDir: string): RuntimeConfigFile {
  return readRuntimeConfigFileAt(getProjectConfigPath(rootDir));
}

/**
 * One line per distinct complaint.
 *
 * The user file is read twice on some paths — once to resolve and once by a
 * command that then writes it back — so the same unreadable file can be
 * reported twice. Two identical warnings read as two problems.
 */
function dedupeDiagnostics(messages: readonly string[]): string[] {
  return [...new Set(messages)];
}

/** Capture raw, immutable values and the revision used by a later field patch. */
export function readRuntimeConfigEditAt(configPath: string): ConfigEdit<RuntimeConfigFile> {
  return readConfigEdit(configPath, CONFIG_FIELDS);
}

/** Save only changes against the required baseline; conflicts never overwrite newer fields. */
export function writeRuntimeConfigFileAt(
  configPath: string,
  config: RuntimeConfigFile,
  baseline: ConfigEdit<RuntimeConfigFile>,
): string {
  return persistConfigEdit(configPath, config, baseline, CONFIG_FIELDS);
}

/** Persist to the user's config file after validating its edit baseline. */
export function writeUserRuntimeConfigFile(config: RuntimeConfigFile, baseline: ConfigEdit<RuntimeConfigFile>): string {
  return writeRuntimeConfigFileAt(getUserRuntimeConfigPath(), config, baseline);
}

/** Persist to the project's config file after validating its edit baseline. */
export function writeProjectRuntimeConfigFile(
  rootDir: string,
  config: RuntimeConfigFile,
  baseline: ConfigEdit<RuntimeConfigFile>,
): string {
  return writeRuntimeConfigFileAt(getProjectConfigPath(rootDir), config, baseline);
}

function normalizeProviderCredentials(
  credentials: RuntimeConfigFile["providerCredentials"],
): RuntimeConfig["providerCredentials"] {
  if (!credentials) {
    return {};
  }

  const normalized: Partial<Record<RuntimeProvider, ProviderCredentialConfig>> =
    {};
  for (const provider of RUNTIME_PROVIDERS) {
    const apiKey = credentials[provider]?.apiKey?.trim();
    const baseUrl = normalizeBaseUrl(credentials[provider]?.baseUrl);
    const model = credentials[provider]?.model?.trim();
    const accountAuth = normalizeProviderAccountAuth(
      provider,
      credentials[provider]?.accountAuth,
    );
    const thinkingEffort = credentials[provider]?.thinkingEffort;
    const serviceTier = credentials[provider]?.serviceTier?.trim();
    if (apiKey || baseUrl || model || accountAuth || thinkingEffort !== undefined || serviceTier) {
      normalized[provider] = {
        ...(apiKey ? { apiKey } : {}),
        ...(baseUrl ? { baseUrl } : {}),
        ...(model ? { model } : {}),
        ...(thinkingEffort !== undefined ? { thinkingEffort } : {}),
        ...(serviceTier ? { serviceTier } : {}),
        ...(accountAuth ? { accountAuth } : {}),
      };
    }
  }

  return normalized;
}

function normalizeAccountPool(pool: RuntimeConfigFile['accountPool']): AccountPool | undefined {
  if (!pool || typeof pool !== 'object' || Array.isArray(pool)) return undefined;
  const entries: Record<string, AccountPoolEntry> = {};
  for (const [provider, value] of Object.entries(pool)) {
    if (!isRuntimeProvider(provider) || !value || typeof value !== 'object') continue;
    const connections = (value.connections ?? []).map(id => normalizeConnectionId(id)).filter((id): id is string => Boolean(id));
    const baseUrl = value.baseUrl?.trim().replace(/\/+$/, '');
    entries[provider] = { connections, ...(baseUrl ? { baseUrl } : {}) };
  }
  return Object.keys(entries).length ? entries : undefined;
}

/** A pool may narrow authorization, never invent it: every member must exist for that provider. */
function accountPoolIssue(pool: AccountPool | undefined, connections: readonly ProviderConnectionConfig[]): string | undefined {
  if (!pool) return undefined;
  for (const [provider, entry] of Object.entries(pool)) {
    const seen = new Set<string>();
    for (const id of entry.connections) {
      if (seen.has(id)) return `Config accountPool ${provider}: duplicate connection '${id}'.`;
      seen.add(id);
      const connection = connections.find(candidate => candidate.id === id);
      if (!connection || connection.provider !== provider) return `Config accountPool ${provider}: connection '${id}' is missing or belongs to another provider.`;
      if (entry.baseUrl && connection.baseUrl?.trim().replace(/\/+$/, '') !== entry.baseUrl) {
        return `Config accountPool ${provider}: connection '${id}' does not use the declared endpoint.`;
      }
    }
  }
  return undefined;
}

function normalizeProviderConnections(
  connections: RuntimeConfigFile["providerConnections"],
): RuntimeConfig["providerConnections"] {
  if (!connections || !Array.isArray(connections)) {
    return [];
  }

  const nowIso = new Date().toISOString();
  const normalized: ProviderConnectionConfig[] = [];
  for (const connection of connections) {
    if (!connection || typeof connection !== "object") {
      continue;
    }
    // Asked of the one list, for the same reason the credential loop is: a
    // provider added there would otherwise have its connections dropped here
    // without a word, and the config would look as though it had been read.
    if (!isRuntimeProvider(connection.provider)) {
      continue;
    }
    const id = normalizeConnectionId(connection.id);
    if (!id) {
      continue;
    }

    const authType: ProviderConnectionAuthType =
      connection.authType === "account-auth"
        ? "account-auth"
        : connection.authType === "browser-assisted-capture" ||
            String(connection.authType) === "browser-oauth"
          ? "browser-assisted-capture"
          : "api-key";
    const apiKey = connection.apiKey?.trim();
    const baseUrl = normalizeBaseUrl(connection.baseUrl);
    const model = connection.model?.trim();
    const serviceTier = connection.serviceTier?.trim();
    const accountAuth = normalizeProviderAccountAuth(
      connection.provider,
      connection.accountAuth,
    );
    const label = connection.label?.trim();
    normalized.push({
      id,
      provider: connection.provider,
      authType,
      ...(label ? { label } : {}),
      ...(apiKey ? { apiKey } : {}),
      ...(baseUrl ? { baseUrl } : {}),
      ...(model ? { model } : {}),
      ...(connection.thinkingEffort !== undefined ? { thinkingEffort: connection.thinkingEffort } : {}),
      ...(serviceTier ? { serviceTier } : {}),
      ...(accountAuth ? { accountAuth } : {}),
      status:
        connection.status === "pending" || connection.status === "error"
          ? connection.status
          : "connected",
      createdAt: connection.createdAt?.trim() || nowIso,
      updatedAt: connection.updatedAt?.trim() || nowIso,
    });
  }

  return normalized;
}

function getRuntimeConfigHomeDir(): string {
  const explicit = process.env.CHEERS_HOME_OVERRIDE?.trim();
  if (explicit) {
    return explicit;
  }

  const userProfile = process.env.USERPROFILE?.trim();
  if (userProfile) {
    return userProfile;
  }

  const home = process.env.HOME?.trim();
  if (home) {
    return home;
  }

  return os.homedir();
}
