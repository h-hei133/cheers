import { assertGoogleAccount, assertGoogleScopes } from '../../core/auth/account/google.js';
import type { AccountAuthConfig, RuntimeProvider } from "../../config/runtimeConfig.js";
import { isExpiring, refreshOAuthTokens, type OAuthProviderConfig, type OAuthTokens } from "../../core/auth/oauth/flow.js";
import { googleOAuthConfig, openAIOAuthConfig, resolveGoogleClientId } from "../../core/auth/oauth/providers.js";
import { DEFAULT_ENDPOINT_KIND, endpointShape, type EndpointKind } from "../endpoints/index.js";
import { accountGeneration, credentialDigest, refreshLineage } from '../../core/auth/account/lineage.js';
import { assertCopilotAccount, copilotEndpoint } from '../../core/auth/oauth/copilot/policy.js';
import { refreshCopilotToken } from '../../core/auth/oauth/copilot/flow.js';

/**
 * How one provider request authenticates.
 *
 * A request needs an `Authorization` header, and there is more than one way to earn
 * one. Keeping the decision in one place is the point: the header used to be built
 * inline from an API key at each call site, so a credential carrying a token instead
 * of a key had nowhere to land — the request went out with an empty bearer and
 * nothing said anything was missing.
 *
 * `headers` is the general form rather than a field per provider. An account login
 * can require more than the bearer token, and a shape that names only the token
 * cannot express that without growing another field each time.
 */
export interface ProviderAuthorization {
  /** The header set for the request, `Authorization` included. */
  readonly headers: Readonly<Record<string, string>>;
  /**
   * Which kind of credential produced this, so a failure can name the right fix.
   *
   * `signed` is the case where the credential is not a header at all: the
   * transport computes it per request, and what is here is only the headers that
   * travel with every request regardless.
   */
  readonly mode: "api-key" | "account-auth" | "signed";
}

/** Headers every request carries, before authorization. */
const BASE_HEADERS: Readonly<Record<string, string>> = {
  "Content-Type": "application/json",
};

function mergeHeaders(...sources: readonly Readonly<Record<string, string>>[]): Record<string, string> {
  const merged: Record<string, string> = {};
  const names = new Map<string, string>();
  for (const source of sources) {
    for (const [name, value] of Object.entries(source)) {
      const normalized = name.toLowerCase();
      const previous = names.get(normalized);
      if (previous !== undefined) delete merged[previous];
      names.set(normalized, name);
      merged[name] = value;
    }
  }
  return merged;
}

/** The account credential a provider uses, if it has one. */
export function accountAuthFor(
  provider: RuntimeProvider,
  credential: {
    readonly accountAuth?: AccountAuthConfig;
  },
): AccountAuthConfig | undefined {
  const account = credential.accountAuth;
  if (!account) return undefined;
  // The stored credential and the provider have to agree, or a Google token could
  // be sent to OpenAI. The stored `type` is what identifies which flow issued it.
  if (provider === "openai" && account.type === "openai-chatgpt-account") return account;
  if (provider === "google" && account.type === "google-gemini-account") return account;
  // A subscription credential belongs to the account it was issued to, and the
  // two subscription providers are told apart by the token rather than by a
  // client id. Accepting it for any other provider would send one service's
  // token to another.
  if (account.type === "subscription" && provider === 'github-copilot' && account.provider === provider) {
    return account;
  }
  return undefined;
}

/**
 * The headers for a request, from a resolved credential.
 *
 * An API key is sent as a bearer token, which is the shape every OpenAI-compatible
 * endpoint expects. An account credential sends its access token the same way and
 * adds whatever else the account requires.
 *
 * Throws when neither is present rather than returning headers with an empty bearer:
 * a request that cannot be authenticated should fail where the cause is known, not
 * arrive at the provider as an anonymous one.
 */
export function providerAuthorization(input: {
  readonly apiKey?: string;
  readonly accountAuth?: AccountAuthConfig;
  /**
   * The endpoint this request goes to, when it is not the default one.
   *
   * A credential is not a header: the same key travels as `Authorization` to one
   * endpoint and as `x-api-key` to another, and the second also requires a
   * version header. Formatting the header from the key alone is what made an
   * endpoint that wants neither form arrive unauthenticated.
   */
  readonly endpoint?: EndpointKind;
}): ProviderAuthorization {
  if (input.accountAuth?.type === 'subscription') {
    assertCopilotAccount(input.accountAuth);
    if (input.endpoint !== undefined && input.endpoint !== 'openai-compatible'
      && input.endpoint !== 'anthropic-messages' && input.endpoint !== copilotEndpoint(input.endpoint)) {
      throw new Error('Copilot account requires its native protocol declaration.');
    }
  }
  if (input.accountAuth?.type === 'google-gemini-account') {
    assertGoogleAccount(input.accountAuth);
    if (input.endpoint !== 'google-account-generative-ai') throw new Error('Google account protocol conflicts with the native API login.');
  }
  // An endpoint whose credential headers are not the default bearer takes the
  // key directly: there is no account flow for it, and sending `Authorization`
  // anyway is a request the host rejects for a reason that looks like a bad key.
  // Which headers those are is the endpoint's own business, which is why this
  // asks the shape for them rather than composing one here. The comparison is
  // against the declared default rather than a spelled-out name, so the two
  // cannot disagree about which kind that is.
  if (!input.accountAuth && input.endpoint !== undefined && input.endpoint !== DEFAULT_ENDPOINT_KIND) {
    const shape = endpointShape(input.endpoint);
    // An endpoint whose credential is computed per request declares a signer and
    // needs no key here. Refusing it for the absence of one would make a
    // correctly configured account look uncredentialed.
    if (shape.signer && !input.apiKey?.trim()) {
      // The key is left out rather than passed as empty text: a shape that
      // composes `Authorization: Bearer <key>` would otherwise send a header
      // naming an empty credential, which a host rejects as a bad one.
      return { headers: shape.headers(), mode: "signed" };
    }
    if (input.apiKey?.trim()) {
      return { headers: shape.headers(input.apiKey.trim()), mode: "api-key" };
    }
  }

  const account = input.accountAuth;
  if (account) {
    const headers = mergeHeaders(BASE_HEADERS,
      input.endpoint ? endpointShape(input.endpoint).headers() : {},
      { Authorization: `Bearer ${account.accessToken}` });
    if (account.type === 'google-gemini-account') headers['x-goog-user-project'] = account.quotaProject!;
    // The account-scoped endpoint rejects a token whose account is not named.
    if (account.type === "openai-chatgpt-account" && account.accountId) {
      headers["chatgpt-account-id"] = account.accountId;
    }
    if (account.type === 'openai-chatgpt-account' && input.endpoint === 'openai-account-responses' && !account.accountId?.trim()) {
      throw new Error('The account login has no account identity. Reconnect before sending a request.');
    }
    return { headers, mode: "account-auth" };
  }

  const apiKey = input.apiKey?.trim();
  if (!apiKey) {
    throw new Error(
      "The request has no credential: set an API key, or sign in with an account.",
    );
  }
  return { headers: { ...BASE_HEADERS, Authorization: `Bearer ${apiKey}` }, mode: "api-key" };
}

/** The OAuth client configuration for a provider, or nothing when it has none. */
function oauthConfigFor(
  provider: RuntimeProvider,
  account: AccountAuthConfig,
) {
  if (provider === "openai") return openAIOAuthConfig();
  if (provider === "google") {
    const clientId = "clientId" in account ? account.clientId : "";
    const config = googleOAuthConfig(resolveGoogleClientId(clientId || undefined), 'clientSecret' in account ? account.clientSecret : undefined);
    return { ...config, scope: 'scopes' in account && account.scopes ? account.scopes.join(' ') : config.scope };
  }
  return undefined;
}

/**
 * The outcome of renewing an account credential.
 *
 * `renewed` identifies the call that performed the exchange. Every caller must
 * independently confirm storage before using a returned rotation. A failure is
 * reported rather than swallowed: falling
 * through with a token the provider has already refused sends a request that
 * cannot succeed, and whatever the provider says about it reads as a network
 * problem. Naming the login is the only version the user can act on.
 */
export interface AccountAuthRenewal {
  /** The credential to use from here on. */
  readonly accountAuth?: AccountAuthConfig;
  /** True only for the call that ran the exchange. */
  readonly renewed: boolean;
  /** Why the exchange failed, when it did. */
  readonly failure?: string;
  /** Another process owns the exchange; nothing was sent here. */
  readonly leaseHeld?: boolean;
  /** A previous owner may have spent this token; do not replay it. */
  readonly leaseUnknown?: boolean;
  /** Opaque native-response capability; no token or response body is serialized here. */
  readonly production?: object;
}

/** Cross-process ownership hooks; the caller owns their storage. */
export interface RenewalLeaseHooks {
  acquire: () => { readonly acquired: boolean; readonly unknown?: boolean };
  /** Exact captured store, owner, grant and attempt; foreign slots cannot join. */
  readonly shareKey?: string;
}

/**
 * Renew an account token that is about to expire.
 *
 * Returns the credential to use from here on: the renewed one when the exchange
 * succeeded, the original otherwise. Refresh is attempted on the request path
 * because that is where expiry is discovered — the alternative is a token that
 * lapses mid-session and surfaces as a provider refusing a request that worked a
 * minute ago.
 *
 * The renewal is written back by the caller, so the next request does not repeat it
 * — and so a restart does not begin from the expired token again.
 *
 * Exchange happens once per provider even when several requests find the token
 * expiring at the same moment: the later callers wait for the one in flight. A
 * refresh token is spent by the exchange that uses it, so a second exchange started
 * in parallel would be rejected with the credential already rotated — which looks
 * to the user like a login that stopped working at random.
 */
export async function renewAccountAuthIfExpiring(input: {
  readonly provider: RuntimeProvider;
  readonly credential: {
    readonly apiKey?: string;
    readonly accountAuth?: AccountAuthConfig;
  };
  readonly fetchImpl: typeof fetch;
  readonly signal?: AbortSignal;
  /** Called immediately before the exchange leaves the process. */
  readonly onDispatch?: () => void;
  readonly renewalLease?: RenewalLeaseHooks;
}): Promise<AccountAuthRenewal> {
  const account = accountAuthFor(input.provider, input.credential);
  if (!account && input.credential.accountAuth?.type === 'subscription') {
    return { renewed: false, failure: 'Subscription provider is unsupported or unverified. Configure an API key or reconnect.' };
  }
  if (!account) return { renewed: false };
  if (account.type === 'subscription') {
    try { assertCopilotAccount(account); }
    catch { return { renewed: false, failure: 'Subscription issuer or service address is unverified. Reconnect before renewal.' }; }
  }
  if (account.type === 'google-gemini-account') {
    try { assertGoogleAccount(account); }
    catch { return { renewed: false, failure: 'Google account scope or billing project is unverified. Reconnect before renewal.' }; }
  }
  if (!isExpiring(account.expiresAt)) return { accountAuth: account, renewed: false };

  const config = oauthConfigFor(input.provider, account);
  const refreshToken = account.refreshToken?.trim();
  if ((!config && account.type !== 'subscription') || !refreshToken) {
    return {
      accountAuth: account,
      renewed: false,
      failure: `The ${providerLabel(input.provider)} login is expired and has no refresh token. Re-run /connect login ${input.provider} --account.`,
    };
  }

  const key = renewalKey(input.provider, account, input.renewalLease?.shareKey);
  const inFlight = renewalsInFlight.get(key);
  if (inFlight) {
    // The token this call read is already being replaced by the exchange it is
    // waiting on, so the answer is that exchange's, not a second one's.
    const shared = await inFlight;
    return { accountAuth: shared.accountAuth, renewed: false, ...(shared.production ? { production: shared.production } : {}),
      ...(shared.failure ? { failure: shared.failure } : {}) };
  }

  const lease = input.renewalLease?.acquire();
  if (lease && !lease.acquired) {
    return { renewed: false, ...(lease.unknown ? { leaseUnknown: true } : { leaseHeld: true }) };
  }
  const run = exchangeAccountAuth({
    provider: input.provider,
    account,
    config,
    refreshToken,
    fetchImpl: input.fetchImpl,
    ...(input.signal ? { signal: input.signal } : {}),
    ...(input.onDispatch ? { onDispatch: input.onDispatch } : {}),
    scope: input.renewalLease?.shareKey ?? '',
  });
  renewalsInFlight.set(key, run);
  try {
    return await run;
  } finally {
    renewalsInFlight.delete(key);
  }
}

/**
 * Which exchange a caller can share.
 *
 * Keyed by the refresh token, not by the provider: the token is the thing the
 * exchange spends, so two callers may share an exchange only when they are
 * spending the same one. Keying by provider alone made a second account's
 * request join the first account's exchange and receive its token — the wrong
 * identity, silently, which is worse than the extra exchange it saved.
 */
function renewalKey(provider: RuntimeProvider, account: AccountAuthConfig, scope?: string): string {
  return credentialDigest([provider, accountGeneration(account), scope ?? 'unbound']);
}

/** The renewals in flight, one per credential, so a spent token is exchanged once. */
const renewalsInFlight = new Map<string, Promise<AccountAuthRenewal>>();
const productions = new WeakMap<object, { readonly scope: string; readonly generation: string; readonly lineage: string }>();

/** Only a native exchange for this exact captured attempt can supply successor material. */
export function nativeAccountProduction(result: AccountAuthRenewal, scope: string): { readonly generation: string; readonly lineage: string } | undefined {
  const proof = result.production && productions.get(result.production);
  return proof && proof.scope === scope && result.accountAuth && proof.generation === accountGeneration(result.accountAuth)
    ? { generation: proof.generation, lineage: proof.lineage } : undefined;
}

/** The label a user knows a provider by, for a message they have to act on. */
function providerLabel(provider: RuntimeProvider): string {
  return provider === 'openai' ? 'OpenAI account' : provider === 'github-copilot' ? 'GitHub Copilot account' : 'Google account';
}

async function exchangeAccountAuth(input: {
  readonly provider: RuntimeProvider;
  readonly account: AccountAuthConfig;
  readonly config?: OAuthProviderConfig;
  readonly refreshToken: string;
  readonly fetchImpl: typeof fetch;
  readonly signal?: AbortSignal;
  /** Called immediately before the exchange leaves the process. */
  readonly onDispatch?: () => void;
  readonly scope: string;
}): Promise<AccountAuthRenewal> {
  try {
    const fetchImpl: typeof fetch = (url, init) => {
      input.onDispatch?.();
      return input.fetchImpl(url, init);
    };
    const tokens: OAuthTokens & { readonly baseUrl?: string } = input.account.type === 'subscription'
      ? await refreshCopilotToken({ refreshToken: input.refreshToken, fetchImpl, ...(input.signal ? { signal: input.signal } : {}) })
      : await refreshOAuthTokens(input.config!, input.refreshToken, fetchImpl);
    if (input.account.type === 'subscription' && (!('baseUrl' in tokens) || tokens.baseUrl !== input.account.baseUrl)) {
      throw new Error('Renewal changed the captured Copilot service address.');
    }
    if (input.account.type === 'google-gemini-account') {
      assertGoogleScopes(tokens.scopes);
      if (JSON.stringify([...new Set(tokens.scopes ?? [])].sort()) !== JSON.stringify([...new Set(input.account.scopes ?? [])].sort())) {
        throw new Error('Renewal changed the captured Google account grant.');
      }
    }
    if (input.account.type === 'openai-chatgpt-account' && (!tokens.accountId || tokens.accountId !== input.account.accountId)) {
      throw new Error('Renewal returned a different account identity.');
    }
    const accountAuth: AccountAuthConfig = {
        ...input.account,
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken,
        expiresAt: tokens.expiresAt,
      };
    const production = Object.freeze({});
    productions.set(production, { scope: input.scope, generation: accountGeneration(accountAuth),
      lineage: refreshLineage({ provider: input.provider, refreshToken: accountAuth.refreshToken, clientId: input.config?.clientId }) });
    return { accountAuth, renewed: true, production };
  } catch (error) {
    return {
      accountAuth: input.account,
      renewed: false,
      failure: `The ${providerLabel(input.provider)} login could not be renewed: ${
        'The native account exchange did not complete'
      }. Re-run /connect login ${input.provider} --account, then retry.`,
    };
  }
}
