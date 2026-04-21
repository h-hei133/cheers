import {
  readUserRuntimeConfigFile,
  writeUserRuntimeConfigFile,
  type ProviderConnectionConfig,
  type RuntimeConfigFile,
  type RuntimeProvider,
} from "../../config/runtimeConfig.js";
import { maskApiKey } from "../shell/providerCredentials.js";
import type { CommandContext, LocalCommandResult } from "./types.js";
import {
  captureApiKeyViaBrowser,
  type BrowserAuthCaptureResult,
} from "./browserAuthOnboarding.js";
import {
  __setOpenAIProviderAuthLoginForTest,
  runProviderAccountAuthLogin,
} from "../auth/providerAuthRuntime.js";

type ConnectPresetId =
  | "openai"
  | "anthropic"
  | "siliconflow"
  | "google"
  | "antigravity"
  | "claudecode";

interface ConnectPreset {
  readonly id: ConnectPresetId;
  readonly label: string;
  readonly provider: RuntimeProvider;
  readonly defaultBaseUrl?: string;
  readonly defaultModel?: string;
}

const CONNECT_PRESETS: readonly ConnectPreset[] = [
  {
    id: "openai",
    label: "OpenAI",
    provider: "openai",
    defaultModel: "gpt-4.1-mini",
  },
  {
    id: "anthropic",
    label: "Anthropic",
    provider: "anthropic",
    defaultModel: "claude-sonnet-4-5",
  },
  {
    id: "siliconflow",
    label: "SiliconFlow (OpenAI Compatible)",
    provider: "openai-compatible",
    defaultBaseUrl: "https://api.siliconflow.cn/v1",
    defaultModel: "deepseek-ai/DeepSeek-V3",
  },
  {
    id: "google",
    label: "Google Gemini (OpenAI Compatible)",
    provider: "google",
    defaultBaseUrl: "https://generativelanguage.googleapis.com/v1beta/openai",
    defaultModel: "gemini-2.5-flash",
  },
  {
    id: "antigravity",
    label: "Antigravity (OpenAI Compatible)",
    provider: "antigravity",
  },
  {
    id: "claudecode",
    label: "ClaudeCode (OpenAI Compatible)",
    provider: "claudecode",
  },
];

type BrowserFlowRunner = (options: {
  readonly provider: RuntimeProvider;
  readonly presetLabel: string;
  readonly defaultBaseUrl?: string;
  readonly defaultModel?: string;
}) => Promise<BrowserAuthCaptureResult>;

let browserFlowRunner: BrowserFlowRunner = async (options) =>
  captureApiKeyViaBrowser({
    provider: options.provider,
    presetLabel: options.presetLabel,
    defaultBaseUrl: options.defaultBaseUrl,
    defaultModel: options.defaultModel,
  });

export function __setConnectBrowserFlowRunnerForTest(
  runner?: BrowserFlowRunner,
): void {
  browserFlowRunner =
    runner ??
    (async (options) =>
      captureApiKeyViaBrowser({
        provider: options.provider,
        presetLabel: options.presetLabel,
        defaultBaseUrl: options.defaultBaseUrl,
        defaultModel: options.defaultModel,
      }));
}

export function __setOpenAIAccountAuthRunnerForTest(
  runner?: () => Promise<{
    readonly accessToken: string;
    readonly refreshToken: string;
    readonly expiresAt: number;
    readonly accountId?: string;
    readonly authorizeUrl: string;
    readonly callbackUrl: string;
  }>,
): void {
  __setOpenAIProviderAuthLoginForTest(runner);
}

export async function runConnectCommand(
  args: string[],
  _context: CommandContext,
): Promise<LocalCommandResult> {
  const [action, ...rest] = args;
  if (!action || action === "help") {
    return { kind: "local", output: getConnectHelpText() };
  }

  if (action === "status" || action === "list") {
    return { kind: "local", output: renderConnectionStatus() };
  }

  if (action === "presets") {
    return { kind: "local", output: renderPresetCatalog() };
  }

  if (action === "login" || action === "add") {
    return { kind: "local", output: await addConnection(rest) };
  }

  if (action === "set") {
    return { kind: "local", output: await addConnectionFromLegacyAuthSet(rest) };
  }

  if (action === "use") {
    return { kind: "local", output: activateConnection(rest) };
  }

  if (action === "logout" || action === "disconnect" || action === "remove") {
    return { kind: "local", output: removeConnection(rest) };
  }

  return {
    kind: "local",
    output: `Unknown /connect action: ${action}\n\n${getConnectHelpText()}`,
  };
}

function renderConnectionStatus(): string {
  const userConfig = readUserRuntimeConfigFile();
  const connections = normalizeConnections(userConfig);
  const activeId = userConfig.activeProviderConnectionId?.trim();

  const lines: string[] = [];
  lines.push("Provider connections");
  lines.push(
    `Active connection: ${activeId ? activeId : "none"}${userConfig.provider ? ` (provider=${userConfig.provider})` : ""}`,
  );

  if (connections.length === 0) {
    lines.push("");
    lines.push("No saved connections.");
    lines.push(
      "Use /connect login openai --account, /connect login google --account, or /connect login <provider> --api-key <key>.",
    );
    return lines.join("\n");
  }

  lines.push("");
  for (const connection of connections) {
    const marker = connection.id === activeId ? "*" : " ";
    const label = connection.label?.trim() || connection.provider;
    lines.push(
      `${marker} ${connection.id}  [${connection.provider}]  ${label}  ${connection.authType}  ${connection.status ?? "connected"}`,
    );
    if (connection.authType === "account-auth") {
      const openaiAccount = connection.accountAuth?.openai;
      const googleAccount = connection.accountAuth?.google;
      lines.push(
        `    credential=account-auth${openaiAccount?.accountId ? ` accountId=${openaiAccount.accountId}` : ""}${googleAccount?.accountEmail ? ` email=${googleAccount.accountEmail}` : ""}${googleAccount?.clientId ? ` clientId=${maskClientId(googleAccount.clientId)}` : ""}${connection.baseUrl ? ` baseUrl=${connection.baseUrl}` : ""}${connection.model ? ` model=${connection.model}` : ""}`,
      );
    } else {
      lines.push(
        `    credential=${connection.apiKey ? maskApiKey(connection.apiKey) : "none"}${connection.baseUrl ? ` baseUrl=${connection.baseUrl}` : ""}${connection.model ? ` model=${connection.model}` : ""}`,
      );
    }
  }

  lines.push("");
  lines.push(
    "Use /connect use <connection-id> to switch runtime provider context.",
  );
  return lines.join("\n");
}

function maskClientId(clientId: string): string {
  const trimmed = clientId.trim();
  if (trimmed.length <= 10) {
    return `${trimmed.slice(0, 3)}***`;
  }
  return `${trimmed.slice(0, 6)}...${trimmed.slice(-4)}`;
}

function renderPresetCatalog(): string {
  const lines: string[] = [];
  lines.push("Connect presets");
  for (const preset of CONNECT_PRESETS) {
    lines.push(
      `- ${preset.id}: provider=${preset.provider}${preset.defaultBaseUrl ? `, baseUrl=${preset.defaultBaseUrl}` : ""}${preset.defaultModel ? `, model=${preset.defaultModel}` : ""}`,
    );
  }
  lines.push("");
  lines.push("Auth contracts:");
  lines.push("- api-key connection: /connect login <provider> --api-key <key>");
  lines.push("- account-auth connection: /connect login openai --account");
  lines.push("- browser-assisted local capture: /connect login <provider> --browser");
  return lines.join("\n");
}

async function addConnection(args: string[]): Promise<string> {
  const parsed = parseArgsWithFlags(args);
  const target = resolveProviderTarget(parsed.positionals[0]);
  if (!target) {
    return [
      "Invalid /connect login usage.",
      "API key: /connect login <openai|anthropic|openai-compatible|siliconflow|google|antigravity|claudecode> --api-key <key> [--base-url <url>] [--model <model>] [--label <name>]",
      "Account auth: /connect login openai --account [--label <name>]",
      "Browser-assisted local key capture: /connect login <provider> --browser [--label <name>]",
    ].join("\n");
  }

  if (parsed.flags.account === true) {
    return await runAccountAuthConnection(target, parsed.flags.label);
  }

  if (parsed.flags.browser === true) {
    return await runBrowserAssistedCaptureConnection(target, parsed.flags.label);
  }

  const apiKey = parseFlagValue(parsed.flags["api-key"] ?? parsed.flags.key);
  if (!apiKey) {
    return [
      "Missing API key.",
      "Usage: /connect login <provider> --api-key <key> [--base-url <url>] [--model <model>]",
    ].join("\n");
  }

  const baseUrl = normalizeBaseUrl(
    parseFlagValue(parsed.flags["base-url"]) ?? target.defaultBaseUrl,
  );
  const model = normalizeOptional(
    parseFlagValue(parsed.flags.model) ?? target.defaultModel,
  );
  if (isOpenAICompatibleStyleProvider(target.provider) && !baseUrl) {
    return `${target.provider} requires --base-url (or a preset that provides one).`;
  }
  if (isOpenAICompatibleStyleProvider(target.provider) && !model) {
    return `${target.provider} requires --model (or a preset that provides one).`;
  }

  const now = new Date().toISOString();
  const connection: ProviderConnectionConfig = {
    id: buildConnectionId(target.provider),
    provider: target.provider,
    authType: "api-key",
    ...(normalizeOptional(parseFlagValue(parsed.flags.label))
      ? { label: normalizeOptional(parseFlagValue(parsed.flags.label)) }
      : { label: target.label }),
    apiKey,
    ...(baseUrl ? { baseUrl } : {}),
    ...(model ? { model } : {}),
    status: "connected",
    createdAt: now,
    updatedAt: now,
  };

  const userConfig = readUserRuntimeConfigFile();
  const connections = normalizeConnections(userConfig);
  const nextConnections = [connection, ...connections];
  const next: RuntimeConfigFile = {
    ...userConfig,
    provider: target.provider,
    activeProviderConnectionId: connection.id,
    providerConnections: nextConnections,
    providerCredentials: {
      ...(userConfig.providerCredentials ?? {}),
      [target.provider]: {
        ...(userConfig.providerCredentials?.[target.provider] ?? {}),
        apiKey,
        ...(baseUrl ? { baseUrl } : {}),
        ...(model ? { model } : {}),
      },
    },
  };
  const configPath = writeUserRuntimeConfigFile(next);

  return [
    `Connected provider ${target.provider}.`,
    `Connection ID: ${connection.id}`,
    `Connection type: api-key`,
    `Saved key: ${maskApiKey(apiKey)}`,
    ...(baseUrl ? [`Base URL: ${baseUrl}`] : []),
    ...(model ? [`Model: ${model}`] : []),
    `Default runtime provider switched to ${target.provider}.`,
    `Stored at: ${configPath}`,
    "Use /connect status to inspect active connection details.",
  ].join("\n");
}

async function addConnectionFromLegacyAuthSet(args: string[]): Promise<string> {
  const provider = normalizeOptional(args[0]);
  const apiKey = normalizeOptional(args[1]);
  const baseUrl = normalizeOptional(args[2]);
  const model = normalizeOptional(args[3]);
  if (!provider || !apiKey) {
    return [
      "Invalid /connect set usage.",
      "Expected: /connect set <openai|anthropic|openai-compatible|siliconflow|google|antigravity|claudecode> <api-key> [base-url] [model]",
      "This is a compatibility shim migrated from legacy /auth set.",
    ].join("\n");
  }

  const forwardedArgs: string[] = [provider, "--api-key", apiKey];
  if (baseUrl) {
    forwardedArgs.push("--base-url", baseUrl);
  }
  if (model) {
    forwardedArgs.push("--model", model);
  }

  const result = await addConnection(forwardedArgs);
  return [
    result,
    "",
    "Note: /connect set is a legacy compatibility path. Prefer /connect login <provider> --api-key <key>.",
  ].join("\n");
}

function activateConnection(args: string[]): string {
  const target = args[0]?.trim();
  if (!target) {
    return "Usage: /connect use <connection-id|provider>";
  }

  const userConfig = readUserRuntimeConfigFile();
  const connections = normalizeConnections(userConfig);
  if (connections.length === 0) {
    return "No saved connections. Use /connect login first.";
  }

  const byId = connections.find((connection) => connection.id === target);
  const byProvider = connections.find(
    (connection) => connection.provider === target,
  );
  const selected = byId ?? byProvider;
  if (!selected) {
    return `Connection not found: ${target}`;
  }

  const now = new Date().toISOString();
  const nextConnections = connections.map((connection) =>
    connection.id === selected.id ? { ...connection, updatedAt: now } : connection,
  );
  const next: RuntimeConfigFile = {
    ...userConfig,
    provider: selected.provider,
    activeProviderConnectionId: selected.id,
    providerConnections: nextConnections,
  };
  const configPath = writeUserRuntimeConfigFile(next);

  return [
    `Active connection switched to ${selected.id}.`,
    `Provider: ${selected.provider}`,
    `Connection type: ${selected.authType}`,
    `Stored at: ${configPath}`,
  ].join("\n");
}

function removeConnection(args: string[]): string {
  const target = args[0]?.trim();
  if (!target) {
    return "Usage: /connect logout <connection-id|provider>";
  }

  const userConfig = readUserRuntimeConfigFile();
  const connections = normalizeConnections(userConfig);
  const existing =
    connections.find((connection) => connection.id === target) ??
    connections.find((connection) => connection.provider === target);
  if (!existing) {
    return `Connection not found: ${target}`;
  }

  const nextConnections = connections.filter(
    (connection) => connection.id !== existing.id,
  );
  const next: RuntimeConfigFile = {
    ...userConfig,
    providerConnections: nextConnections,
    activeProviderConnectionId:
      userConfig.activeProviderConnectionId === existing.id
        ? nextConnections[0]?.id
        : userConfig.activeProviderConnectionId,
    provider:
      userConfig.activeProviderConnectionId === existing.id
        ? (nextConnections[0]?.provider ?? userConfig.provider)
        : userConfig.provider,
  };
  const configPath = writeUserRuntimeConfigFile(next);

  return [
    `Disconnected provider connection ${existing.id}.`,
    ...(next.activeProviderConnectionId
      ? [`Active connection now: ${next.activeProviderConnectionId}`]
      : ["Active connection now: none"]),
    `Stored at: ${configPath}`,
  ].join("\n");
}

async function runBrowserAssistedCaptureConnection(
  target: ConnectPreset,
  labelFlag?: string | boolean,
): Promise<string> {
  const now = new Date().toISOString();
  const userConfig = readUserRuntimeConfigFile();
  const connectionId = buildConnectionId(target.provider);
  const connectionLabel =
    normalizeOptional(parseFlagValue(labelFlag)) ??
    `${target.label} browser local capture`;

  const pendingConnection: ProviderConnectionConfig = {
    id: connectionId,
    provider: target.provider,
    authType: "browser-assisted-capture",
    label: connectionLabel,
    ...(target.defaultBaseUrl ? { baseUrl: target.defaultBaseUrl } : {}),
    ...(target.defaultModel ? { model: target.defaultModel } : {}),
    status: "pending",
    createdAt: now,
    updatedAt: now,
  };

  writeUserRuntimeConfigFile({
    ...userConfig,
    providerConnections: [pendingConnection, ...normalizeConnections(userConfig)],
  });

  try {
    const browserResult = await browserFlowRunner({
      provider: target.provider,
      presetLabel: target.label,
      defaultBaseUrl: target.defaultBaseUrl,
      defaultModel: target.defaultModel,
    });

    const latest = readUserRuntimeConfigFile();
    const latestConnections = normalizeConnections(latest);
    const updatedAt = new Date().toISOString();
    const nextConnections = latestConnections.map((connection) =>
      connection.id === connectionId
        ? {
            ...connection,
            apiKey: browserResult.apiKey,
            ...(normalizeBaseUrl(browserResult.baseUrl)
              ? { baseUrl: normalizeBaseUrl(browserResult.baseUrl) }
              : {}),
            ...(normalizeOptional(browserResult.model)
              ? { model: normalizeOptional(browserResult.model) }
              : {}),
            status: "connected" as const,
            updatedAt,
          }
        : connection,
    );

    const activeConnection = nextConnections.find(
      (connection) => connection.id === connectionId,
    );
    const next: RuntimeConfigFile = {
      ...latest,
      provider: target.provider,
      activeProviderConnectionId: connectionId,
      providerConnections: nextConnections,
      providerCredentials: {
        ...(latest.providerCredentials ?? {}),
        [target.provider]: {
          ...(latest.providerCredentials?.[target.provider] ?? {}),
          apiKey: browserResult.apiKey,
          ...(activeConnection?.baseUrl
            ? { baseUrl: activeConnection.baseUrl }
            : {}),
          ...(activeConnection?.model ? { model: activeConnection.model } : {}),
        },
      },
    };
    const configPath = writeUserRuntimeConfigFile(next);

    return [
      `Browser-assisted local credential capture completed for ${target.provider}.`,
      `Connection ID: ${connectionId}`,
      "State transition: pending -> connected",
      "Connection type: browser-assisted-capture",
      `Saved key: ${maskApiKey(browserResult.apiKey)}`,
      ...(activeConnection?.baseUrl
        ? [`Base URL: ${activeConnection.baseUrl}`]
        : []),
      ...(activeConnection?.model ? [`Model: ${activeConnection.model}`] : []),
      `Default runtime provider switched to ${target.provider}.`,
      `Stored at: ${configPath}`,
    ].join("\n");
  } catch (error) {
    const latest = readUserRuntimeConfigFile();
    const latestConnections = normalizeConnections(latest);
    const updatedAt = new Date().toISOString();
    const nextConnections = latestConnections.map((connection) =>
      connection.id === connectionId
        ? {
            ...connection,
            status: "error" as const,
            updatedAt,
          }
        : connection,
    );
    const configPath = writeUserRuntimeConfigFile({
      ...latest,
      providerConnections: nextConnections,
    });
    return [
      `Browser-assisted local credential capture failed for ${target.provider}.`,
      `Connection ID: ${connectionId}`,
      "State transition: pending -> error",
      `Reason: ${error instanceof Error ? error.message : String(error)}`,
      `Stored at: ${configPath}`,
      "Retry with: /connect login <provider> --browser",
    ].join("\n");
  }
}

async function runAccountAuthConnection(
  target: ConnectPreset,
  labelFlag?: string | boolean,
): Promise<string> {
  return runProviderAccountAuthLogin({
    provider: target.provider,
    providerLabel: target.label,
    defaultModel: target.defaultModel,
    labelOverride: parseFlagValue(labelFlag),
  });
}

function normalizeConnections(config: RuntimeConfigFile): ProviderConnectionConfig[] {
  if (!config.providerConnections || config.providerConnections.length === 0) {
    return [];
  }

  return config.providerConnections
    .filter((item) => Boolean(item.id && item.provider))
    .map((item) => ({
      ...item,
      id: item.id.trim(),
      label: normalizeOptional(item.label),
      baseUrl: normalizeBaseUrl(item.baseUrl),
      model: normalizeOptional(item.model),
      apiKey: normalizeOptional(item.apiKey),
      status: item.status ?? "connected",
      createdAt: item.createdAt || new Date().toISOString(),
      updatedAt: item.updatedAt || new Date().toISOString(),
    }));
}

function resolveProviderTarget(input?: string): ConnectPreset | null {
  const normalized = input?.trim().toLowerCase();
  if (!normalized) {
    return null;
  }

  const preset = CONNECT_PRESETS.find(
    (candidate) => candidate.id === normalized,
  );
  if (preset) {
    return preset;
  }

  if (normalized === "openai-compatible") {
    return {
      id: "siliconflow",
      label: "OpenAI Compatible",
      provider: "openai-compatible",
    };
  }

  if (normalized === "google" || normalized === "gemini") {
    return {
      id: "google",
      label: "Google Gemini (OpenAI Compatible)",
      provider: "google",
      defaultBaseUrl: "https://generativelanguage.googleapis.com/v1beta/openai",
      defaultModel: "gemini-2.5-flash",
    };
  }

  if (normalized === "antigravity") {
    return {
      id: "antigravity",
      label: "Antigravity (OpenAI Compatible)",
      provider: "antigravity",
    };
  }

  if (normalized === "claudecode") {
    return {
      id: "claudecode",
      label: "ClaudeCode (OpenAI Compatible)",
      provider: "claudecode",
    };
  }

  return null;
}

function buildConnectionId(provider: RuntimeProvider): string {
  return `${provider}-${Date.now().toString(36)}`;
}

function parseArgsWithFlags(args: string[]): {
  positionals: string[];
  flags: Record<string, string | boolean>;
} {
  const positionals: string[] = [];
  const flags: Record<string, string | boolean> = {};

  for (let index = 0; index < args.length; index += 1) {
    const token = args[index];
    if (!token.startsWith("--")) {
      positionals.push(token);
      continue;
    }

    const key = token.slice(2).trim().toLowerCase();
    const next = args[index + 1];
    if (!next || next.startsWith("--")) {
      flags[key] = true;
      continue;
    }

    flags[key] = next;
    index += 1;
  }

  return { positionals, flags };
}

function parseFlagValue(value?: string | boolean): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }

  return normalizeOptional(value);
}

function normalizeOptional(value?: string): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

function normalizeBaseUrl(baseUrl?: string): string | undefined {
  const trimmed = normalizeOptional(baseUrl);
  if (!trimmed) {
    return undefined;
  }
  return trimmed.replace(/\/+$/, "");
}

function getConnectHelpText(): string {
  return [
    "Provider connect and onboarding commands",
    "/connect status|list",
    "/connect presets",
    "/connect login <provider|preset> --api-key <key> [--base-url <url>] [--model <model>] [--label <name>]",
    "/connect set <provider|preset> <api-key> [base-url] [model]       (legacy /auth set compatibility)",
    "/connect login openai --account [--label <name>]                 (real ChatGPT account login)",
    "/connect login google --account [--label <name>]                 (Google OAuth; requires GOOGLE_OAUTH_CLIENT_ID)",
    "/connect login <provider|preset> --browser [--label <name>]      (browser-assisted local key capture)",
    "/connect use <connection-id|provider>",
    "/connect logout <connection-id|provider>",
    "",
    "Providers: openai | anthropic | openai-compatible | siliconflow | google | antigravity | claudecode",
    "Examples:",
    "- /connect login siliconflow --api-key sk-xxxx",
    "- /connect login google --api-key <key>",
    "- /connect login google --account   (requires GOOGLE_OAUTH_CLIENT_ID env)",
    "- /connect login antigravity --api-key <key> --base-url <url> --model <model>",
    "- /connect login openai --account",
    "- /connect login openai --api-key sk-xxxx --model gpt-4.1-mini",
    "- /connect status",
  ].join("\n");
}

function isOpenAICompatibleStyleProvider(provider: RuntimeProvider): boolean {
  return (
    provider === "openai-compatible" ||
    provider === "google" ||
    provider === "antigravity" ||
    provider === "claudecode"
  );
}
