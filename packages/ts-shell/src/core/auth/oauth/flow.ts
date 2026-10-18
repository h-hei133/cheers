import { spawn } from "node:child_process";
import { createHash } from 'node:crypto';
import { createPkcePair, createState } from "./pkce.js";
import { startCallbackServer } from "./callback.js";

/**
 * One authorization-code-with-PKCE flow, for every provider that uses it.
 *
 * There were two of these, one per provider, each around five hundred lines and
 * each with its own copy of the PKCE maths, the loopback server, the browser
 * launch, the token exchange, and the retry policy — which meant a fix to one
 * left the other broken. What actually differs between providers is a handful of
 * URLs, a client id, a scope string, and a few extra query parameters; that is
 * what {@link OAuthProviderConfig} holds, and everything else is here once.
 *
 * Refresh lives here too. Without it a login lasts an hour and then fails in a way
 * that looks like a broken provider rather than an expired token.
 */

export interface OAuthProviderConfig {
  /** Identifier used in messages. */
  readonly id: string;
  /** Human-readable name for the sign-in prompt. */
  readonly label: string;
  readonly authorizeUrl: string;
  readonly tokenUrl: string;
  readonly clientId: string;
  /** Space-separated scopes. */
  readonly scope: string;
  /** Port to prefer for the loopback redirect. */
  readonly callbackPort: number;
  readonly callbackPath: string;
  /** Extra authorize parameters this provider requires. */
  readonly authorizeParams?: Readonly<Record<string, string>>;
  /** Client secret, for the providers that still demand one from a public client. */
  readonly clientSecret?: string;
  /** Whether a mismatched callback state is fatal; a few servers omit it entirely. */
  readonly requireState?: boolean;
}

export interface OAuthTokens {
  readonly accessToken: string;
  readonly refreshToken: string;
  /** Epoch milliseconds. */
  readonly expiresAt: number;
  /** The identity the token is scoped to, when the provider says. */
  readonly accountId?: string;
  readonly accountEmail?: string;
  /** In-memory native login capability, never credential storage. */
  readonly production?: object;
}

const loginProductions = new WeakMap<object, { readonly issuer: string; readonly client: string; readonly provider: string; readonly digest: string }>();

export class OAuthExchangeError extends Error {
  constructor(readonly code: 'http' | 'transport' | 'cancelled' | 'decode' | 'response' | 'access' | 'metadata' | 'expiry',
    provider: string, step: string, readonly status?: number) {
    const detail = { http: `failed with HTTP ${status}`, transport: 'transport failed', cancelled: 'cancelled',
      decode: 'response could not be decoded', response: 'returned an invalid token response',
      access: 'returned no access token', metadata: 'returned invalid token metadata', expiry: 'returned an expired access token' }[code];
    super(`${provider}: ${step} ${detail}.`);
  }
}

function loginDigest(tokens: OAuthTokens, provider: string): string {
  return createHash('sha256').update(JSON.stringify([tokens.accessToken, tokens.refreshToken, tokens.expiresAt,
    provider === 'openai' ? tokens.accountId ?? '' : tokens.accountEmail ?? ''])).digest('hex');
}

/** Raw payloads and proofs from another issuer/client or credential cannot authorize enrollment. */
export function nativeOAuthLogin(tokens: OAuthTokens, config: OAuthProviderConfig): boolean {
  const proof = tokens.production && loginProductions.get(tokens.production);
  return !!proof && proof.issuer === config.tokenUrl && proof.client === config.clientId && proof.provider === config.id
    && proof.digest === loginDigest(tokens, config.id);
}

export interface OAuthLoginResult extends OAuthTokens {
  readonly authorizeUrl: string;
  readonly callbackUrl: string;
  readonly clientId: string;
}

export interface OAuthLoginOptions {
  readonly timeoutMs?: number;
  /** Override how the browser is opened; tests pass a recorder. */
  readonly openBrowser?: (url: string) => Promise<void> | void;
  /** Called with the authorize URL, so a surface can show it for manual opening. */
  readonly onAuthorizeUrl?: (url: string) => void;
  /** Override the token exchange transport; tests pass a stub. */
  readonly fetchImpl?: typeof fetch;
}

/** How long to wait for the browser round trip before giving up. */
const DEFAULT_TIMEOUT_MS = 5 * 60_000;
const MIN_TIMEOUT_MS = 30_000;
/** Assumed lifetime when a provider does not say. */
const FALLBACK_LIFETIME_SECONDS = 3_600;

/**
 * Sign in, returning the tokens and the URLs the flow actually used.
 *
 * The redirect URI is only known after the server binds, because the preferred
 * port may be taken — so the authorize URL is built from what was bound rather
 * than from what was hoped for. Getting that order wrong produces a
 * `redirect_uri_mismatch` that reads like a configuration error.
 */
export async function runOAuthLogin(
  config: OAuthProviderConfig,
  options: OAuthLoginOptions = {},
): Promise<OAuthLoginResult> {
  const timeoutMs = Math.max(MIN_TIMEOUT_MS, options.timeoutMs ?? DEFAULT_TIMEOUT_MS);
  const state = createState();
  const pkce = createPkcePair();
  const server = await startCallbackServer({
    path: config.callbackPath,
    port: config.callbackPort,
    expectedState: state,
    timeoutMs,
    ...(config.requireState === false ? { requireState: false } : {}),
    label: config.label,
  });

  try {
    const authorizeUrl = buildAuthorizeUrl(config, {
      redirectUri: server.redirectUri,
      state,
      challenge: pkce.challenge,
    });
    options.onAuthorizeUrl?.(authorizeUrl);
    await (options.openBrowser ?? openInBrowser)(authorizeUrl);

    const callback = await server.received;
    const tokens = await exchangeCode(config, {
      code: callback.code,
      verifier: pkce.verifier,
      redirectUri: server.redirectUri,
      fetchImpl: options.fetchImpl ?? fetch,
    });
    return {
      ...tokens,
      authorizeUrl,
      callbackUrl: server.redirectUri,
      clientId: config.clientId,
    };
  } finally {
    server.close();
  }
}

/** Trade a refresh token for a fresh access token. */
export async function refreshOAuthTokens(
  config: OAuthProviderConfig,
  refreshToken: string,
  fetchImpl: typeof fetch = fetch,
): Promise<OAuthTokens> {
  const body = new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: refreshToken,
    client_id: config.clientId,
    ...(config.clientSecret ? { client_secret: config.clientSecret } : {}),
  });
  const payload = await post(config, body, fetchImpl, "refresh");
  return {
    accessToken: payload.access_token,
    // A provider that rotates refresh tokens sends a new one; one that does not
    // expects the old one to keep working. Dropping the old one on the second kind
    // turns a working login into a dead one at the next refresh.
    refreshToken: payload.refresh_token ?? refreshToken,
    expiresAt: expiryOf(payload),
    ...identity(payload),
  };
}

/** Whether a stored expiry is close enough that the token should be refreshed first. */
export function isExpiring(expiresAt: number, withinMs = 60_000): boolean {
  return expiresAt - Date.now() <= withinMs;
}

interface TokenPayload {
  readonly access_token: string;
  readonly refresh_token?: string;
  readonly id_token?: string;
  readonly expires_in?: number;
}

/** The authorize URL, with the provider's own required parameters folded in. */
function buildAuthorizeUrl(
  config: OAuthProviderConfig,
  input: { readonly redirectUri: string; readonly state: string; readonly challenge: string },
): string {
  const params = new URLSearchParams({
    response_type: "code",
    client_id: config.clientId,
    redirect_uri: input.redirectUri,
    scope: config.scope,
    code_challenge: input.challenge,
    code_challenge_method: "S256",
    state: input.state,
    ...(config.authorizeParams ?? {}),
  });
  return `${config.authorizeUrl}?${params.toString()}`;
}

/** Redeem the authorization code. */
async function exchangeCode(
  config: OAuthProviderConfig,
  input: {
    readonly code: string;
    readonly verifier: string;
    readonly redirectUri: string;
    readonly fetchImpl: typeof fetch;
  },
): Promise<OAuthTokens> {
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code: input.code,
    redirect_uri: input.redirectUri,
    client_id: config.clientId,
    code_verifier: input.verifier,
    ...(config.clientSecret ? { client_secret: config.clientSecret } : {}),
  });
  const payload = await post(config, body, input.fetchImpl, "token exchange");
  const tokens: OAuthTokens = {
    accessToken: payload.access_token,
    refreshToken: payload.refresh_token ?? "",
    expiresAt: expiryOf(payload),
    ...identity(payload),
  };
  const production = Object.freeze({});
  loginProductions.set(production, { issuer: config.tokenUrl, client: config.clientId, provider: config.id, digest: loginDigest(tokens, config.id) });
  return { ...tokens, production };
}

/**
 * One form-encoded POST to the token endpoint.
 *
 * Token endpoint response bodies can also contain credentials. Failure reports
 * retain the provider, step and status without reading or echoing that body.
 */
async function post(
  config: OAuthProviderConfig,
  body: URLSearchParams,
  fetchImpl: typeof fetch,
  step: string,
): Promise<TokenPayload> {
  let response: Response;
  try {
    response = await fetchImpl(config.tokenUrl, {
      method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: body.toString(),
    });
  } catch (error) {
    const kind = error instanceof Error && error.name === 'AbortError' ? 'cancelled' : 'transport';
    throw new OAuthExchangeError(kind, config.label, step);
  }
  if (!response.ok) {
    void response.body?.cancel().catch(() => undefined);
    throw new OAuthExchangeError('http', config.label, step, response.status);
  }
  let decoded: unknown;
  try { decoded = await response.json(); }
  catch { throw new OAuthExchangeError('decode', config.label, step); }
  if (!decoded || typeof decoded !== 'object' || Array.isArray(decoded)) throw new OAuthExchangeError('response', config.label, step);
  const payload = decoded as Partial<TokenPayload>;
  if (typeof payload.access_token !== "string" || payload.access_token.length === 0) {
    throw new OAuthExchangeError('access', config.label, step);
  }
  if ((payload.refresh_token !== undefined && typeof payload.refresh_token !== 'string')
    || (payload.id_token !== undefined && typeof payload.id_token !== 'string')
    || (payload.expires_in !== undefined && (typeof payload.expires_in !== 'number' || !Number.isFinite(payload.expires_in) || payload.expires_in < 0))) {
    throw new OAuthExchangeError('metadata', config.label, step);
  }
  return payload as TokenPayload;
}

/** When the access token stops working, in epoch milliseconds. */
function expiryOf(payload: TokenPayload): number {
  const seconds = typeof payload.expires_in === "number" ? payload.expires_in : FALLBACK_LIFETIME_SECONDS;
  return Date.now() + seconds * 1_000;
}

/**
 * Who the token belongs to, from the id token when there is one.
 *
 * The id token is a JWT the provider signed for this client. It is read here for
 * display only, never trusted for authorization, so the signature is not checked —
 * and it is base64 rather than encrypted, so a malformed one is a missing name
 * rather than a failure.
 */
function identity(payload: TokenPayload): { accountId?: string; accountEmail?: string } {
  if (!payload.id_token) return {};
  const segment = payload.id_token.split(".")[1];
  if (!segment) return {};
  try {
    const claims = JSON.parse(Buffer.from(segment, "base64url").toString("utf8")) as Record<string, unknown>;
    const email = typeof claims.email === "string" ? claims.email : undefined;
    const id = accountIdFrom(claims);
    return { ...(id ? { accountId: id } : {}), ...(email ? { accountEmail: email } : {}) };
  } catch {
    return {};
  }
}

/** The account or organisation id, wherever this provider chose to put it. */
function accountIdFrom(claims: Record<string, unknown>): string | undefined {
  for (const value of Object.values(claims)) {
    if (value && typeof value === "object" && !Array.isArray(value)) {
      const nested = value as Record<string, unknown>;
      for (const key of Object.keys(nested)) {
        if (key.endsWith("account_id") && typeof nested[key] === "string") return nested[key] as string;
      }
    }
  }
  for (const key of Object.keys(claims)) {
    if (key.endsWith("account_id") && typeof claims[key] === "string") return claims[key] as string;
  }
  const organizations = claims.organizations;
  if (Array.isArray(organizations)) {
    const first = organizations[0] as { id?: unknown } | undefined;
    if (first && typeof first.id === "string") return first.id;
  }
  return typeof claims.sub === "string" ? claims.sub : undefined;
}

/** Hand the URL to whatever opens links on this platform. */
async function openInBrowser(url: string): Promise<void> {
  const command =
    process.platform === "darwin" ? "open" : process.platform === "win32" ? "cmd" : "xdg-open";
  const args = process.platform === "win32" ? ["/c", "start", "", url] : [url];
  try {
    // Detached and with its own streams: the launcher must not hold the terminal
    // or write into a frame the interface is painting.
    spawn(command, args, { detached: true, stdio: "ignore" }).unref();
  } catch {
    // A machine with no browser launcher is not a failed login — the authorize URL
    // was already reported, and it can be opened by hand.
  }
}
