import { ConfigWriteError } from '../../config/outcome.js';
import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { persistConfigEdit } from '../../config/persistence.js';
import { sameValue } from '../../config/values.js';
import { CONFIG_FIELDS, getRuntimeConfig } from '../../config/runtimeConfig.js';
import { resolveProviderCredential } from '../shell/providerCredentials.js';
import { accountBinding, captureAccountEdit } from './account/state.js';
import { grantRefreshLogin, reserveRefreshLogin, refreshLeasesPath, captureLeaseStore, type RefreshStore } from './account/lease.js';
import { accountGeneration, credentialDigest } from './account/lineage.js';
import { nativeOAuthLogin, OAuthExchangeError } from './oauth/flow.js';
import { nativeCopilotLogin } from './oauth/copilot/flow.js';
import { assertCopilotAccount } from './oauth/copilot/policy.js';
import { oauthConfigFor } from './oauth/providers.js';
import { accountProtocol } from './account/policy.js';
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
  gitHubCopilotProviderAuthContract,
} from "../commands/subscriptionAccountAuth.js";

const CONTRACTS: readonly ProviderAuthContract[] = [
  openAIProviderAuthContract,
  googleProviderAuthContract,
  // A subscription is not an API key, and neither of these can be reached with
  // one: the credential is issued to the account by a sign-in, so without a
  // contract here the flow exists and nothing can start it.
  gitHubCopilotProviderAuthContract,
];
let testOpenAILoginOverride:
  | ((...args: Parameters<ProviderAuthContract["loginAccountAuth"]>) => ReturnType<ProviderAuthContract["loginAccountAuth"]>)
  | undefined;

interface PendingLogin {
  readonly source: string;
  readonly target: string;
  readonly leaseStore: RefreshStore;
  readonly connection: ProviderConnectionConfig;
  readonly mirror: RuntimeConfigFile['providerCredentials'];
  readonly workspaceRoot: string;
}

function capturePendingLogin(source: string, connection: ProviderConnectionConfig, workspaceRoot: string): PendingLogin {
  const target = fs.realpathSync(source), current = readRuntimeConfigEditAt(target).values;
  const matches = current.providerConnections?.filter(item => item.id.trim() === connection.id) ?? [];
  if (matches.length !== 1 || !sameValue(matches[0], connection)) throw new ConfigWriteError('conflict', 'unchanged');
  return { source: path.resolve(source), target, leaseStore: captureLeaseStore(refreshLeasesPath()), connection: structuredClone(connection),
    mirror: structuredClone(current.providerCredentials), workspaceRoot };
}

function pendingMatches(pending: PendingLogin, current: Readonly<RuntimeConfigFile>): boolean {
  const matches = current.providerConnections?.filter(item => item.id.trim() === pending.connection.id) ?? [];
  return path.resolve(getUserRuntimeConfigPath()) === pending.source && fs.realpathSync(pending.source) === pending.target
    && matches.length === 1 && sameValue(matches[0], pending.connection)
    && sameValue(current.providerCredentials?.[pending.connection.provider], pending.mirror?.[pending.connection.provider]);
}

export async function runProviderAccountAuthLogin(input: {
  readonly provider: RuntimeProvider;
  readonly providerLabel: string;
  readonly defaultModel?: string;
  readonly labelOverride?: string;
  readonly onPersisted?: () => void;
  readonly workspaceRoot?: string;
  readonly signal?: AbortSignal;
  readonly onProgress?: (progress: import('./providerAuthContract.js').SignInProgress) => void;
  readonly activate?: boolean;
}): Promise<string> {
  input.signal?.throwIfAborted();
  const contract = resolveProviderAuthContract(input.provider);
  if (!contract) {
    if (input.provider === 'anthropic') return 'Anthropic subscription login is unsupported. Configure an API key with /connect login anthropic --api-key <key>.';
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
    ...(input.activate === false ? { autoSelect: false } : {}),
    label:
      normalizeText(input.labelOverride) ?? `${input.providerLabel} account auth`,
    ...(resolveAccountAuthModel(input.provider, input.defaultModel)
      ? { model: resolveAccountAuthModel(input.provider, input.defaultModel) }
      : {}),
    status: "pending",
    createdAt: now,
    updatedAt: now,
  };
  const pendingPath = persistConnectionPatch({
    patchKind: "insert-pending",
    connectionId,
    pendingConnection,
  });
  const pending = capturePendingLogin(pendingPath, pendingConnection, input.workspaceRoot ?? process.cwd());
  input.onPersisted?.();

  try {
    const authResult = await contract.loginAccountAuth({ signal: input.signal, onProgress: input.onProgress });
    input.signal?.throwIfAborted();
    const accountAuth = resolveAccountAuthConfig(input.provider, authResult);
    if (!accountAuth) {
      throw new Error(
        `Provider ${input.provider} returned unsupported account-auth payload.`,
      );
    }
    if (accountAuth.expiresAt <= Date.now()) {
      throw new OAuthExchangeError('expiry', input.providerLabel, 'token exchange');
    }
    const summary = persistConnectedAccountAuth({
      provider: input.provider,
      connectionId,
      accountAuth,
      authorizeUrl: authResult.authorizeUrl,
      callbackUrl: authResult.callbackUrl,
      pending,
      nativeResult: authResult,
      activate: input.activate,
    });
    input.onPersisted?.();

    return [
      `${input.providerLabel} account-auth connected via ${input.provider === 'github-copilot' ? 'device code' : 'browser'} login.`,
      `Connection ID: ${summary.connectionId}`,
      "State transition: pending -> connected",
      "Connection type: account-auth",
      `Authorize URL: ${summary.authorizeUrl}`,
      `Callback URL: ${summary.callbackUrl}`,
      input.activate === false ? 'Connection saved. Select a model to enable it.' : `Default runtime provider switched to ${summary.provider}.`,
      `Stored at: ${summary.configPath}`,
      summary.refreshWarning,
    ].filter(Boolean).join("\n");
  } catch (error) {
    if (error instanceof ConfigWriteError) throw error;
    const configPath = persistConnectionPatch({
      patchKind: "mark-error",
      connectionId,
      pending,
    });
    input.onPersisted?.();
    return [
      `${input.providerLabel} account-auth login failed.`,
      `Connection ID: ${connectionId}`,
      "State transition: pending -> error",
      `Reason: ${error instanceof OAuthExchangeError ? error.message : 'The authorization flow did not complete. Retry the login.'}`,
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
    options?: Parameters<ProviderAuthContract['loginAccountAuth']>[0],
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
  readonly pending: PendingLogin;
  readonly nativeResult: ProviderAccountAuthResult;
  readonly activate?: boolean;
}): ProviderAccountAuthConnectionSummary & { readonly refreshWarning?: string } {
  const edit = readRuntimeConfigEditAt(input.pending.target);
  const latest = edit.values;
  if (!pendingMatches(input.pending, latest)) throw new ConfigWriteError('conflict', 'unchanged');
  const updatedAt = new Date().toISOString();
  const nextConnections = normalizeConnections(latest).map((connection) =>
    connection.id === input.connectionId
      ? {
          ...connection,
          authType: "account-auth" as const,
          model: resolveAccountAuthModel(input.provider, connection.model),
          accountAuth: toProviderAccountAuthConfig(input.provider, input.accountAuth),
          ...(accountProtocol(input.accountAuth) ? { baseUrl: accountProtocol(input.accountAuth)!.baseUrl } : {}),
          status: "connected" as const,
          updatedAt,
        }
      : connection,
  );

  const next: RuntimeConfigFile = {
    ...latest,
    providerConnections: nextConnections,
    ...(input.activate !== false ? {
      provider: input.provider,
      activeProviderConnectionId: input.connectionId,
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
          ...(accountProtocol(input.accountAuth) ? { baseUrl: accountProtocol(input.accountAuth)!.baseUrl } : {}),
        },
      },
    } : {}),
  };
  const oauth = input.provider === 'openai' || input.provider === 'google'
    ? oauthConfigFor(input.provider, 'clientId' in input.accountAuth ? input.accountAuth.clientId : undefined,
      'clientSecret' in input.accountAuth ? input.accountAuth.clientSecret : undefined, 'quotaProject' in input.accountAuth ? input.accountAuth.quotaProject : undefined) : undefined;
  const native = input.provider === 'github-copilot' ? nativeCopilotLogin({ ...input.nativeResult, baseUrl: input.nativeResult.baseUrl ?? '' })
    : !!oauth && nativeOAuthLogin(input.nativeResult, oauth);
  let enrollment: ReturnType<typeof reserveRefreshLogin>;
  try {
    enrollment = reserveRefreshLogin({ provider: input.provider, refreshToken: input.accountAuth.refreshToken,
      ...('clientId' in input.accountAuth ? { clientId: input.accountAuth.clientId } : {}), store: input.pending.leaseStore,
      owner: credentialDigest([input.pending.source, input.pending.target, input.provider, input.connectionId,
        input.pending.connection, input.pending.mirror?.[input.provider]]), generation: accountGeneration(input.accountAuth),
      native });
  } catch {
    // Without durable enrollment, a later compatibility baseline could grant these unverified credentials.
    throw new ConfigWriteError('write-failed', 'unchanged');
  }
  const configPath = persistConfigEdit(input.pending.target, next, edit, CONFIG_FIELDS, current => pendingMatches(input.pending, current));
  const confirmed = readRuntimeConfigEditAt(input.pending.target).values;
  const expected: RuntimeConfigFile = JSON.parse(JSON.stringify(next));
  if (path.resolve(getUserRuntimeConfigPath()) !== input.pending.source || fs.realpathSync(input.pending.source) !== input.pending.target
    || confirmed.provider !== expected.provider || confirmed.activeProviderConnectionId !== expected.activeProviderConnectionId
    || !sameValue(confirmed.providerConnections?.filter(item => item.id.trim() === input.connectionId), expected.providerConnections?.filter(item => item.id === input.connectionId))
    || !sameValue(confirmed.providerCredentials?.[input.provider], expected.providerCredentials?.[input.provider])) {
    throw new ConfigWriteError('verification-failed', 'persisted');
  }
  let refreshWarning: string | undefined;
  if (input.provider === 'openai' || input.provider === 'google' || input.provider === 'github-copilot') {
    try {
      if (!enrollment || !native) throw new Error('native login unavailable');
      const runtime = getRuntimeConfig(input.pending.workspaceRoot);
      const resolution = resolveProviderCredential({ runtimeConfig: { ...runtime, provider: input.provider,
        activeProviderConnectionId: input.connectionId, sessionConnection: { id: input.connectionId, provider: input.provider } }, env: {} });
      const captured = captureAccountEdit(input.pending.workspaceRoot, resolution);
      if (resolution.credential?.source !== 'connection' || resolution.credential.connectionId !== input.connectionId
        || !sameValue(resolution.credential.accountAuth, input.accountAuth) || (input.activate !== false && !captured.mirror)
        || !grantRefreshLogin(enrollment, accountBinding(captured))) throw new Error('grant unavailable');
    } catch {
      refreshWarning = 'Access credentials were stored. Automatic renewal remains unverified; use an independent fresh profile for a new login.';
    }
  }
  return {
    connectionId: input.connectionId,
    provider: input.provider,
    configPath,
    authorizeUrl: input.authorizeUrl,
    callbackUrl: input.callbackUrl,
    ...(refreshWarning ? { refreshWarning } : {}),
  };
}

function persistConnectionPatch(input: {
  readonly patchKind: "insert-pending" | "mark-error";
  readonly connectionId: string;
  readonly pendingConnection?: ProviderConnectionConfig;
  readonly pending?: PendingLogin;
}): string {
  const edit = readRuntimeConfigEditAt(input.pending?.target ?? getUserRuntimeConfigPath());
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
  if (input.pending) return persistConfigEdit(input.pending.target, {
    ...latest, providerConnections: nextConnections,
  }, edit, CONFIG_FIELDS, current => pendingMatches(input.pending!, current));
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
  return `${provider}-${randomUUID()}`;
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
  if (provider === 'github-copilot') {
    if (result.provider !== provider) throw new Error('Subscription provider mismatch.');
    const account = toSubscriptionAccountAuthConfig({
      provider,
      accessToken: result.accessToken,
      refreshToken: result.refreshToken,
      expiresAt: result.expiresAt,
      ...(result.baseUrl ? { baseUrl: result.baseUrl } : {}),
    });
    assertCopilotAccount(account);
    return account;
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
