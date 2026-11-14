import { normalizeBaseUrl } from './values.js';

export interface OpenAIAccountAuthConfig {
  readonly type: "openai-chatgpt-account";
  readonly accessToken: string;
  readonly refreshToken: string;
  readonly expiresAt: number;
  readonly accountId?: string;
  /** New independent login identity; preserved only by verified renewal. */
  readonly loginId?: string;
  readonly extras?: Readonly<Record<string, unknown>>;
}
export interface GoogleAccountAuthConfig {
  readonly type: "google-gemini-account";
  readonly accessToken: string;
  readonly refreshToken: string;
  readonly expiresAt: number;
  readonly clientId: string;
  readonly accountEmail?: string;
  /** The own desktop client's secret, when its token endpoint requires one. */
  readonly clientSecret?: string;
  /** Scopes actually granted by the successful native OAuth exchange. */
  readonly scopes?: readonly string[];
  /** Billing project captured at login, never borrowed from another request. */
  readonly quotaProject?: string;
  readonly extras?: Readonly<Record<string, unknown>>;
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
  /** Omitted only in legacy storage; an unbound credential cannot authorize requests. */
  readonly provider?: 'github-copilot' | 'anthropic';
  readonly accessToken: string;
  readonly refreshToken: string;
  readonly expiresAt: number;
  /** The API base the subscription is routed to, when the issuer states one. */
  readonly baseUrl?: string;
  readonly extras?: Readonly<Record<string, unknown>>;
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

const UNSAFE_EXTRA_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

function sanitizeNestedExtra(value: unknown, depth = 0): unknown {
  if (depth > 8) return undefined;
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return value;
  if (typeof value === 'number') return Number.isFinite(value) ? value : undefined;
  if (Array.isArray(value)) {
    const list: unknown[] = [];
    for (const item of value) {
      const next = sanitizeNestedExtra(item, depth + 1);
      if (next !== undefined) list.push(next);
    }
    return list;
  }
  if (typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
      if (UNSAFE_EXTRA_KEYS.has(key)) continue;
      const next = sanitizeNestedExtra(entry, depth + 1);
      if (next !== undefined) out[key] = next;
    }
    return out;
  }
  return undefined;
}

function cleanAuthExtras(extras: Readonly<Record<string, unknown>> | undefined): Record<string, unknown> | undefined {
  if (!extras || typeof extras !== 'object' || Array.isArray(extras)) return undefined;
  const cleaned = sanitizeNestedExtra(extras) as Record<string, unknown> | undefined;
  return cleaned && Object.keys(cleaned).length > 0 ? cleaned : undefined;
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
    const loginId = openai.loginId?.trim();
    if (
      !accessToken ||
      !refreshToken ||
      !Number.isFinite(expiresAt) ||
      expiresAt <= 0
    ) {
      return undefined;
    }

    const extras = cleanAuthExtras(openai.extras);
    return {
      openai: {
        type: "openai-chatgpt-account",
        accessToken,
        refreshToken,
        expiresAt,
        ...(accountId ? { accountId } : {}),
        ...(loginId ? { loginId } : {}),
        ...(extras ? { extras } : {}),
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
    const clientSecret = google.clientSecret?.trim();
    const quotaProject = google.quotaProject?.trim();
    const scopes = Array.isArray(google.scopes) && google.scopes.every(scope => typeof scope === 'string' && scope.trim())
      ? [...new Set(google.scopes.map(scope => scope.trim()))].sort() : undefined;
    if (
      !accessToken ||
      !refreshToken ||
      !clientId ||
      !Number.isFinite(expiresAt) ||
      expiresAt <= 0
    ) {
      return undefined;
    }

    const extras = cleanAuthExtras(google.extras);
    return {
      google: {
        type: "google-gemini-account",
        accessToken,
        refreshToken,
        expiresAt,
        clientId,
        ...(accountEmail ? { accountEmail } : {}),
        ...(clientSecret ? { clientSecret } : {}),
        ...(quotaProject ? { quotaProject } : {}),
        ...(scopes ? { scopes } : {}),
        ...(extras ? { extras } : {}),
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
    const extras = cleanAuthExtras(subscription.extras);
    return { subscription: { type: "subscription", accessToken, refreshToken, expiresAt,
      ...(subscription.provider ? { provider: subscription.provider } : {}),
      ...(baseUrl ? { baseUrl } : {}),
      ...(extras ? { extras } : {}) } };
  }

  return undefined;
}

