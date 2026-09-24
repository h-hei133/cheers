import type {
  GoogleAccountAuthConfig,
  OpenAIAccountAuthConfig,
  RuntimeProvider,
} from "../../config/runtimeConfig.js";
import { isExpiring, refreshOAuthTokens, type OAuthProviderConfig } from "../../core/auth/oauth/flow.js";
import { googleOAuthConfig, openAIOAuthConfig, resolveGoogleClientId } from "../../core/auth/oauth/providers.js";

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
  /** Which kind of credential produced this, so a failure can name the right fix. */
  readonly mode: "api-key" | "account-auth";
}

/** Headers every request carries, before authorization. */
const BASE_HEADERS: Readonly<Record<string, string>> = {
  "Content-Type": "application/json",
};

/** The account credential a provider uses, if it has one. */
export function accountAuthFor(
  provider: RuntimeProvider,
  credential: {
    readonly accountAuth?: OpenAIAccountAuthConfig | GoogleAccountAuthConfig;
  },
): OpenAIAccountAuthConfig | GoogleAccountAuthConfig | undefined {
  const account = credential.accountAuth;
  if (!account) return undefined;
  // The stored credential and the provider have to agree, or a Google token could
  // be sent to OpenAI. The stored `type` is what identifies which flow issued it.
  if (provider === "openai" && account.type === "openai-chatgpt-account") return account;
  if (provider === "google" && account.type === "google-gemini-account") return account;
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
  readonly accountAuth?: OpenAIAccountAuthConfig | GoogleAccountAuthConfig;
}): ProviderAuthorization {
  const account = input.accountAuth;
  if (account) {
    const headers: Record<string, string> = {
      ...BASE_HEADERS,
      Authorization: `Bearer ${account.accessToken}`,
    };
    // The account-scoped endpoint rejects a token whose account is not named.
    if (account.type === "openai-chatgpt-account" && account.accountId) {
      headers["chatgpt-account-id"] = account.accountId;
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
  account: OpenAIAccountAuthConfig | GoogleAccountAuthConfig,
) {
  if (provider === "openai") return openAIOAuthConfig();
  if (provider === "google") {
    const clientId = "clientId" in account ? account.clientId : "";
    return googleOAuthConfig(resolveGoogleClientId(clientId || undefined));
  }
  return undefined;
}

/**
 * The outcome of renewing an account credential.
 *
 * `renewed` is true only for the call that performed the exchange, which is the one
 * that writes it back. A failure is reported rather than swallowed: falling
 * through with a token the provider has already refused sends a request that
 * cannot succeed, and whatever the provider says about it reads as a network
 * problem. Naming the login is the only version the user can act on.
 */
export interface AccountAuthRenewal {
  /** The credential to use from here on. */
  readonly accountAuth?: OpenAIAccountAuthConfig | GoogleAccountAuthConfig;
  /** True only for the call that ran the exchange. */
  readonly renewed: boolean;
  /** Why the exchange failed, when it did. */
  readonly failure?: string;
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
    readonly accountAuth?: OpenAIAccountAuthConfig | GoogleAccountAuthConfig;
  };
  readonly fetchImpl: typeof fetch;
  readonly signal?: AbortSignal;
}): Promise<AccountAuthRenewal> {
  const account = accountAuthFor(input.provider, input.credential);
  if (!account) return { renewed: false };
  if (!isExpiring(account.expiresAt)) return { accountAuth: account, renewed: false };

  const config = oauthConfigFor(input.provider, account);
  const refreshToken = account.refreshToken?.trim();
  if (!config || !refreshToken) {
    return {
      accountAuth: account,
      renewed: false,
      failure: `The ${providerLabel(input.provider)} login is expired and has no refresh token. Re-run /connect login ${input.provider} --account.`,
    };
  }

  const inFlight = renewalsInFlight.get(renewalKey(input.provider, refreshToken));
  if (inFlight) {
    // The token this call read is already being replaced by the exchange it is
    // waiting on, so the answer is that exchange's, not a second one's.
    const shared = await inFlight;
    return { accountAuth: shared.accountAuth, renewed: false, ...(shared.failure ? { failure: shared.failure } : {}) };
  }

  const run = exchangeAccountAuth({
    provider: input.provider,
    account,
    config,
    refreshToken,
    fetchImpl: input.fetchImpl,
    ...(input.signal ? { signal: input.signal } : {}),
  });
  const key = renewalKey(input.provider, refreshToken);
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
function renewalKey(provider: RuntimeProvider, refreshToken: string): string {
  return `${provider}\u0000${refreshToken}`;
}

/** The renewals in flight, one per credential, so a spent token is exchanged once. */
const renewalsInFlight = new Map<string, Promise<AccountAuthRenewal>>();

/** The label a user knows a provider by, for a message they have to act on. */
function providerLabel(provider: RuntimeProvider): string {
  return provider === "openai" ? "OpenAI account" : "Google account";
}

async function exchangeAccountAuth(input: {
  readonly provider: RuntimeProvider;
  readonly account: OpenAIAccountAuthConfig | GoogleAccountAuthConfig;
  readonly config: OAuthProviderConfig;
  readonly refreshToken: string;
  readonly fetchImpl: typeof fetch;
  readonly signal?: AbortSignal;
}): Promise<AccountAuthRenewal> {
  try {
    const tokens = await refreshOAuthTokens(input.config, input.refreshToken, input.fetchImpl);
    return {
      accountAuth: {
        ...input.account,
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken,
        expiresAt: tokens.expiresAt,
      },
      renewed: true,
    };
  } catch (error) {
    return {
      accountAuth: input.account,
      renewed: false,
      failure: `The ${providerLabel(input.provider)} login could not be renewed: ${
        error instanceof Error ? error.message : String(error)
      }. Re-run /connect login ${input.provider} --account, then retry.`,
    };
  }
}
