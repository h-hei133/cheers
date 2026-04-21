import type {
  GoogleAccountAuthConfig,
  OpenAIAccountAuthConfig,
  RuntimeConfig,
  ProviderConnectionConfig,
  RuntimeProvider,
} from "../../config/runtimeConfig.js";

export type ProviderCredentialSource = "cli" | "env" | "connection" | "config";
export type ProviderCredentialAuthMode = "api-key" | "account-auth";

export interface ResolvedProviderCredential {
  readonly provider: RuntimeProvider;
  readonly authMode: ProviderCredentialAuthMode;
  readonly apiKey?: string;
  readonly accountAuth?: OpenAIAccountAuthConfig | GoogleAccountAuthConfig;
  readonly baseUrl?: string;
  readonly model?: string;
  readonly source: ProviderCredentialSource;
  readonly envVarName: string;
}

export interface ProviderCredentialResolutionInput {
  readonly runtimeConfig: RuntimeConfig;
  readonly cliProvider?: RuntimeProvider;
  readonly cliApiKey?: string;
  readonly cliBaseUrl?: string;
  readonly cliModel?: string;
  readonly env?: NodeJS.ProcessEnv;
}

export interface ProviderCredentialResolution {
  readonly provider: RuntimeProvider;
  readonly credential?: ResolvedProviderCredential;
  readonly expectedEnvVarName: string;
  readonly baseUrl?: string;
  readonly model?: string;
}

export function resolveProviderCredential(
  input: ProviderCredentialResolutionInput,
): ProviderCredentialResolution {
  const env = input.env ?? process.env;
  const providerFromConfig = input.runtimeConfig.provider;
  const activeConnection =
    input.runtimeConfig.providerConnections.find(
      (connection) =>
        connection.id === input.runtimeConfig.activeProviderConnectionId,
    ) ??
    pickFallbackConnection(
      input.runtimeConfig.providerConnections,
      input.cliProvider ?? providerFromConfig,
    ) ??
    null;
  const provider =
    input.cliProvider ?? activeConnection?.provider ?? input.runtimeConfig.provider;
  const expectedEnvVarName = getProviderApiKeyEnvVarName(provider);
  const configProfile = input.runtimeConfig.providerCredentials[provider];
  const activeConnectionProfile =
    activeConnection && activeConnection.provider === provider
      ? activeConnection
      : undefined;
  const connectionAccountAuth =
    provider === "openai"
      ? activeConnectionProfile?.accountAuth?.openai
      : provider === "google"
        ? activeConnectionProfile?.accountAuth?.google
        : undefined;
  const configAccountAuth =
    provider === "openai"
      ? configProfile?.accountAuth?.openai
      : provider === "google"
        ? configProfile?.accountAuth?.google
        : undefined;
  const baseUrl = normalizeBaseUrl(
    input.cliBaseUrl ??
      activeConnectionProfile?.baseUrl ??
      configProfile?.baseUrl,
  );
  const model = normalizeModel(
    input.cliModel ?? activeConnectionProfile?.model ?? configProfile?.model,
  );

  const cliApiKey = input.cliApiKey?.trim();
  if (cliApiKey) {
    return {
      provider,
      expectedEnvVarName,
      baseUrl,
      model,
      credential: {
        provider,
        authMode: "api-key",
        apiKey: cliApiKey,
        baseUrl,
        model,
        source: "cli",
        envVarName: expectedEnvVarName,
      },
    };
  }

  const activeConnectionAuthType = activeConnectionProfile?.authType;
  if (connectionAccountAuth && activeConnectionAuthType === "account-auth") {
    return {
      provider,
      expectedEnvVarName,
      baseUrl,
      model,
      credential: {
        provider,
        authMode: "account-auth",
        accountAuth: connectionAccountAuth,
        baseUrl,
        model,
        source: "connection",
        envVarName: expectedEnvVarName,
      },
    };
  }

  const envApiKey = env[expectedEnvVarName]?.trim();
  if (envApiKey) {
    return {
      provider,
      expectedEnvVarName,
      baseUrl,
      model,
      credential: {
        provider,
        authMode: "api-key",
        apiKey: envApiKey,
        baseUrl,
        model,
        source: "env",
        envVarName: expectedEnvVarName,
      },
    };
  }

  const connectionApiKey = activeConnectionProfile?.apiKey?.trim();
  if (connectionApiKey) {
    return {
      provider,
      expectedEnvVarName,
      baseUrl,
      model,
      credential: {
        provider,
        authMode: "api-key",
        apiKey: connectionApiKey,
        baseUrl,
        model,
        source: "connection",
        envVarName: expectedEnvVarName,
      },
    };
  }

  if (connectionAccountAuth) {
    return {
      provider,
      expectedEnvVarName,
      baseUrl,
      model,
      credential: {
        provider,
        authMode: "account-auth",
        accountAuth: connectionAccountAuth,
        baseUrl,
        model,
        source: "connection",
        envVarName: expectedEnvVarName,
      },
    };
  }

  const configApiKey = configProfile?.apiKey?.trim();

  if (configAccountAuth) {
    const normalizedAccountAuthModel = normalizeAccountAuthModel(provider, model);
    return {
      provider,
      expectedEnvVarName,
      baseUrl,
      model: normalizedAccountAuthModel,
      credential: {
        provider,
        authMode: "account-auth",
        accountAuth: configAccountAuth,
        baseUrl,
        model: normalizedAccountAuthModel,
        source: "config",
        envVarName: expectedEnvVarName,
      },
    };
  }

  if (configApiKey) {
    return {
      provider,
      expectedEnvVarName,
      baseUrl,
      model,
      credential: {
        provider,
        authMode: "api-key",
        apiKey: configApiKey,
        baseUrl,
        model,
        source: "config",
        envVarName: expectedEnvVarName,
      },
    };
  }

  return { provider, expectedEnvVarName, baseUrl, model };
}

export function getProviderApiKeyEnvVarName(provider: RuntimeProvider): string {
  if (provider === "openai") {
    return "OPENAI_API_KEY";
  }

  if (provider === "anthropic") {
    return "ANTHROPIC_API_KEY";
  }

  if (provider === "google") {
    return "GOOGLE_API_KEY";
  }

  if (provider === "antigravity") {
    return "ANTIGRAVITY_API_KEY";
  }

  if (provider === "claudecode") {
    return "CLAUDECODE_API_KEY";
  }

  return "OPENAI_COMPATIBLE_API_KEY";
}

export function maskApiKey(apiKey: string): string {
  const trimmed = apiKey.trim();
  if (trimmed.length <= 8) {
    return `${trimmed.slice(0, 2)}***`;
  }

  return `${trimmed.slice(0, 4)}...${trimmed.slice(-4)}`;
}

function normalizeBaseUrl(baseUrl?: string): string | undefined {
  const trimmed = baseUrl?.trim();
  if (!trimmed) {
    return undefined;
  }

  return trimmed.replace(/\/+$/, "");
}

function normalizeModel(model?: string): string | undefined {
  const trimmed = model?.trim();
  return trimmed ? trimmed : undefined;
}

function normalizeAccountAuthModel(
  provider: RuntimeProvider,
  model?: string,
): string | undefined {
  if (provider !== "openai") {
    return model;
  }

  const normalized = model?.trim();
  if (
    normalized &&
    OPENAI_ACCOUNT_AUTH_ALLOWED_MODELS.has(normalized)
  ) {
    return normalized;
  }
  return OPENAI_ACCOUNT_AUTH_DEFAULT_MODEL;
}

function pickFallbackConnection(
  connections: readonly RuntimeConfig["providerConnections"][number][],
  provider: RuntimeProvider,
): ProviderConnectionConfig | undefined {
  const sameProvider = connections.filter(
    (connection) => connection.provider === provider,
  );
  if (sameProvider.length === 0) {
    return undefined;
  }

  const connected = sameProvider.filter(
    (connection) => connection.status !== "error",
  );
  const accountAuthConnected = connected.filter(
    (connection) => connection.authType === "account-auth" && Boolean(resolveConnectionAccountAuth(connection)),
  );

  const candidates =
    accountAuthConnected.length > 0
      ? accountAuthConnected
      : connected.length > 0
        ? connected
        : sameProvider;

  return [...candidates].sort((left, right) => {
    const leftTime = Date.parse(left.updatedAt || left.createdAt || "");
    const rightTime = Date.parse(right.updatedAt || right.createdAt || "");
    return Number.isFinite(rightTime) && Number.isFinite(leftTime)
      ? rightTime - leftTime
      : 0;
  })[0];
}

function resolveConnectionAccountAuth(
  connection: ProviderConnectionConfig,
): OpenAIAccountAuthConfig | GoogleAccountAuthConfig | undefined {
  if (connection.provider === "openai") {
    return connection.accountAuth?.openai;
  }
  if (connection.provider === "google") {
    return connection.accountAuth?.google;
  }
  return undefined;
}

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
const OPENAI_ACCOUNT_AUTH_DEFAULT_MODEL = "gpt-5.4";
