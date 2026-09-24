import type {
  GoogleAccountAuthConfig,
  OpenAIAccountAuthConfig,
  RuntimeProvider,
} from "../../config/runtimeConfig.js";
import { isExpiring, refreshOAuthTokens } from "../../core/auth/oauth/flow.js";
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
 * Renew an account token that is about to expire.
 *
 * Returns the credential to use from here on: the renewed one when the exchange
 * succeeded, the original otherwise. Refresh is attempted on the request path
 * because that is where expiry is discovered — the alternative is a token that
 * lapses mid-session and surfaces as a provider refusing a request that worked a
 * minute ago.
 *
 * Failure is not fatal. A refresh that cannot complete leaves the existing token in
 * place, which may still be accepted; discarding it would turn a recoverable
 * situation into a certain failure.
 *
 * The renewal is written back by the caller, so the next request does not repeat it
 * — and so a restart does not begin from the expired token again.
 */
export async function renewAccountAuthIfExpiring(input: {
  readonly provider: RuntimeProvider;
  readonly credential: {
    readonly apiKey?: string;
    readonly accountAuth?: OpenAIAccountAuthConfig | GoogleAccountAuthConfig;
  };
  readonly fetchImpl: typeof fetch;
  readonly signal?: AbortSignal;
}): Promise<{
  readonly accountAuth?: OpenAIAccountAuthConfig | GoogleAccountAuthConfig;
  readonly renewed: boolean;
}> {
  const account = accountAuthFor(input.provider, input.credential);
  if (!account) return { renewed: false };
  if (!isExpiring(account.expiresAt)) return { accountAuth: account, renewed: false };

  const config = oauthConfigFor(input.provider, account);
  const refreshToken = account.refreshToken?.trim();
  if (!config || !refreshToken) return { accountAuth: account, renewed: false };

  try {
    const tokens = await refreshOAuthTokens(config, refreshToken, input.fetchImpl);
    return {
      accountAuth: {
        ...account,
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken,
        expiresAt: tokens.expiresAt,
      },
      renewed: true,
    };
  } catch {
    // A provider that is simply unreachable, or a refresh token the server has
    // retired. Either way the request can still be attempted with what we hold.
    return { accountAuth: account, renewed: false };
  }
}
