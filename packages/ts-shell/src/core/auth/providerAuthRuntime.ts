import { ConfigWriteError } from '../../config/outcome.js';
import { AccountAuthConfig, type GoogleAccountAuthConfig, type OpenAIAccountAuthConfig, type ProviderConnectionConfig, readRuntimeConfigEditAt, getUserRuntimeConfigPath, type RuntimeConfigFile, type RuntimeProvider, writeUserRuntimeConfigFile } from "../../config/runtimeConfig.js";
import { providerFacts } from "../providers/facts.js";
import { openAIProviderAuthContract } from "../commands/openaiAccountAuth.js";
import { googleProviderAuthContract } from "../commands/googleAccountAuth.js";
import {
  type ProviderAccountAuthResult,
  toGoogleAccountAuthConfig,
  toOpenAIAccountAuthConfig,
  toSubscriptionAccountAuthConfig,
  type ProviderAccountAuthConnectionSummary,
  type ProviderAuthContract,
} from "./providerAuthContract.js";
import {
  anthropicSubscriptionProviderAuthContract,
  gitHubCopilotProviderAuthContract,
} from "../commands/subscriptionAccountAuth.js";

const CONTRACTS: readonly ProviderAuthContract[] = [
  openAIProviderAuthContract,
  googleProviderAuthContract,
  // A subscription is not an API key, and neither of these can be reached with
  // one: the credential is issued to the account by a sign-in, so without a
  // contract here the flow exists and nothing can start it.
  gitHubCopilotProviderAuthContract,
  anthropicSubscriptionProviderAuthContract,
];
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
    if (error instanceof ConfigWriteError) throw error;
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

/**
 * The contract for a provider, if this build can sign it in.
 *
 * Exported because it is the question "can this provider be signed into", and
 * the answer decides whether a surface offers the sign-in at all. A surface that
 * could not ask would offer one and then fail at the end of it.
 */
export function resolveProviderAuthContract(
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
  readonly accountAuth: AccountAuthConfig;
  readonly authorizeUrl: string;
  readonly callbackUrl: string;
}): ProviderAccountAuthConnectionSummary {
  const edit = readRuntimeConfigEditAt(getUserRuntimeConfigPath());
  const latest = edit.values;
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
  const configPath = writeUserRuntimeConfigFile(next, edit);
  return {
    connectionId: input.connectionId,
    provider: input.provider,
    configPath,
    authorizeUrl: input.authorizeUrl,
    callbackUrl: input.callbackUrl,
  };
}

/**
 * Store a renewed account token so the next request does not refresh again.
 *
 * A refresh happens because the token on disk had expired. Without writing the
 * replacement back, every request in the session repeats the exchange, and a
 * restart begins from the expired token as though nothing had happened.
 *
 * Both places the credential lives are updated: the active connection, which is
 * where the request path reads it, and the provider credentials block, which is
 * the fallback when no connection is active. Missing one would leave the token
 * renewed in one lookup and stale in the other.
 *
 * Returns false when there is nothing to update — a credential that came from an
 * API key or the environment has no stored token to renew.
 */
export function persistRenewedAccountAuth(input: {
  readonly provider: RuntimeProvider;
  readonly accountAuth: AccountAuthConfig;
}): boolean {
  const edit = readRuntimeConfigEditAt(getUserRuntimeConfigPath());
  const latest = edit.values;
  const accountAuth = toProviderAccountAuthConfig(input.provider, input.accountAuth);
  const updatedAt = new Date().toISOString();
  let changed = false;

  const nextConnections = normalizeConnections(latest).map((connection) => {
    if (connection.provider !== input.provider || connection.authType !== "account-auth") {
      return connection;
    }
    changed = true;
    return { ...connection, accountAuth, updatedAt };
  });

  const existingCredentials = latest.providerCredentials?.[input.provider];
  const nextCredentials =
    existingCredentials?.accountAuth !== undefined
      ? (() => {
          changed = true;
          return { ...existingCredentials, accountAuth };
        })()
      : existingCredentials;

  if (!changed) return false;

  writeUserRuntimeConfigFile({
    ...latest,
    providerConnections: nextConnections,
    providerCredentials: {
      ...(latest.providerCredentials ?? {}),
      ...(nextCredentials ? { [input.provider]: nextCredentials } : {}),
    },
  }, edit);
  return true;
}

function persistConnectionPatch(input: {
  readonly patchKind: "insert-pending" | "mark-error";
  readonly connectionId: string;
  readonly pendingConnection?: ProviderConnectionConfig;
}): string {
  const edit = readRuntimeConfigEditAt(getUserRuntimeConfigPath());
  const latest = edit.values;
  if (input.patchKind === "insert-pending" && input.pendingConnection) {
    return writeUserRuntimeConfigFile({
      ...latest,
      providerConnections: [
        input.pendingConnection,
        ...normalizeConnections(latest),
      ],
    }, edit);
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
  }, edit);
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

/**
 * Which model an account connection ends up using.
 *
 * Two shapes, and which one applies is a fact about the provider: one service
 * publishes a fixed set of models its account can reach, so anything outside it
 * cannot be used and the default is the only safe answer; another accepts the
 * default or whatever the user named.
 *
 * Both halves come from the provider's declaration, so the default model is the
 * same one the model command falls back to.
 */
function resolveAccountAuthModel(
  provider: RuntimeProvider,
  candidate?: string,
): string | undefined {
  const normalized = normalizeText(candidate);
  const facts = providerFacts(provider);
  if (!facts.accountAuthAllowedModels) {
    return normalized ?? facts.accountAuthDefaultModel;
  }
  if (normalized && facts.accountAuthAllowedModels.includes(normalized)) {
    return normalized;
  }
  return facts.accountAuthDefaultModel;
}

function withoutApiKey<T extends { readonly apiKey?: string }>(value: T): Omit<T, "apiKey"> {
  const { apiKey: _apiKey, ...rest } = value;
  return rest;
}

function resolveAccountAuthConfig(
  provider: RuntimeProvider,
  result: ProviderAccountAuthResult,
): AccountAuthConfig | undefined {
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
  // A subscription sign-in issues the same three fields through a different
  // route, and the stored shape records that it did — the two have to agree at
  // read time, which is what the stored `type` is for.
  if (provider === "github-copilot" || provider === "anthropic") {
    return toSubscriptionAccountAuthConfig({
      accessToken: result.accessToken,
      refreshToken: result.refreshToken,
      expiresAt: result.expiresAt,
      ...(result.callbackUrl ? { baseUrl: result.callbackUrl } : {}),
    });
  }
  return undefined;
}

/**
 * File a credential under the provider it belongs to and the shape it is.
 *
 * Both answers come from the declaration, so a provider's slot and the
 * discriminator its credential carries cannot drift apart here. Writing a
 * credential into the wrong slot would hand it to a different service on the next
 * request, and the check that they agree is what the two are declared together
 * for.
 */
function toProviderAccountAuthConfig(
  provider: RuntimeProvider,
  config: AccountAuthConfig,
): NonNullable<ProviderConnectionConfig["accountAuth"]> {
  const facts = providerFacts(provider);
  if (!facts.accountAuthKey || config.type !== facts.accountAuthType) return {};
  return { [facts.accountAuthKey]: config } as NonNullable<ProviderConnectionConfig["accountAuth"]>;
}
