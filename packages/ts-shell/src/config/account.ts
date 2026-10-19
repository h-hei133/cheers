import { normalizeBaseUrl } from './values.js';

export interface OpenAIAccountAuthConfig {
  readonly type: "openai-chatgpt-account";
  readonly accessToken: string;
  readonly refreshToken: string;
  readonly expiresAt: number;
  readonly accountId?: string;
}

export interface GoogleAccountAuthConfig {
  readonly type: "google-gemini-account";
  readonly accessToken: string;
  readonly refreshToken: string;
  readonly expiresAt: number;
  readonly clientId: string;
  readonly accountEmail?: string;
}

/**
 * A credential from a subscription rather than from a registered API client.
 *
 * The flows that issue one — a device code entered elsewhere, a loopback
 * callback on a fixed port — produce a token that is renewed with a different
 * token rather than by signing in again, which is why the refresh material is
 * kept beside it. It carries no account id: the subscription is the identity.
 */
export interface SubscriptionAccountAuthConfig {
  readonly type: "subscription";
  readonly accessToken: string;
  readonly refreshToken: string;
  readonly expiresAt: number;
  /** The API base the subscription is routed to, when the issuer states one. */
  readonly baseUrl?: string;
}

/**
 * Any credential an account sign-in can produce.
 *
 * Named once because it is threaded through the resolver, the readiness check,
 * the authorization layer and the request path: spelling the union out at each
 * of those is how a new kind of credential gets added to most of them and missed
 * in one, and the miss shows up as a credential silently not being sent.
 */
export type AccountAuthConfig =
  | OpenAIAccountAuthConfig
  | GoogleAccountAuthConfig
  | SubscriptionAccountAuthConfig;

export interface ProviderAccountAuthConfig {
  readonly openai?: OpenAIAccountAuthConfig;
  readonly google?: GoogleAccountAuthConfig;
  readonly subscription?: SubscriptionAccountAuthConfig;
}



export function normalizeProviderAccountAuth(
  provider: string,
  accountAuth?: ProviderAccountAuthConfig,
): ProviderAccountAuthConfig | undefined {
  if (!accountAuth) {
    return undefined;
  }

  if (provider === "openai") {
    const openai = accountAuth.openai;
    if (!openai || openai.type !== "openai-chatgpt-account") {
      return undefined;
    }

    const accessToken = openai.accessToken?.trim();
    const refreshToken = openai.refreshToken?.trim();
    const expiresAt = Number(openai.expiresAt);
    const accountId = openai.accountId?.trim();
    if (
      !accessToken ||
      !refreshToken ||
      !Number.isFinite(expiresAt) ||
      expiresAt <= 0
    ) {
      return undefined;
    }

    return {
      openai: {
        type: "openai-chatgpt-account",
        accessToken,
        refreshToken,
        expiresAt,
        ...(accountId ? { accountId } : {}),
      },
    };
  }

  if (provider === "google") {
    const google = accountAuth.google;
    if (!google || google.type !== "google-gemini-account") {
      return undefined;
    }

    const accessToken = google.accessToken?.trim();
    const refreshToken = google.refreshToken?.trim();
    const expiresAt = Number(google.expiresAt);
    const clientId = google.clientId?.trim();
    const accountEmail = google.accountEmail?.trim();
    if (
      !accessToken ||
      !refreshToken ||
      !clientId ||
      !Number.isFinite(expiresAt) ||
      expiresAt <= 0
    ) {
      return undefined;
    }

    return {
      google: {
        type: "google-gemini-account",
        accessToken,
        refreshToken,
        expiresAt,
        clientId,
        ...(accountEmail ? { accountEmail } : {}),
      },
    };
  }

  if (provider === "anthropic" || provider === "github-copilot") {
    const subscription = accountAuth.subscription;
    if (!subscription || subscription.type !== "subscription") return undefined;
    const accessToken = subscription.accessToken?.trim();
    const refreshToken = subscription.refreshToken?.trim();
    const expiresAt = Number(subscription.expiresAt);
    if (!accessToken || !refreshToken || !Number.isFinite(expiresAt) || expiresAt <= 0) return undefined;
    const baseUrl = normalizeBaseUrl(subscription.baseUrl);
    return { subscription: { type: "subscription", accessToken, refreshToken, expiresAt,
      ...(baseUrl ? { baseUrl } : {}) } };
  }

  return undefined;
}

