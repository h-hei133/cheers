import { accountAuthKey, providerFacts } from "../providers/facts.js";
import { vertexBaseUrl, vertexTarget } from "../../provider/endpoints/googleVertex.js";
import type {
  AccountAuthConfig,
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
  readonly accountAuth?: AccountAuthConfig;
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
        connection.id === input.runtimeConfig.activeProviderConnectionId &&
        (input.cliProvider === undefined || connection.provider === input.cliProvider),
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
  // Which slot holds this provider's credential is a fact about the provider, so
  // it is read from the declaration rather than decided here. A provider with no
  // account login has no slot, and reading another one's would hand back a
  // credential belonging to a different service.
  const accountAuthSlot = accountAuthKey(provider);
  const connectionAccountAuth = accountAuthSlot
    ? activeConnectionProfile?.accountAuth?.[accountAuthSlot]
    : undefined;
  const configAccountAuth = accountAuthSlot
    ? configProfile?.accountAuth?.[accountAuthSlot]
    : undefined;
  // An address that names the account cannot be written down once, so it is
  // built here from the environment that holds the account. Every other provider
  // either states a host or has one supplied.
  const configuredBaseUrl = normalizeBaseUrl(
    input.cliBaseUrl ??
      activeConnectionProfile?.baseUrl ??
      configProfile?.baseUrl,
  );
  const baseUrl =
    configuredBaseUrl ?? (provider === "vertex" ? vertexBaseUrlFromEnvironment(env) : undefined);
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
  return providerFacts(provider).apiKeyEnvVar;
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
  const facts = providerFacts(provider);
  // A provider whose account publishes no fixed set takes whatever was named.
  if (!facts.accountAuthAllowedModels) return model;

  const normalized = model?.trim();
  if (normalized && facts.accountAuthAllowedModels.includes(normalized)) {
    return normalized;
  }
  return facts.accountAuthDefaultModel;
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
): AccountAuthConfig | undefined {
  const slot = accountAuthKey(connection.provider);
  return slot ? connection.accountAuth?.[slot] : undefined;
}

/**
 * The address a Vertex request goes to, from the account in the environment.
 *
 * Nothing is guessed: the project and the location are read from the names the
 * tooling that sets up a Google account already writes, and a missing one yields
 * no address at all rather than a string with a placeholder where an account
 * should be. Readiness reports the absence; a request never leaves with it.
 */
function vertexBaseUrlFromEnvironment(
  env: Readonly<Record<string, string | undefined>>,
): string | undefined {
  const { project, location } = vertexTarget(env);
  if (!project || !location) return undefined;
  return vertexBaseUrl({ project, location });
}
