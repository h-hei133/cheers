import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { resolveUserDataFile, userDataDir } from "../core/paths/userHome.js"

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

export type RuntimeProvider =
  | "openai"
  | "anthropic"
  | "openai-compatible"
  | "google"
  | "antigravity"
  | "claudecode";
export type ProviderConnectionAuthType =
  | "api-key"
  | "account-auth"
  | "browser-assisted-capture";

export interface OpenAIAccountAuthConfig {
  readonly type: "openai-chatgpt-account";
  readonly accessToken: string;
  readonly refreshToken: string;
  readonly expiresAt: number;
  readonly accountId?: string;
}

export interface GoogleAccountAuthConfig {
  readonly type: "google-gemini-account";
  readonly accessToken: string;
  readonly refreshToken: string;
  readonly expiresAt: number;
  readonly clientId: string;
  readonly accountEmail?: string;
}

export interface ProviderAccountAuthConfig {
  readonly openai?: OpenAIAccountAuthConfig;
  readonly google?: GoogleAccountAuthConfig;
}

export interface ProviderCredentialConfig {
  readonly apiKey?: string;
  readonly baseUrl?: string;
  readonly model?: string;
  readonly accountAuth?: ProviderAccountAuthConfig;
}

export interface ProviderConnectionConfig {
  readonly id: string;
  readonly provider: RuntimeProvider;
  readonly authType: ProviderConnectionAuthType;
  readonly label?: string;
  readonly apiKey?: string;
  readonly baseUrl?: string;
  readonly model?: string;
  readonly accountAuth?: ProviderAccountAuthConfig;
  readonly status?: "connected" | "pending" | "error";
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface RuntimeConfig {
  readonly provider: RuntimeProvider;
  readonly daemonEnabled: boolean;
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
  readonly enableMcpTools: boolean;
  readonly activeProviderConnectionId?: string;
  readonly providerConnections: readonly ProviderConnectionConfig[];
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
  readonly agentMode?: "plan" | "build";
  readonly theme?: "dark" | "light" | "auto";
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
   * Anything else, including `stream`, is treated as `fullscreen`: `stream` is
   * reserved and has no defined meaning yet, so it does not get a behavior
   * invented for it.
   */
  readonly tuiMode?: "regular" | "fullscreen" | "stream";
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
  /** Status band item ids, in canonical order. Absent means the defaults. */
  readonly statusItems?: readonly string[];
}

export interface RuntimeConfigFile {
  provider?: RuntimeProvider;
  daemonEnabled?: boolean;
  maxTurns?: number;
  allowedTools?: string[];
  disabledTools?: string[];
  hiddenToolPrefixes?: string[];
  enableMcpTools?: boolean;
  activeProviderConnectionId?: string;
  providerConnections?: ProviderConnectionConfig[];
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
  agentMode?: "plan" | "build";
  theme?: "dark" | "light" | "auto";
  tuiMode?: "regular" | "fullscreen" | "stream";
  tui?: TuiPreferences;
  retryEnabled?: boolean;
  retryMaxRetries?: number;
  providerRetryMaxRetries?: number;
  retryBaseDelayMs?: number;
  retryMaxDelayMs?: number;
  steeringMode?: "one-at-a-time" | "all";
  followUpMode?: "one-at-a-time" | "all";
}

const DEFAULT_CONFIG: Omit<RuntimeConfig, "configSources"> = {
  provider: "openai",
  daemonEnabled: true,
  maxTurns: 15,
  disabledTools: [],
  hiddenToolPrefixes: [],
  enableMcpTools: true,
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
  agentMode: "build",
  theme: "dark",
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
};

/**
 * Overrides a command-line flag has already decided.
 *
 * A flag is a statement about this run, so it outranks both config files. Passed
 * in rather than read here so the config layer stays free of argument parsing.
 */
export interface RuntimeConfigOverrides {
  readonly instructionBudgetBytes?: number
  /** The tools this run may offer. Naming none leaves the pool unrestricted. */
  readonly allowedTools?: readonly string[]
  /** Run declared hook commands without asking. Off unless a flag says otherwise. */
  readonly allowUntrustedHooks?: boolean
}

export function getRuntimeConfig(
  rootDir: string = process.cwd(),
  overrides?: RuntimeConfigOverrides,
): RuntimeConfig {
  const sources: string[] = [];
  let merged: RuntimeConfigFile = {};

  // 先读项目级配置，再读用户级配置，确保 /auth 写入的个人凭据与 provider
  // 选择能够覆盖仓库默认值，而不是被仓库内的默认配置反向压回去。
  for (const candidate of [...getCandidateConfigPaths(rootDir)].reverse()) {
    if (!fs.existsSync(candidate)) {
      continue;
    }

    try {
      const rawContent = fs.readFileSync(candidate, "utf8");
      const content = rawContent.startsWith("\uFEFF") ? rawContent.slice(1) : rawContent;
      // A config file names credentials by reference rather than by value, so a
      // key can live in the environment instead of on disk. An unset name
      // expands to the empty string rather than throwing: a missing secret
      // should surface as the provider refusing the request, not as a process
      // that cannot read its own config.
      const interpolated = content
        .replace(/\$\{([A-Za-z0-9_]+)\}/g, (_, name: string) => process.env[name] ?? "")
        .replace(/\$([A-Za-z0-9_]+)/g, (_, name: string) => process.env[name] ?? "");
      const parsed = JSON.parse(interpolated) as RuntimeConfigFile;
      merged = {
        ...merged,
        ...parsed,
        providerCredentials: {
          ...(merged.providerCredentials ?? {}),
          ...(parsed.providerCredentials ?? {}),
        },
      };
      sources.push(candidate);
    } catch (error) {
      throw new Error(
        `Failed to read runtime config at ${candidate}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  const daemonFromEnv = process.env.DAEMON_ENABLED;
  const daemonEnabled =
    daemonFromEnv === undefined
      ? (merged.daemonEnabled ?? DEFAULT_CONFIG.daemonEnabled)
      : daemonFromEnv === "1";

  const maxTurnsFromEnv = process.env.CHEERS_MAX_TURNS;
  const maxTurns = maxTurnsFromEnv
    ? Number(maxTurnsFromEnv)
    : (merged.maxTurns ?? DEFAULT_CONFIG.maxTurns);

  return {
    provider: merged.provider ?? DEFAULT_CONFIG.provider,
    daemonEnabled,
    maxTurns,
    // Left absent when unset, rather than defaulted to an empty list: an empty
    // allowlist means "offer nothing", and defaulting to it would disable every
    // tool for everyone.
    ...(overrides?.allowedTools ?? merged.allowedTools
      ? { allowedTools: overrides?.allowedTools ?? merged.allowedTools }
      : {}),
    disabledTools: merged.disabledTools ?? DEFAULT_CONFIG.disabledTools,
    hiddenToolPrefixes:
      merged.hiddenToolPrefixes ?? DEFAULT_CONFIG.hiddenToolPrefixes,
    enableMcpTools: merged.enableMcpTools ?? DEFAULT_CONFIG.enableMcpTools,
    activeProviderConnectionId: normalizeConnectionId(
      merged.activeProviderConnectionId,
    ),
    providerConnections: normalizeProviderConnections(
      merged.providerConnections,
    ),
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
      overrides?.instructionBudgetBytes ??
      merged.instructionBudgetBytes ??
      DEFAULT_CONFIG.instructionBudgetBytes,
    // Deliberately read from the overrides only. Every other field falls back to
    // the config files, but this one is an exemption from having hooks approved,
    // and a repository that could write it would be approving its own commands
    // from the same file that declares them. It is granted per run by a person
    // typing a flag, or not at all.
    allowUntrustedHooks: overrides?.allowUntrustedHooks ?? DEFAULT_CONFIG.allowUntrustedHooks,
    agentMode: merged.agentMode ?? DEFAULT_CONFIG.agentMode,
    theme: merged.theme ?? DEFAULT_CONFIG.theme,
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
    configSources: sources,
  };
}

export function getCandidateConfigPaths(
  rootDir: string = process.cwd(),
): string[] {
  return [
    resolveUserDataFile("config.json"),
    path.join(rootDir, ".cheers.json"),
  ];
}

export function getUserRuntimeConfigPath(): string {
  return resolveUserDataFile("config.json");
}

export function readUserRuntimeConfigFile(): RuntimeConfigFile {
  const configPath = getUserRuntimeConfigPath();
  if (!fs.existsSync(configPath)) {
    return {};
  }

  try {
    const rawContent = fs.readFileSync(configPath, "utf8");
    const content = rawContent.startsWith("\uFEFF") ? rawContent.slice(1) : rawContent;
    return JSON.parse(content) as RuntimeConfigFile;
  } catch (error) {
    throw new Error(
      `Failed to read user runtime config at ${configPath}: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

export function writeUserRuntimeConfigFile(config: RuntimeConfigFile): string {
  const configPath = getUserRuntimeConfigPath();
  const configDir = path.dirname(configPath);
  if (!fs.existsSync(configDir)) {
    fs.mkdirSync(configDir, { recursive: true });
  }

  fs.writeFileSync(configPath, JSON.stringify(config, null, 2), "utf8");
  return configPath;
}

function normalizeProviderCredentials(
  credentials: RuntimeConfigFile["providerCredentials"],
): RuntimeConfig["providerCredentials"] {
  if (!credentials) {
    return {};
  }

  const normalized: Partial<Record<RuntimeProvider, ProviderCredentialConfig>> =
    {};
  for (const provider of [
    "openai",
    "anthropic",
    "openai-compatible",
    "google",
    "antigravity",
    "claudecode",
  ] as const) {
    const apiKey = credentials[provider]?.apiKey?.trim();
    const baseUrl = normalizeBaseUrl(credentials[provider]?.baseUrl);
    const model = credentials[provider]?.model?.trim();
    const accountAuth = normalizeProviderAccountAuth(
      provider,
      credentials[provider]?.accountAuth,
    );
    if (apiKey || baseUrl || model || accountAuth) {
      normalized[provider] = {
        ...(apiKey ? { apiKey } : {}),
        ...(baseUrl ? { baseUrl } : {}),
        ...(model ? { model } : {}),
        ...(accountAuth ? { accountAuth } : {}),
      };
    }
  }

  return normalized;
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
    if (
      connection.provider !== "openai" &&
      connection.provider !== "anthropic" &&
      connection.provider !== "openai-compatible" &&
      connection.provider !== "google" &&
      connection.provider !== "antigravity" &&
      connection.provider !== "claudecode"
    ) {
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

function normalizeProviderAccountAuth(
  provider: RuntimeProvider,
  accountAuth?: ProviderAccountAuthConfig,
): ProviderAccountAuthConfig | undefined {
  if (!accountAuth) {
    return undefined;
  }

  if (provider === "openai") {
    const openai = accountAuth.openai;
    if (!openai || openai.type !== "openai-chatgpt-account") {
      return undefined;
    }

    const accessToken = openai.accessToken?.trim();
    const refreshToken = openai.refreshToken?.trim();
    const expiresAt = Number(openai.expiresAt);
    const accountId = openai.accountId?.trim();
    if (
      !accessToken ||
      !refreshToken ||
      !Number.isFinite(expiresAt) ||
      expiresAt <= 0
    ) {
      return undefined;
    }

    return {
      openai: {
        type: "openai-chatgpt-account",
        accessToken,
        refreshToken,
        expiresAt,
        ...(accountId ? { accountId } : {}),
      },
    };
  }

  if (provider === "google") {
    const google = accountAuth.google;
    if (!google || google.type !== "google-gemini-account") {
      return undefined;
    }

    const accessToken = google.accessToken?.trim();
    const refreshToken = google.refreshToken?.trim();
    const expiresAt = Number(google.expiresAt);
    const clientId = google.clientId?.trim();
    const accountEmail = google.accountEmail?.trim();
    if (
      !accessToken ||
      !refreshToken ||
      !clientId ||
      !Number.isFinite(expiresAt) ||
      expiresAt <= 0
    ) {
      return undefined;
    }

    return {
      google: {
        type: "google-gemini-account",
        accessToken,
        refreshToken,
        expiresAt,
        clientId,
        ...(accountEmail ? { accountEmail } : {}),
      },
    };
  }

  return undefined;
}

function normalizeBaseUrl(baseUrl?: string): string | undefined {
  const trimmed = baseUrl?.trim();
  if (!trimmed) {
    return undefined;
  }

  return trimmed.replace(/\/+$/, "");
}

function normalizeConnectionId(value?: string): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
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
