import type { AccountAuthConfig } from "../../../config/account.js";

/**
 * Extended OAuth credential codec (`access`/`refresh`/`expires` + open extension
 * fields + secret-safe metadata summaries).
 */

export interface OAuthCredentialsRecord {
  readonly access: string;
  readonly refresh: string;
  readonly expires: number;
  readonly [key: string]: unknown;
}

export interface OAuthCredentialEnvelope extends OAuthCredentialsRecord {
  readonly type: "oauth";
}

export interface OAuthCredentialSummary {
  readonly type: "oauth";
  readonly providerId?: string;
  readonly expiresAt: number;
  readonly extraKeys: readonly string[];
}

const UNSAFE_KEYS = new Set(["__proto__", "constructor", "prototype"]);
const BASE_RECORD_KEYS = new Set(["type", "access", "refresh", "expires"]);
const KNOWN_OPENAI_KEYS = new Set(["accountId", "loginId"]);
const KNOWN_GOOGLE_KEYS = new Set(["clientId", "accountEmail", "clientSecret", "scopes", "quotaProject"]);
const KNOWN_SUBSCRIPTION_KEYS = new Set(["provider", "baseUrl"]);
const RESERVED_CANONICAL_KEYS = new Set([
  ...BASE_RECORD_KEYS,
  ...KNOWN_OPENAI_KEYS,
  ...KNOWN_GOOGLE_KEYS,
  ...KNOWN_SUBSCRIPTION_KEYS,
]);

function sanitizeJsonValue(value: unknown, depth = 0): unknown {
  if (depth > 8) return undefined;
  if (value === null || typeof value === "string" || typeof value === "boolean") return value;
  if (typeof value === "number") return Number.isFinite(value) ? value : undefined;
  if (Array.isArray(value)) {
    const out: unknown[] = [];
    for (const item of value) {
      const cleaned = sanitizeJsonValue(item, depth + 1);
      if (cleaned !== undefined) out.push(cleaned);
    }
    return out;
  }
  if (typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
      if (UNSAFE_KEYS.has(key)) continue;
      const cleaned = sanitizeJsonValue(entry, depth + 1);
      if (cleaned !== undefined) out[key] = cleaned;
    }
    return out;
  }
  return undefined;
}

export function sanitizeOAuthExtras(
  raw: unknown,
  stripReserved = false,
): Record<string, unknown> | undefined {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return undefined;
  const cleaned = sanitizeJsonValue(raw) as Record<string, unknown> | undefined;
  if (!cleaned) return undefined;
  if (stripReserved) {
    for (const key of Object.keys(cleaned)) {
      if (RESERVED_CANONICAL_KEYS.has(key)) delete cleaned[key];
    }
  }
  return Object.keys(cleaned).length > 0 ? cleaned : undefined;
}

/** Validate and normalize an external/persisted OAuth credential record while preserving extension fields. */
export function parseOAuthCredentialRecord(raw: unknown): OAuthCredentialEnvelope | undefined {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return undefined;
  const obj = raw as Record<string, unknown>;
  if (obj.type !== undefined && obj.type !== "oauth") return undefined;
  const access = typeof obj.access === "string" ? obj.access.trim() : "";
  const refresh = typeof obj.refresh === "string" ? obj.refresh.trim() : "";
  const expires = typeof obj.expires === "number" ? obj.expires : Number(obj.expires);
  if (!access || !refresh || !Number.isFinite(expires) || expires <= 0) return undefined;

  const extras: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj)) {
    if (BASE_RECORD_KEYS.has(key) || UNSAFE_KEYS.has(key)) continue;
    const cleaned = sanitizeJsonValue(value);
    if (cleaned !== undefined) extras[key] = cleaned;
  }
  return {
    ...extras,
    type: "oauth",
    access,
    refresh,
    expires,
  };
}

/** Encode a Cheers `AccountAuthConfig` into an OAuth credential envelope without allowing `extras` to override canonical fields. */
export function encodeAccountAuthToOAuthRecord(auth: AccountAuthConfig): OAuthCredentialEnvelope {
  const extras = sanitizeOAuthExtras(auth.extras, true) ?? {};
  if (auth.type === "openai-chatgpt-account") {
    return {
      ...extras,
      type: "oauth",
      access: auth.accessToken,
      refresh: auth.refreshToken,
      expires: auth.expiresAt,
      ...(auth.accountId ? { accountId: auth.accountId } : {}),
      ...(auth.loginId ? { loginId: auth.loginId } : {}),
    };
  }
  if (auth.type === "google-gemini-account") {
    return {
      ...extras,
      type: "oauth",
      access: auth.accessToken,
      refresh: auth.refreshToken,
      expires: auth.expiresAt,
      clientId: auth.clientId,
      ...(auth.accountEmail ? { accountEmail: auth.accountEmail } : {}),
      ...(auth.clientSecret ? { clientSecret: auth.clientSecret } : {}),
      ...(auth.scopes ? { scopes: [...auth.scopes] } : {}),
      ...(auth.quotaProject ? { quotaProject: auth.quotaProject } : {}),
    };
  }
  return {
    ...extras,
    type: "oauth",
    access: auth.accessToken,
    refresh: auth.refreshToken,
    expires: auth.expiresAt,
    ...(auth.provider ? { provider: auth.provider } : {}),
    ...(auth.baseUrl ? { baseUrl: auth.baseUrl } : {}),
  };
}

function extractUnknownExtras(
  record: OAuthCredentialEnvelope,
  knownKeys: ReadonlySet<string>,
): Record<string, unknown> | undefined {
  const extras: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(record)) {
    if (BASE_RECORD_KEYS.has(key) || knownKeys.has(key) || UNSAFE_KEYS.has(key)) continue;
    extras[key] = value;
  }
  return Object.keys(extras).length > 0 ? extras : undefined;
}

/** Decode an OAuth credential envelope back into Cheers `AccountAuthConfig`, preserving extra fields in `extras`. */
export function decodeOAuthRecordToAccountAuth(
  provider: string,
  raw: unknown,
): AccountAuthConfig | undefined {
  const record = parseOAuthCredentialRecord(raw);
  if (!record) return undefined;

  if (provider === "openai") {
    const accountId = typeof record.accountId === "string" && record.accountId.trim() ? record.accountId.trim() : undefined;
    const loginId = typeof record.loginId === "string" && record.loginId.trim() ? record.loginId.trim() : undefined;
    const extras = extractUnknownExtras(record, KNOWN_OPENAI_KEYS);
    return {
      type: "openai-chatgpt-account",
      accessToken: record.access,
      refreshToken: record.refresh,
      expiresAt: record.expires,
      ...(accountId ? { accountId } : {}),
      ...(loginId ? { loginId } : {}),
      ...(extras ? { extras } : {}),
    };
  }

  if (provider === "google") {
    const clientId = typeof record.clientId === "string" ? record.clientId.trim() : "";
    if (!clientId) return undefined;
    const accountEmail = typeof record.accountEmail === "string" && record.accountEmail.trim() ? record.accountEmail.trim() : undefined;
    const clientSecret = typeof record.clientSecret === "string" && record.clientSecret.trim() ? record.clientSecret.trim() : undefined;
    const quotaProject = typeof record.quotaProject === "string" && record.quotaProject.trim() ? record.quotaProject.trim() : undefined;
    const scopes = Array.isArray(record.scopes) && record.scopes.every((s) => typeof s === "string" && s.trim())
      ? [...new Set(record.scopes.map((s) => s.trim()))].sort()
      : undefined;
    const extras = extractUnknownExtras(record, KNOWN_GOOGLE_KEYS);
    return {
      type: "google-gemini-account",
      accessToken: record.access,
      refreshToken: record.refresh,
      expiresAt: record.expires,
      clientId,
      ...(accountEmail ? { accountEmail } : {}),
      ...(clientSecret ? { clientSecret } : {}),
      ...(quotaProject ? { quotaProject } : {}),
      ...(scopes ? { scopes } : {}),
      ...(extras ? { extras } : {}),
    };
  }

  if (provider === "anthropic" || provider === "github-copilot") {
    const subProvider = record.provider === "anthropic" || record.provider === "github-copilot"
      ? record.provider
      : provider;
    const baseUrl = typeof record.baseUrl === "string" && record.baseUrl.trim() ? record.baseUrl.trim() : undefined;
    const extras = extractUnknownExtras(record, KNOWN_SUBSCRIPTION_KEYS);
    return {
      type: "subscription",
      provider: subProvider,
      accessToken: record.access,
      refreshToken: record.refresh,
      expiresAt: record.expires,
      ...(baseUrl ? { baseUrl } : {}),
      ...(extras ? { extras } : {}),
    };
  }

  return undefined;
}

/** Return non-secret metadata summary without exposing access or refresh tokens. */
export function summarizeOAuthCredential(
  credential: AccountAuthConfig | OAuthCredentialEnvelope,
  providerId?: string,
): OAuthCredentialSummary {
  const envelope = credential.type === "oauth" ? credential : encodeAccountAuthToOAuthRecord(credential);
  const extraKeys = Object.keys(envelope)
    .filter((key) => !BASE_RECORD_KEYS.has(key))
    .sort();
  return {
    type: "oauth",
    ...(providerId ? { providerId } : {}),
    expiresAt: envelope.expires,
    extraKeys,
  };
}
