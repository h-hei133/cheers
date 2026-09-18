import {
  type GoogleAccountAuthConfig,
  readUserRuntimeConfigFile,
  writeUserRuntimeConfigFile,
  type OpenAIAccountAuthConfig,
  type ProviderConnectionConfig,
  type RuntimeConfigFile,
  type RuntimeProvider,
} from "../../config/runtimeConfig.js";
import { openAIProviderAuthContract } from "../commands/openaiAccountAuth.js";
import { googleProviderAuthContract } from "../commands/googleAccountAuth.js";
import {
  type ProviderAccountAuthResult,
  toGoogleAccountAuthConfig,
  toOpenAIAccountAuthConfig,
  type ProviderAccountAuthConnectionSummary,
  type ProviderAuthContract,
} from "./providerAuthContract.js";

const CONTRACTS: readonly ProviderAuthContract[] = [
  openAIProviderAuthContract,
  googleProviderAuthContract,
];
const OPENAI_ACCOUNT_AUTH_DEFAULT_MODEL = "gpt-5.4";
const OPENAI_ACCOUNT_AUTH_ALLOWED_MODELS = new Set([
  "gpt-5.1-codex",
  "gpt-5.1-codex-max",
  "gpt-5.1-codex-mini",
  "gpt-5.2",
  "gpt-5.2-codex",
  "gpt-5.3-codex",
  "gpt-5.4",
  "gpt-5.4-mini",
]);
const GOOGLE_ACCOUNT_AUTH_DEFAULT_MODEL = "gemini-2.5-flash";
let testOpenAILoginOverride:
  | ((...args: Parameters<ProviderAuthContract["loginAccountAuth"]>) => ReturnType<ProviderAuthContract["loginAccountAuth"]>)
  | undefined;

export async function runProviderAccountAuthLogin(input: {
  readonly provider: RuntimeProvider;
  readonly providerLabel: string;
  readonly defaultModel?: string;
  readonly labelOverride?: string;
}): Promise<string> {
  const contract = resolveProviderAuthContract(input.provider);
  if (!contract) {
    return [
      "Account-auth is currently unavailable for this provider in this build.",
      `Use --api-key or --browser for ${input.provider}.`,
    ].join("\n");
  }

  const connectionId = buildConnectionId(input.provider);
  const now = new Date().toISOString();
  const pendingConnection: ProviderConnectionConfig = {
    id: connectionId,
    provider: input.provider,
    authType: "account-auth",
    label:
      normalizeText(input.labelOverride) ?? `${input.providerLabel} account auth`,
    ...(resolveAccountAuthModel(input.provider, input.defaultModel)
      ? { model: resolveAccountAuthModel(input.provider, input.defaultModel) }
      : {}),
    status: "pending",
    createdAt: now,
    updatedAt: now,
  };
  persistConnectionPatch({
    patchKind: "insert-pending",
    connectionId,
    pendingConnection,
  });

  try {
    const authResult = await contract.loginAccountAuth();
    const accountAuth = resolveAccountAuthConfig(input.provider, authResult);
    if (!accountAuth) {
      throw new Error(
        `Provider ${input.provider} returned unsupported account-auth payload.`,
      );
    }
    const summary = persistConnectedAccountAuth({
      provider: input.provider,
      connectionId,
      accountAuth,
      authorizeUrl: authResult.authorizeUrl,
      callbackUrl: authResult.callbackUrl,
    });

    return [
      `${input.providerLabel} account-auth connected via browser login.`,
      `Connection ID: ${summary.connectionId}`,
      "State transition: pending -> connected",
      "Connection type: account-auth",
      `Authorize URL: ${summary.authorizeUrl}`,
      `Callback URL: ${summary.callbackUrl}`,
      `Default runtime provider switched to ${summary.provider}.`,
      `Stored at: ${summary.configPath}`,
    ].join("\n");
  } catch (error) {
    const configPath = persistConnectionPatch({
      patchKind: "mark-error",
      connectionId,
    });
    return [
      `${input.providerLabel} account-auth login failed.`,
      `Connection ID: ${connectionId}`,
      "State transition: pending -> error",
      `Reason: ${error instanceof Error ? error.message : String(error)}`,
      `Stored at: ${configPath}`,
      `Retry with: /connect login ${input.provider} --account`,
    ].join("\n");
  }
}

function resolveProviderAuthContract(
  provider: RuntimeProvider,
): ProviderAuthContract | undefined {
  const match = CONTRACTS.find((item) => item.provider === provider);
  if (!match) {
    return undefined;
  }
  const override = testOpenAILoginOverride;
  if (provider !== "openai" || !override) {
    return match;
  }
  return {
    ...match,
    loginAccountAuth: (options) => override(options),
  };
}

export function __setOpenAIProviderAuthLoginForTest(
  override?: (
    options?: { readonly timeoutMs?: number },
  ) => ReturnType<ProviderAuthContract["loginAccountAuth"]>,
): void {
  testOpenAILoginOverride = override;
}

function persistConnectedAccountAuth(input: {
  readonly provider: RuntimeProvider;
  readonly connectionId: string;
  readonly accountAuth: OpenAIAccountAuthConfig | GoogleAccountAuthConfig;
  readonly authorizeUrl: string;
  readonly callbackUrl: string;
}): ProviderAccountAuthConnectionSummary {
  const latest = readUserRuntimeConfigFile();
  const updatedAt = new Date().toISOString();
  const nextConnections = normalizeConnections(latest).map((connection) =>
    connection.id === input.connectionId
      ? {
          ...connection,
          authType: "account-auth" as const,
          model: resolveAccountAuthModel(input.provider, connection.model),
          accountAuth: toProviderAccountAuthConfig(input.provider, input.accountAuth),
          status: "connected" as const,
          updatedAt,
        }
      : connection,
  );

  const next: RuntimeConfigFile = {
    ...latest,
    provider: input.provider,
    activeProviderConnectionId: input.connectionId,
    providerConnections: nextConnections,
    providerCredentials: {
      ...(latest.providerCredentials ?? {}),
      [input.provider]: {
        // Account-auth should become the primary credential source after
        // successful login. Keep endpoint/model metadata, but do not keep
        // stale api-key fields that can force runtime back to api-key path.
        ...withoutApiKey(latest.providerCredentials?.[input.provider] ?? {}),
        model: resolveAccountAuthModel(
          input.provider,
          latest.providerCredentials?.[input.provider]?.model,
        ),
        accountAuth: toProviderAccountAuthConfig(input.provider, input.accountAuth),
      },
    },
  };
  const configPath = writeUserRuntimeConfigFile(next);
  return {
    connectionId: input.connectionId,
    provider: input.provider,
    configPath,
    authorizeUrl: input.authorizeUrl,
    callbackUrl: input.callbackUrl,
  };
}

function persistConnectionPatch(input: {
  readonly patchKind: "insert-pending" | "mark-error";
  readonly connectionId: string;
  readonly pendingConnection?: ProviderConnectionConfig;
}): string {
  const latest = readUserRuntimeConfigFile();
  if (input.patchKind === "insert-pending" && input.pendingConnection) {
    return writeUserRuntimeConfigFile({
      ...latest,
      providerConnections: [
        input.pendingConnection,
        ...normalizeConnections(latest),
      ],
    });
  }

  const nextConnections = normalizeConnections(latest).map((connection) =>
    connection.id === input.connectionId
      ? {
          ...connection,
          status: "error" as const,
          updatedAt: new Date().toISOString(),
        }
      : connection,
  );
  return writeUserRuntimeConfigFile({
    ...latest,
    providerConnections: nextConnections,
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
  const trimmed = baseUrl?.trim();
  if (!trimmed) {
    return undefined;
  }
  return trimmed.replace(/\/+$/, "");
}

function buildConnectionId(provider: RuntimeProvider): string {
  return `${provider}-${Date.now().toString(36)}`;
}

function resolveAccountAuthModel(
  provider: RuntimeProvider,
  candidate?: string,
): string | undefined {
  if (provider === "google") {
    const normalized = normalizeText(candidate);
    return normalized ?? GOOGLE_ACCOUNT_AUTH_DEFAULT_MODEL;
  }

  if (provider !== "openai") {
    return normalizeText(candidate);
  }

  const normalized = normalizeText(candidate);
  if (!normalized) {
    return OPENAI_ACCOUNT_AUTH_DEFAULT_MODEL;
  }

  if (OPENAI_ACCOUNT_AUTH_ALLOWED_MODELS.has(normalized)) {
    return normalized;
  }

  return OPENAI_ACCOUNT_AUTH_DEFAULT_MODEL;
}

function withoutApiKey<T extends { readonly apiKey?: string }>(value: T): Omit<T, "apiKey"> {
  const { apiKey: _apiKey, ...rest } = value;
  return rest;
}

function resolveAccountAuthConfig(
  provider: RuntimeProvider,
  result: ProviderAccountAuthResult,
): OpenAIAccountAuthConfig | GoogleAccountAuthConfig | undefined {
  if (provider === "openai") {
    return toOpenAIAccountAuthConfig(result);
  }
  if (provider === "google") {
    const config = toGoogleAccountAuthConfig(result);
    if (!config.clientId.trim()) {
      throw new Error(
        "Google account-auth token exchange succeeded but client_id was missing in auth result.",
      );
    }
    return config;
  }
  return undefined;
}

function toProviderAccountAuthConfig(
  provider: RuntimeProvider,
  config: OpenAIAccountAuthConfig | GoogleAccountAuthConfig,
): NonNullable<ProviderConnectionConfig["accountAuth"]> {
  if (provider === "openai" && config.type === "openai-chatgpt-account") {
    return { openai: config };
  }
  if (provider === "google" && config.type === "google-gemini-account") {
    return { google: config };
  }
  return {};
}
