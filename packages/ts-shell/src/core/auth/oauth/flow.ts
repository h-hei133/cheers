import { spawn } from "node:child_process";
import { createHash } from 'node:crypto';
import { createPkcePair, createState } from "./pkce.js";
import { startCallbackServer } from "./callback.js";
import { loginLifetime, waitForLogin } from './lifetime.js';
import type { SignInProgress } from '../providerAuthContract.js';

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
  /** Billing project captured by an own-client Google login. */
  readonly quotaProject?: string;
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
  readonly scopes?: readonly string[];
  readonly clientSecret?: string;
  readonly quotaProject?: string;
  /** In-memory native login capability, never credential storage. */
  readonly production?: object;
}

const loginProductions = new WeakMap<object, { readonly issuer: string; readonly client: string; readonly provider: string; readonly digest: string; readonly binding: string }>();

export class OAuthExchangeError extends Error {
  constructor(readonly code: 'http' | 'transport' | 'cancelled' | 'timeout' | 'decode' | 'response' | 'access' | 'metadata' | 'expiry',
    provider: string, step: string, readonly status?: number) {
    const detail = { http: `failed with HTTP ${status}`, transport: 'transport failed', cancelled: 'cancelled', timeout: 'timed out',
      decode: 'response could not be decoded', response: 'returned an invalid token response',
      access: 'returned no access token', metadata: 'returned invalid token metadata', expiry: 'returned an expired access token' }[code];
    super(`${provider}: ${step} ${detail}.`);
  }
}

function loginDigest(tokens: OAuthTokens, provider: string): string {
  return createHash('sha256').update(JSON.stringify([tokens.accessToken, tokens.refreshToken, tokens.expiresAt,
    provider === 'openai' ? tokens.accountId ?? '' : tokens.accountEmail ?? '', provider === 'google' ? tokens.scopes : undefined, provider === 'google' ? [tokens.clientSecret ?? '', tokens.quotaProject ?? ''] : []])).digest('hex');
}

function loginConfigBinding(config: OAuthProviderConfig): string {
  return createHash('sha256').update(JSON.stringify(config.id === 'google' ? [config.clientSecret ?? '', config.quotaProject ?? ''] : [])).digest('hex');
}

/** Raw payloads and proofs from another issuer/client or credential cannot authorize enrollment. */
export function nativeOAuthLogin(tokens: OAuthTokens, config: OAuthProviderConfig): boolean {
  const proof = tokens.production && loginProductions.get(tokens.production);
  return !!proof && proof.issuer === config.tokenUrl && proof.client === config.clientId && proof.provider === config.id
    && proof.binding === loginConfigBinding(config) && proof.digest === loginDigest(tokens, config.id);
}

export interface OAuthLoginResult extends OAuthTokens {
  readonly authorizeUrl: string;
  readonly callbackUrl: string;
  readonly clientId: string;
}

export interface OAuthLoginOptions {
  readonly timeoutMs?: number;
  readonly signal?: AbortSignal;
  readonly onProgress?: (progress: SignInProgress) => void;
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
  if (options.timeoutMs !== undefined && (!Number.isFinite(options.timeoutMs) || options.timeoutMs <= 0 || options.timeoutMs > 2_147_483_647)) {
    throw new Error('Sign-in timeout must be a positive finite duration within the timer limit.');
  }
  const timeoutMs = Math.max(MIN_TIMEOUT_MS, options.timeoutMs ?? DEFAULT_TIMEOUT_MS);
  const lifetime = loginLifetime(timeoutMs, options.signal);
  let server: Awaited<ReturnType<typeof startCallbackServer>> | undefined;
  try {
    lifetime.signal.throwIfAborted();
    const state = createState();
    const pkce = createPkcePair();
    server = await startCallbackServer({
      path: config.callbackPath, port: config.callbackPort, expectedState: state, timeoutMs,
      ...(config.requireState === false ? { requireState: false } : {}),
      label: config.label, signal: lifetime.signal,
    });
    lifetime.signal.throwIfAborted();
    const authorizeUrl = buildAuthorizeUrl(config, {
      redirectUri: server.redirectUri,
      state,
      challenge: pkce.challenge,
    });
    options.onAuthorizeUrl?.(authorizeUrl);
    lifetime.signal.throwIfAborted();
    options.onProgress?.({ authorizeUrl });
    lifetime.signal.throwIfAborted();
    await waitForLogin((options.openBrowser ?? openInBrowser)(authorizeUrl), lifetime.signal);

    const callback = await waitForLogin(server.received, lifetime.signal);
    const tokens = await exchangeCode(config, {
      code: callback.code,
      verifier: pkce.verifier,
      redirectUri: server.redirectUri,
      fetchImpl: options.fetchImpl ?? fetch,
      signal: lifetime.signal,
    });
    lifetime.signal.throwIfAborted();
    return {
      ...tokens,
      authorizeUrl,
      callbackUrl: server.redirectUri,
      clientId: config.clientId,
    };
  } catch (error) {
    if (lifetime.signal.aborted) throw new OAuthExchangeError(lifetime.signal.reason?.name === 'TimeoutError' ? 'timeout' : 'cancelled', config.label, 'sign-in');
    throw error;
  } finally {
    server?.close();
    lifetime.close();
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
    ...identity(payload, config.id),
    scopes: grantedScopes(payload, config),
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
  readonly scope?: string;
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
  const url = new URL(config.authorizeUrl);
  if (url.protocol !== 'https:' || url.username || url.password || url.hash || /[\x00-\x20\x7f-\x9f]/.test(config.authorizeUrl)) {
    throw new Error('Sign-in requires a safe HTTPS authorization URL.');
  }
  for (const [key, value] of params) url.searchParams.set(key, value);
  return url.toString();
}

/** Redeem the authorization code. */
async function exchangeCode(
  config: OAuthProviderConfig,
  input: {
    readonly code: string;
    readonly verifier: string;
    readonly redirectUri: string;
    readonly fetchImpl: typeof fetch;
    readonly signal?: AbortSignal;
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
  const payload = await post(config, body, input.fetchImpl, "token exchange", input.signal);
  const tokens: OAuthTokens = {
    accessToken: payload.access_token,
    refreshToken: payload.refresh_token ?? "",
    expiresAt: expiryOf(payload),
    ...identity(payload, config.id),
    scopes: grantedScopes(payload, config),
  };
  if (config.id === 'google') Object.assign(tokens, { ...(config.clientSecret ? { clientSecret: config.clientSecret } : {}), ...(config.quotaProject ? { quotaProject: config.quotaProject } : {}) });
  if (config.id === 'openai' && !tokens.accountId) throw new OAuthExchangeError('metadata', config.label, 'token exchange');
  const production = Object.freeze({});
  loginProductions.set(production, { issuer: config.tokenUrl, client: config.clientId, provider: config.id, digest: loginDigest(tokens, config.id), binding: loginConfigBinding(config) });
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
  signal?: AbortSignal,
): Promise<TokenPayload> {
  let response: Response;
  try {
    signal?.throwIfAborted();
    const pending = fetchImpl(config.tokenUrl, {
      method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: body.toString(), redirect: 'error',
      ...(signal ? { signal } : {}),
    });
    if (signal) void pending.then(late => { if (signal.aborted) void late.body?.cancel().catch(() => undefined); }, () => undefined);
    response = await waitForLogin(pending, signal);
  } catch (error) {
    const kind = error instanceof Error && error.name === 'AbortError' ? 'cancelled' : 'transport';
    throw new OAuthExchangeError(kind, config.label, step);
  }
  if (!response.ok) {
    void response.body?.cancel().catch(() => undefined);
    throw new OAuthExchangeError('http', config.label, step, response.status);
  }
  let decoded: unknown;
  try { decoded = await waitForLogin(response.json(), signal); }
  catch { throw new OAuthExchangeError('decode', config.label, step); }
  if (!decoded || typeof decoded !== 'object' || Array.isArray(decoded)) throw new OAuthExchangeError('response', config.label, step);
  const payload = decoded as Partial<TokenPayload>;
  if (typeof payload.access_token !== "string" || payload.access_token.length === 0) {
    throw new OAuthExchangeError('access', config.label, step);
  }
  if ((payload.refresh_token !== undefined && typeof payload.refresh_token !== 'string')
    || (payload.id_token !== undefined && typeof payload.id_token !== 'string')
    || (payload.scope !== undefined && typeof payload.scope !== 'string')
    || (payload.expires_in !== undefined && (typeof payload.expires_in !== 'number' || !Number.isFinite(payload.expires_in) || payload.expires_in < 0))) {
    throw new OAuthExchangeError('metadata', config.label, step);
  }
  return payload as TokenPayload;
}

/** OAuth omission means the requested scope; an explicit reduced grant stays reduced. */
function grantedScopes(payload: TokenPayload, config: OAuthProviderConfig): readonly string[] {
  return [...new Set((payload.scope ?? config.scope).split(/\s+/).filter(Boolean))].sort();
}

/** When the access token stops working, in epoch milliseconds. */
function expiryOf(payload: TokenPayload): number {
  const seconds = typeof payload.expires_in === "number" ? payload.expires_in : FALLBACK_LIFETIME_SECONDS;
  return Date.now() + seconds * 1_000;
}

/**
 * Account metadata comes only from the issuer's successful token exchange.
 * OpenAI's access claim identifies the generation account; subject and ID-token
 * display metadata cannot substitute for it. The exchange transport supplies
 * issuer trust, and the renewal owner compares this claim before admitting tokens.
 */
function identity(payload: TokenPayload, provider: string): { accountId?: string; accountEmail?: string } {
  const token = provider === 'openai' ? payload.access_token : payload.id_token;
  const segment = token?.split(".")[1];
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

/** Exact account-service claim; subject and organization identifiers are distinct. */
function accountIdFrom(claims: Record<string, unknown>): string | undefined {
  const auth = claims['https://api.openai.com/auth'];
  if (!auth || typeof auth !== 'object' || Array.isArray(auth)) return undefined;
  const id = (auth as Record<string, unknown>).chatgpt_account_id;
  return typeof id === 'string' && id.trim() ? id.trim() : undefined;
}

/** Hand the URL to whatever opens links on this platform. */
async function openInBrowser(url: string): Promise<void> {
  const command =
    process.platform === "darwin" ? "open" : process.platform === "win32" ? "cmd" : "xdg-open";
  const args = process.platform === "win32" ? ["/c", "start", "", url] : [url];
  try {
    // Detached and with its own streams: the launcher must not hold the terminal
    // or write into a frame the interface is painting.
    const child = spawn(command, args, { detached: true, stdio: "ignore" });
    child.once('error', () => undefined);
    child.unref();
  } catch {
    // A machine with no browser launcher is not a failed login — the authorize URL
    // was already reported, and it can be opened by hand.
  }
}
