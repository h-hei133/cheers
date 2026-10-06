import { ConfigWriteError } from '../../config/outcome.js';
import { connectSyntax, parseConnectArgs } from "./connect/syntax.js";
import { syntaxHelp } from "./syntax/projection.js";
import {
  readRuntimeConfigEditAt, getUserRuntimeConfigPath,
  writeUserRuntimeConfigFile,
  type ProviderConnectionConfig,
  type RuntimeConfigFile,
} from "../../config/runtimeConfig.js";
import { maskApiKey } from "../shell/providerCredentials.js";
import type { CommandContext, LocalCommandResult } from "./types.js";
import { captureApiKeyViaBrowser } from "./browserAuthOnboarding.js";
import {
  __setOpenAIProviderAuthLoginForTest,
  runProviderAccountAuthLogin,
} from "../auth/providerAuthRuntime.js";
import type { BrowserFlowRunner, ConnectPreset } from "./connect/types.js";
import {
  buildConnectionId,
  normalizeBaseUrl,
  normalizeConnections,
  normalizeOptional,
  parseFlagValue,
  resolveProviderTarget,
} from "./connect/preset.js";
import { needsUserEndpoint } from "../providers/facts.js";
import {
  getConnectHelpText,
  renderConnectionStatus,
  renderPresetCatalog,
} from "./connect/renderer.js";

export * from "./connect/types.js";
export * from "./connect/preset.js";
export * from "./connect/renderer.js";

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
  const parsed = parseConnectArgs(args);
  if (!parsed.ok) return { kind: "local", output: `Invalid /connect arguments: ${parsed.reason}\n${syntaxHelp(connectSyntax)}` };
  const action = parsed.action.name;
  const rest = args.slice(1);
  if (!action || action === "help") {
    return { kind: "local", output: getConnectHelpText() };
  }

  if (action === "status" || action === "list") {
    return { kind: "local", output: renderConnectionStatus() };
  }

  if (action === "presets") {
    return { kind: "local", output: renderPresetCatalog() };
  }

  if (action === "login") {
    return { kind: "local", output: await addConnection(rest) };
  }

  if (action === "set") {
    return { kind: "local", output: await addConnectionFromLegacyAuthSet(rest) };
  }

  if (action === "use" || action === "activate") {
    return { kind: "local", output: activateConnection(rest) };
  }

  if (action === "logout" || action === "remove" || action === "rm") {
    return { kind: "local", output: removeConnection(rest) };
  }

  return {
    kind: "local",
    output: `Unknown /connect action: ${action}\n\n${getConnectHelpText()}`,
  };
}

export async function addConnection(args: string[]): Promise<string> {
  const syntax = parseConnectArgs(["login", ...args]);
  if (!syntax.ok) return `Invalid /connect arguments: ${syntax.reason}\n${syntaxHelp(connectSyntax)}`;
  const parsed = { positionals: syntax.args, flags: Object.fromEntries(syntax.flags) };
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
  if (needsUserEndpoint(target.provider) && !baseUrl) {
    return `${target.provider} requires --base-url (or a preset that provides one).`;
  }
  if (needsUserEndpoint(target.provider) && !model) {
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

  const edit = readRuntimeConfigEditAt(getUserRuntimeConfigPath());
  const userConfig = edit.values;
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
  const configPath = writeUserRuntimeConfigFile(next, edit);

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

export async function addConnectionFromLegacyAuthSet(args: string[]): Promise<string> {
  const syntax = parseConnectArgs(["set", ...args]);
  if (!syntax.ok) return `Invalid /connect arguments: ${syntax.reason}\n${syntaxHelp(connectSyntax)}`;
  args = [...syntax.args];
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

  const forwardedArgs: string[] = [provider, `--api-key=${apiKey}`];
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

export function activateConnection(args: string[]): string {
  const syntax = parseConnectArgs(["use", ...args]);
  if (!syntax.ok) return `Invalid /connect arguments: ${syntax.reason}\n${syntaxHelp(connectSyntax)}`;
  args = [...syntax.args];
  const target = args[0]?.trim();
  if (!target) {
    return "Usage: /connect use <connection-id|provider>";
  }

  const edit = readRuntimeConfigEditAt(getUserRuntimeConfigPath());
  const userConfig = edit.values;
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
  const configPath = writeUserRuntimeConfigFile(next, edit);

  return [
    `Active connection switched to ${selected.id}.`,
    `Provider: ${selected.provider}`,
    `Connection type: ${selected.authType}`,
    `Stored at: ${configPath}`,
  ].join("\n");
}

export function removeConnection(args: string[]): string {
  const syntax = parseConnectArgs(["logout", ...args]);
  if (!syntax.ok) return `Invalid /connect arguments: ${syntax.reason}\n${syntaxHelp(connectSyntax)}`;
  args = [...syntax.args];
  const target = args[0]?.trim();
  if (!target) {
    return "Usage: /connect logout <connection-id|provider>";
  }

  const edit = readRuntimeConfigEditAt(getUserRuntimeConfigPath());
  const userConfig = edit.values;
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
  const configPath = writeUserRuntimeConfigFile(next, edit);

  return [
    `Disconnected provider connection ${existing.id}.`,
    ...(next.activeProviderConnectionId
      ? [`Active connection now: ${next.activeProviderConnectionId}`]
      : ["Active connection now: none"]),
    `Stored at: ${configPath}`,
  ].join("\n");
}

export async function runBrowserAssistedCaptureConnection(
  target: ConnectPreset,
  labelFlag?: string | boolean,
): Promise<string> {
  const now = new Date().toISOString();
  const edit = readRuntimeConfigEditAt(getUserRuntimeConfigPath());
  const userConfig = edit.values;
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
  }, edit);

  try {
    const browserResult = await browserFlowRunner({
      provider: target.provider,
      presetLabel: target.label,
      defaultBaseUrl: target.defaultBaseUrl,
      defaultModel: target.defaultModel,
    });

    const edit = readRuntimeConfigEditAt(getUserRuntimeConfigPath());
    const latest = edit.values;
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
    const configPath = writeUserRuntimeConfigFile(next, edit);

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
    if (error instanceof ConfigWriteError) throw error;
    const edit = readRuntimeConfigEditAt(getUserRuntimeConfigPath());
    const latest = edit.values;
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
    }, edit);
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

export async function runAccountAuthConnection(
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
