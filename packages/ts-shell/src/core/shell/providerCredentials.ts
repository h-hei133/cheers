import { preferredEffort, type ThinkingPreference } from '../models/effort.js';
import { accountAuthKey, providerFacts } from "../providers/facts.js";
import { vertexBaseUrl, vertexTarget } from "../../provider/endpoints/googleVertex.js";
import type {
  AccountAuthConfig,
  RuntimeConfig,
  ProviderConnectionConfig,
  RuntimeProvider,
} from "../../config/runtimeConfig.js";
import { selectPooledConnection, type PoolBlock } from '../auth/account/pool.js';

export type ProviderCredentialSource = "cli" | "env" | "connection" | "config";
export type ProviderCredentialAuthMode = "api-key" | "account-auth";

export interface ResolvedProviderCredential {
  /** The actual selected record, including fallback selection without an active ID. */
  readonly connectionId?: string;
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
  /** When the configuration declares a pool, selection stays inside it. */
  readonly pool?: { readonly sessionId?: string };
}

export interface ProviderCredentialResolution {
  /** A selected pending connection cannot borrow credentials from another source. */
  readonly blocked?: 'connection-pending' | 'connection-unavailable' | 'connection-overridden' | 'pool-required' | PoolBlock;
  /** Explicit selection inputs retained for identity checks against later settings. */
  readonly selection?: { readonly provider?: RuntimeProvider; readonly baseUrl?: string; readonly connectionId?: string; readonly credentialScope?: 'provider' };
  readonly thinkingEffort?: ThinkingPreference;
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
  const binding = input.runtimeConfig.sessionConnection;
  const providerBinding = binding?.scope === 'provider' ? binding : undefined;
  const boundConnection = binding && !providerBinding && input.runtimeConfig.providerConnections.find(connection => connection.id === binding.id
    && connection.provider === binding.provider && connection.status !== 'error');
  if (binding && !providerBinding && (!boundConnection || input.runtimeConfig.activeProviderConnectionId !== binding.id)) {
    return { provider: providerFromConfig, expectedEnvVarName: getProviderApiKeyEnvVarName(providerFromConfig), blocked: 'connection-unavailable' };
  }
  if (providerBinding && (providerBinding.provider !== providerFromConfig
    || (input.cliProvider !== undefined && input.cliProvider !== providerBinding.provider))) {
    return { provider: providerFromConfig, expectedEnvVarName: getProviderApiKeyEnvVarName(providerFromConfig), blocked: 'connection-overridden' };
  }
  if (boundConnection && ((input.cliProvider !== undefined && input.cliProvider !== boundConnection.provider)
    || (input.cliApiKey?.trim() && input.cliApiKey.trim() !== boundConnection.apiKey?.trim())
    || (input.cliBaseUrl !== undefined && normalizeBaseUrl(input.cliBaseUrl) !== normalizeBaseUrl(boundConnection.baseUrl)))) {
    return { provider: boundConnection.provider, expectedEnvVarName: getProviderApiKeyEnvVarName(boundConnection.provider), blocked: 'connection-overridden' };
  }
  const explicitConnection = !providerBinding && input.runtimeConfig.providerConnections.find(
    (connection) =>
      connection.id === input.runtimeConfig.activeProviderConnectionId &&
      (input.cliProvider === undefined || connection.provider === input.cliProvider),
  ) || null;
  const provider = input.cliProvider ?? explicitConnection?.provider ?? providerFromConfig;
  const poolDeclared = Boolean(input.runtimeConfig.accountPool?.[provider]);
  if (providerBinding && poolDeclared) return { provider, expectedEnvVarName: getProviderApiKeyEnvVarName(provider), blocked: 'pool-required' };
  const pooled = explicitConnection || input.cliApiKey?.trim() ? undefined
    : poolDeclared && !input.runtimeConfig.configValidation.valid ? { blocked: 'pool-unavailable' as const }
    : selectPooledConnection({ config: input.runtimeConfig, provider, env,
      ...(input.pool?.sessionId ? { sessionId: input.pool.sessionId } : {}) });
  const activeConnection = explicitConnection ?? pooled?.connection
    ?? (pooled || providerBinding ? null : pickFallbackConnection(input.runtimeConfig.providerConnections, provider)) ?? null;
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

  const thinkingEffort = preferredEffort(activeConnectionProfile, configProfile);
  const preference = { ...(thinkingEffort !== undefined ? { thinkingEffort } : {}),
    selection: { ...(input.cliProvider !== undefined ? { provider: input.cliProvider } : {}),
      ...(providerBinding ? { credentialScope: 'provider' as const } : {}),
      ...(boundConnection ? { connectionId: boundConnection.id } : {}),
      ...(input.cliBaseUrl !== undefined ? { baseUrl: input.cliBaseUrl } : {}) } };

  // A declared pool is the whole authorization for this provider. Neither an
  // empty pool nor an unusable member falls back to env or profile keys.
  if (pooled?.blocked) return { ...preference, provider, expectedEnvVarName, blocked: pooled.blocked };

  if (activeConnectionProfile?.status === 'pending') {
    return { ...preference, provider, expectedEnvVarName, baseUrl, model, blocked: 'connection-pending' };
  }

  // A pool member's credential is the connection's own. An environment key or a
  // profile key would name a different account, which is exactly what the pool
  // was declared to exclude.
  if (pooled?.connection || boundConnection) {
    if (connectionAccountAuth && activeConnectionProfile?.authType === 'account-auth') {
      return { ...preference, provider, expectedEnvVarName, baseUrl, model,
        credential: { provider, authMode: 'account-auth', accountAuth: connectionAccountAuth, baseUrl, model,
          source: 'connection', connectionId: activeConnectionProfile.id, envVarName: expectedEnvVarName } };
    }
    const pooledKey = activeConnectionProfile?.apiKey?.trim();
    if (pooledKey) {
      return { ...preference, provider, expectedEnvVarName, baseUrl, model,
        credential: { provider, authMode: 'api-key', apiKey: pooledKey, baseUrl, model,
          source: 'connection', connectionId: activeConnectionProfile?.id, envVarName: expectedEnvVarName } };
    }
    if (connectionAccountAuth) {
      return { ...preference, provider, expectedEnvVarName, baseUrl, model,
        credential: { provider, authMode: 'account-auth', accountAuth: connectionAccountAuth, baseUrl, model,
          source: 'connection', connectionId: activeConnectionProfile?.id, envVarName: expectedEnvVarName } };
    }
    return { ...preference, provider, expectedEnvVarName, baseUrl, model, blocked: boundConnection ? 'connection-unavailable' : 'pool-unavailable' };
  }

  const cliApiKey = input.cliApiKey?.trim();
  if (cliApiKey) {
    return {
      ...preference,
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
      ...preference,
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
        connectionId: activeConnectionProfile?.id,
        envVarName: expectedEnvVarName,
      },
    };
  }

  const envApiKey = env[expectedEnvVarName]?.trim();
  if (envApiKey) {
    return {
      ...preference,
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
      ...preference,
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
        connectionId: activeConnectionProfile?.id,
        envVarName: expectedEnvVarName,
      },
    };
  }

  if (connectionAccountAuth) {
    return {
      ...preference,
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
        connectionId: activeConnectionProfile?.id,
        envVarName: expectedEnvVarName,
      },
    };
  }

  const configApiKey = configProfile?.apiKey?.trim();

  if (configAccountAuth) {
    const normalizedAccountAuthModel = normalizeAccountAuthModel(provider, model);
    return {
      ...preference,
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
      ...preference,
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

  return { ...preference, provider, expectedEnvVarName, baseUrl, model };
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

/** One place decides how a refused resolution is described to a person. */
export function credentialBlockMessage(blocked: NonNullable<ProviderCredentialResolution['blocked']>): string {
  if (blocked === 'connection-overridden') return 'Request overrides differ from the session-selected credential binding. Restart without the conflicting provider, endpoint or API key override.';
  if (blocked === 'pool-required') return 'Provider credentials cannot replace a declared account pool. Select an available pool connection or explicitly remove the pool.';
  if (blocked === 'connection-unavailable') return 'The session-selected connection is unavailable. Open /model and select an available connection before sending.';
  if (blocked === 'pool-empty') return 'The account pool for this provider is empty; add a member connection or remove the pool before requests can be sent.';
  if (blocked === 'pool-unavailable') return 'No connection in the account pool has a usable credential; sign in to a pool member before requests can be sent.';
  return 'The selected connection requires independent login before requests can be sent.';
}
