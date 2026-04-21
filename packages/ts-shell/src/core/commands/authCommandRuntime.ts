import {
  getRuntimeConfig,
  readUserRuntimeConfigFile,
  writeUserRuntimeConfigFile,
  type RuntimeConfigFile,
  type RuntimeProvider,
} from "../../config/runtimeConfig.js";
import {
  getProviderApiKeyEnvVarName,
  maskApiKey,
  resolveProviderCredential,
} from "../shell/providerCredentials.js";
import type { CommandContext, LocalCommandResult } from "./types.js";

const SUPPORTED_PROVIDERS: RuntimeProvider[] = [
  "openai",
  "anthropic",
  "openai-compatible",
];

export async function runAuthCommand(
  args: string[],
  context: CommandContext,
): Promise<LocalCommandResult> {
  const [action, ...rest] = args;
  if (!action || action === "help") {
    return { kind: "local", output: getAuthHelpText() };
  }

  if (action === "status") {
    return { kind: "local", output: renderAuthStatus(context) };
  }

  if (action === "set") {
    return { kind: "local", output: setProviderCredential(rest, context) };
  }

  if (action === "use") {
    return { kind: "local", output: setDefaultProvider(rest) };
  }

  if (action === "logout" || action === "remove") {
    return { kind: "local", output: removeProviderCredential(rest, context) };
  }

  return {
    kind: "local",
    output: `Unknown /auth action: ${action}\n\n${getAuthHelpText()}`,
  };
}

function renderAuthStatus(context: CommandContext): string {
  const runtimeConfig = getRuntimeConfig(context.cwd);
  const resolved = resolveProviderCredential({ runtimeConfig });

  const lines: string[] = [];
  lines.push("Auth status");
  lines.push(`Default provider: ${runtimeConfig.provider}`);
  lines.push(
    `Active connection: ${runtimeConfig.activeProviderConnectionId ?? "none"}`,
  );
  lines.push(`Effective provider: ${resolved.provider}`);

  if (resolved.baseUrl) {
    lines.push(`Effective base URL: ${resolved.baseUrl}`);
  }
  if (resolved.model) {
    lines.push(`Effective model: ${resolved.model}`);
  }

  if (resolved.credential) {
    lines.push(
      resolved.credential.authMode === "account-auth"
        ? `Effective credential: ${resolved.credential.source} (account-auth)`
        : `Effective credential: ${resolved.credential.source} (${maskApiKey(resolved.credential.apiKey ?? "")})`,
    );
  } else {
    lines.push(
      `Effective credential: missing (expected ${resolved.expectedEnvVarName} or /auth set ${resolved.provider} <api-key>${resolved.provider === "openai-compatible" ? " <base-url> <model>" : ""})`,
    );
  }

  lines.push("");
  lines.push("Per-provider credentials:");
  for (const provider of SUPPORTED_PROVIDERS) {
    const envVarName = getProviderApiKeyEnvVarName(provider);
    const envKey = process.env[envVarName]?.trim();
    const profile = runtimeConfig.providerCredentials[provider];
    const configKey = profile?.apiKey;

    let source = "missing";
    let display = "none";
    if (envKey) {
      source = "env";
      display = maskApiKey(envKey);
    } else if (configKey) {
      source = "config";
      display = maskApiKey(configKey);
    }

    const extras = [
      profile?.baseUrl ? `baseUrl=${profile.baseUrl}` : null,
      profile?.model ? `model=${profile.model}` : null,
    ].filter((value): value is string => Boolean(value));

    lines.push(
      `- ${provider}: ${source} (${display})${extras.length > 0 ? ` ${extras.join(" ")}` : ""}`,
    );
  }

  lines.push("");
  lines.push(`Usage: ${getAuthUsageOneLine()}`);
  return lines.join("\n");
}

function setProviderCredential(
  args: string[],
  context: CommandContext,
): string {
  const provider = parseProvider(args[0]);
  const apiKey = args[1]?.trim();
  const baseUrl = normalizeBaseUrl(args[2]);
  const model = args[3]?.trim();

  if (!provider || !apiKey) {
    return [
      "Invalid /auth set usage.",
      "Expected: /auth set <openai|anthropic|openai-compatible> <api-key> [base-url] [model]",
      `Current provider: ${getRuntimeConfig(context.cwd).provider}`,
    ].join("\n");
  }

  const userConfig = readUserRuntimeConfigFile();
  const existingProfile = userConfig.providerCredentials?.[provider];
  const nextProfile = {
    ...(existingProfile ?? {}),
    apiKey,
    ...(baseUrl ? { baseUrl } : {}),
    ...(model ? { model } : {}),
  };

  if (provider === "openai-compatible") {
    if (!nextProfile.baseUrl) {
      return [
        "openai-compatible requires a base URL.",
        "Expected: /auth set openai-compatible <api-key> <base-url> <model>",
      ].join("\n");
    }

    if (!nextProfile.model) {
      return [
        "openai-compatible requires a model.",
        "Expected: /auth set openai-compatible <api-key> <base-url> <model>",
      ].join("\n");
    }
  }

  const next: RuntimeConfigFile = {
    ...userConfig,
    provider,
    providerCredentials: {
      ...(userConfig.providerCredentials ?? {}),
      [provider]: nextProfile,
    },
  };

  const path = writeUserRuntimeConfigFile(next);
  return [
    `Credential saved for provider ${provider}.`,
    `Default provider set to ${provider}.`,
    `Stored at: ${path}`,
    `Saved key: ${maskApiKey(apiKey)}`,
    ...(nextProfile.baseUrl ? [`Saved base URL: ${nextProfile.baseUrl}`] : []),
    ...(nextProfile.model ? [`Saved model: ${nextProfile.model}`] : []),
  ].join("\n");
}

function setDefaultProvider(args: string[]): string {
  const provider = parseProvider(args[0]);
  if (!provider) {
    return "Invalid /auth use usage. Expected: /auth use <openai|anthropic|openai-compatible>";
  }

  const userConfig = readUserRuntimeConfigFile();
  const next: RuntimeConfigFile = {
    ...userConfig,
    provider,
  };
  const path = writeUserRuntimeConfigFile(next);

  return [
    `Default provider updated to ${provider}.`,
    `Stored at: ${path}`,
  ].join("\n");
}

function removeProviderCredential(
  args: string[],
  context: CommandContext,
): string {
  const runtimeConfig = getRuntimeConfig(context.cwd);
  const provider = parseProvider(args[0]) ?? runtimeConfig.provider;

  const userConfig = readUserRuntimeConfigFile();
  const nextProviderCredentials: NonNullable<
    RuntimeConfigFile["providerCredentials"]
  > = {
    ...(userConfig.providerCredentials ?? {}),
  };
  const existingProfile = nextProviderCredentials[provider];
  if (existingProfile) {
    const { apiKey: _apiKey, ...rest } = existingProfile;
    if (rest.baseUrl || rest.model) {
      nextProviderCredentials[provider] = rest;
    } else {
      delete nextProviderCredentials[provider];
    }
  }

  const next: RuntimeConfigFile = {
    ...userConfig,
    providerCredentials: nextProviderCredentials,
  };

  const path = writeUserRuntimeConfigFile(next);
  return [
    `Removed stored credential for provider ${provider}.`,
    `Stored at: ${path}`,
    `If ${getProviderApiKeyEnvVarName(provider)} is set, runtime may still use env credential.`,
  ].join("\n");
}

function parseProvider(input?: string): RuntimeProvider | null {
  if (!input) {
    return null;
  }

  const normalized = input.trim().toLowerCase();
  if (
    normalized === "openai" ||
    normalized === "anthropic" ||
    normalized === "openai-compatible"
  ) {
    return normalized;
  }

  return null;
}

function getAuthUsageOneLine(): string {
  return "/auth status | /auth set <openai|anthropic|openai-compatible> <api-key> [base-url] [model] | /auth use <openai|anthropic|openai-compatible> | /auth logout [provider]";
}

function getAuthHelpText(): string {
  return [
    "Credential onboarding commands (legacy mode)",
    "Preferred product path: /connect status|login|use|logout",
    getAuthUsageOneLine(),
    "",
    "Examples:",
    "- /auth set openai sk-xxxx",
    "- /auth set openai-compatible sk-xxxx https://api.siliconflow.cn/v1 deepseek-ai/DeepSeek-V3",
    "- /auth status",
    "- /auth logout openai",
  ].join("\n");
}

function normalizeBaseUrl(baseUrl?: string): string | undefined {
  const trimmed = baseUrl?.trim();
  if (!trimmed) {
    return undefined;
  }

  return trimmed.replace(/\/+$/, "");
}
