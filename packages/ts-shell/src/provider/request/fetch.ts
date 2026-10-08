import { admittedFetch, type Admission } from "../../core/network/admission.js";
import { Agent, ProxyAgent, fetch as undiciFetch } from "undici";

export interface ProviderFetchEnvironment {
  readonly CHEERS_PROVIDER_PROXY?: string;
  readonly CHEERS_PROVIDER_NO_PROXY?: string;
  readonly CHEERS_PROVIDER_TRANSPORT_DIAGNOSTICS?: string;
  readonly CHEERS_PROVIDER_CONNECT_TIMEOUT_MS?: string;
  readonly CHEERS_PROVIDER_HEADERS_TIMEOUT_MS?: string;
  readonly CHEERS_PROVIDER_BODY_TIMEOUT_MS?: string;
  readonly HTTPS_PROXY?: string;
  readonly https_proxy?: string;
  readonly HTTP_PROXY?: string;
  readonly http_proxy?: string;
  readonly NO_PROXY?: string;
  readonly no_proxy?: string;
}

interface ProviderFetchOptions {
  readonly env?: ProviderFetchEnvironment;
  readonly fetchImpl?: typeof fetch;
  /**
   * Timeouts from the resolved configuration, when the caller has them.
   *
   * The environment still wins over these, matching how every other setting
   * resolves: a variable is a statement about this run, and a file is a standing
   * preference. Passing them in rather than reading config here keeps this module
   * independent of the config layer, which it does not otherwise import.
   */
  readonly timeouts?: ProviderTimeoutOverrides;
}

/**
 * What a request looks like to something that has to sign it.
 *
 * Every field is what the transport already holds at the moment before dispatch,
 * which is the point: a signature covers the method, the URL, the headers and the
 * body, and this is the only place all four exist together. Signing anywhere
 * earlier means signing something that has not been built yet.
 */
export interface SignableRequest {
  readonly url: string;
  readonly method: string;
  readonly headers: Readonly<Record<string, string>>;
  /** The serialized body, or nothing for a request that carries none. */
  readonly body?: string;
}

/**
 * Adds whatever a protocol needs to authenticate a request.
 *
 * Returns the headers to send, given the request they will travel with. A
 * credential that is a constant does not need this and does not use it — this is
 * for the ones whose value depends on the request, which is what a signature is.
 * Async because signing is: deriving a key and hashing a body are both.
 */
export type RequestSigner = (
  request: SignableRequest,
) => Promise<Readonly<Record<string, string | undefined>>>;

/** The three deadlines a request runs against, as configuration states them. */
export interface ProviderTimeoutOverrides {
  readonly connectTimeoutMs?: number;
  readonly headersTimeoutMs?: number;
  readonly bodyTimeoutMs?: number;
}

interface ProviderTransportConfig {
  readonly proxyUrl?: string;
  readonly noProxy: readonly string[];
  readonly diagnosticsEnabled: boolean;
  readonly connectTimeoutMs: number;
  readonly headersTimeoutMs: number;
  readonly bodyTimeoutMs: number;
}

const DEFAULT_CONNECT_TIMEOUT_MS = 30_000;
const DEFAULT_HEADERS_TIMEOUT_MS = 120_000;
const DEFAULT_BODY_TIMEOUT_MS = 120_000;
/**
 * The largest deadline that is still a deadline.
 *
 * An hour. A field in milliseconds accepts a number large enough that the timer
 * outlives the process, which is indistinguishable from having no deadline at
 * all; past this the built-in applies instead.
 */
const MAX_TIMEOUT_MS = 60 * 60 * 1000;

export function createProviderFetchFromEnv(
  options: ProviderFetchOptions = {},
): typeof fetch {
  const config = resolveProviderTransportConfig(options.env ?? process.env, options.timeouts);
  const baseFetch = options.fetchImpl ?? (undiciFetch as unknown as typeof fetch);
  const directDispatcher = new Agent({
    connect: { timeout: config.connectTimeoutMs },
    headersTimeout: config.headersTimeoutMs,
    bodyTimeout: config.bodyTimeoutMs,
  });
  const proxyDispatcher = config.proxyUrl
    ? new ProxyAgent({
        uri: config.proxyUrl,
        connect: { timeout: config.connectTimeoutMs },
        headersTimeout: config.headersTimeoutMs,
        bodyTimeout: config.bodyTimeoutMs,
      })
    : undefined;

  return (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = getRequestUrl(input);
    const decision = resolveTransportDecision(url.hostname, config, Boolean(proxyDispatcher));
    const dispatcher = decision.mode === "proxy" ? proxyDispatcher! : directDispatcher;
    if (config.diagnosticsEnabled) {
      console.error(renderProviderTransportDiagnostic(url, decision, config));
    }
    return await baseFetch(input, {
      ...(init ?? {}),
      dispatcher,
    } as RequestInit & { dispatcher: Agent | ProxyAgent });
  }) as typeof fetch;
}

/**
 * A transport that signs each request before it is sent.
 *
 * The signer runs here because this is where a request exists in full: the
 * method, the final URL, the headers and the serialized body are all in hand one
 * line before dispatch, and a signature covers all four. A credential resolved
 * when the session is built cannot see the body, and the body is most of what is
 * being signed.
 *
 * The signed headers are merged over the caller's, so a signer can add to the
 * request without having to reproduce what the caller already decided.
 */
export function withRequestSigner(base: typeof fetch, signer: RequestSigner): typeof fetch {
  return (async (input: RequestInfo | URL, init?: RequestInit) => {
    const method = (init?.method ?? "GET").toUpperCase();
    const url = String(getRequestUrl(input));
    const headers = headerRecord(init?.headers);
    const body = typeof init?.body === "string" ? init.body : undefined;
    const signed = await signer({
      url,
      method,
      headers,
      ...(body !== undefined ? { body } : {}),
    });
    // An absent entry is not a header: a signer with nothing to add for an
    // optional field says so by leaving it out, and sending the name with no
    // value would be a header the service reads as empty.
    const merged: Record<string, string> = { ...headers };
    for (const [name, value] of Object.entries(signed)) {
      if (value !== undefined) merged[name] = value;
    }
    return await base(input, { ...(init ?? {}), headers: merged });
  }) as typeof fetch;
}

/** The request headers as a plain record, whichever of the three shapes they arrive in. */
function headerRecord(headers: HeadersInit | undefined): Record<string, string> {
  if (!headers) return {};
  if (Array.isArray(headers)) return Object.fromEntries(headers);
  if (headers instanceof Headers) {
    const record: Record<string, string> = {};
    headers.forEach((value, name) => {
      record[name] = value;
    });
    return record;
  }
  return { ...(headers as Record<string, string>) };
}

/**
 * The fetch every provider request goes through, reused across calls.
 *
 * Reused rather than rebuilt because the wrapper holds an undici dispatcher: a
 * session that made a new one per prompt would accumulate connections nobody
 * closes. Keyed on the three timeouts, so a configuration change produces a new
 * wrapper instead of silently keeping the old deadlines.
 *
 * Takes the timeouts rather than the configuration, because this layer does not
 * import the config layer — the caller that has both does the extraction.
 */
let cachedProviderFetch: { readonly key: string; readonly fetch: typeof fetch } | undefined;

export function providerFetchFromTimeouts(
  timeouts: ProviderTimeoutOverrides = {},
): typeof fetch {
  const resolved = resolveProviderTimeouts(timeouts);
  // Keyed on the values actually in force, not on the raw fields. Keying the raw
  // fields made the key ambiguous — `1/2` as one value and `1` plus `2/` as two
  // both rendered `1/2//` — and, on the reload path this cache exists for, a
  // string `"6000"` was dropped by the guard and then keyed identically to the
  // number `6000`, so a reload served the old wrapper with the old deadline. That
  // is the one thing the comment above promises cannot happen.
  const key = JSON.stringify([resolved.connectTimeoutMs, resolved.headersTimeoutMs, resolved.bodyTimeoutMs]);
  if (cachedProviderFetch?.key === key) return cachedProviderFetch.fetch;
  const fetchImpl = createProviderFetchFromEnv({ timeouts: resolved });
  cachedProviderFetch = { key, fetch: fetchImpl };
  return fetchImpl;
}

/**
 * The deadlines a request will actually run with, each one validated.
 *
 * Exported so the memo key and the transport are built from the same resolved
 * numbers rather than from the caller's raw input.
 */
export function resolveProviderTimeouts(
  timeouts: ProviderTimeoutOverrides = {},
): ProviderTimeoutOverrides {
  return {
    connectTimeoutMs: positiveOr(timeouts.connectTimeoutMs, DEFAULT_CONNECT_TIMEOUT_MS),
    headersTimeoutMs: positiveOr(timeouts.headersTimeoutMs, DEFAULT_HEADERS_TIMEOUT_MS),
    bodyTimeoutMs: positiveOr(timeouts.bodyTimeoutMs, DEFAULT_BODY_TIMEOUT_MS),
  };
}

/**
 * The timeouts a configuration object states, if any.
 *
 * Structural rather than typed against the config module, so this layer stays
 * independent of it: any object carrying these three optional numbers works.
 */
export function providerTimeoutsFrom(config: {
  readonly providerConnectTimeoutMs?: number;
  readonly providerHeadersTimeoutMs?: number;
  readonly providerBodyTimeoutMs?: number;
} | undefined): ProviderTimeoutOverrides {
  if (!config) return {};
  return {
    ...(config.providerConnectTimeoutMs !== undefined
      ? { connectTimeoutMs: config.providerConnectTimeoutMs }
      : {}),
    ...(config.providerHeadersTimeoutMs !== undefined
      ? { headersTimeoutMs: config.providerHeadersTimeoutMs }
      : {}),
    ...(config.providerBodyTimeoutMs !== undefined
      ? { bodyTimeoutMs: config.providerBodyTimeoutMs }
      : {}),
  };
}

/**
 * The transport for a run, from the configuration it was started with.
 *
 * Six call sites wrote `providerFetchFromTimeouts(providerTimeoutsFrom(config))`
 * themselves. Composing it here means a run's deadline is decided in one place,
 * and a caller that has a configuration does not have to know that two functions
 * are involved.
 */
export function providerFetchFor(config: {
  readonly providerConnectTimeoutMs?: number;
  readonly providerHeadersTimeoutMs?: number;
  readonly providerBodyTimeoutMs?: number;
} | undefined): typeof fetch {
  return providerFetchFromTimeouts(providerTimeoutsFrom(config));
}

/**
 * The transport for a run, with the endpoint's own signing applied.
 *
 * The endpoint decides how its requests are authenticated, and for two of them
 * that cannot be a constant: a signature covers the body, and a bearer token
 * expires. Both are computed here, one line before dispatch, because this is the
 * only place a request exists whole.
 *
 * The signer is built on the first request rather than when this is called, so
 * that constructing a transport stays a synchronous act. Building one may read a
 * credential file or obtain a token, and neither is work that should happen to a
 * session that never makes a request. It is built once: the signer is what is per
 * request, and a token that expires is the signer's business, not this one's.
 */
export function providerFetchForEndpoint(
  config: Parameters<typeof providerFetchFor>[0],
  endpoint: string | undefined,
  shapeFor: (kind: string | undefined) => { readonly signer?: () => Promise<RequestSigner | undefined> },
  admission?: Admission,
  beforeDispatch?: (init?: RequestInit) => void,
): typeof fetch {
  const signer = shapeFor(endpoint).signer;
  const configured = providerFetchFor(config);
  const base = admittedFetch((input, init) => {
    init?.signal?.throwIfAborted();
    beforeDispatch?.(init);
    return configured(input, init);
  }, admission);
  if (!signer) return base;

  let built: RequestSigner | undefined;
  let building: Promise<RequestSigner | undefined> | undefined;
  return admittedFetch(withRequestSigner(base, async (request) => {
    building ??= signer();
    built ??= await building;
    return built ? await built(request) : {};
  }), admission);
}

export function resolveProviderTransportConfig(
  env: ProviderFetchEnvironment = process.env,
  timeouts: ProviderTimeoutOverrides = {},
): ProviderTransportConfig {
  return {
    proxyUrl: resolveProxyUrl(env),
    noProxy: parseNoProxy(
      env.CHEERS_PROVIDER_NO_PROXY ?? env.NO_PROXY ?? env.no_proxy,
    ),
    diagnosticsEnabled: isTruthy(env.CHEERS_PROVIDER_TRANSPORT_DIAGNOSTICS),
    connectTimeoutMs: parsePositiveInteger(
      env.CHEERS_PROVIDER_CONNECT_TIMEOUT_MS,
      positiveOr(timeouts.connectTimeoutMs, DEFAULT_CONNECT_TIMEOUT_MS),
    ),
    headersTimeoutMs: parsePositiveInteger(
      env.CHEERS_PROVIDER_HEADERS_TIMEOUT_MS,
      positiveOr(timeouts.headersTimeoutMs, DEFAULT_HEADERS_TIMEOUT_MS),
    ),
    bodyTimeoutMs: parsePositiveInteger(
      env.CHEERS_PROVIDER_BODY_TIMEOUT_MS,
      positiveOr(timeouts.bodyTimeoutMs, DEFAULT_BODY_TIMEOUT_MS),
    ),
  };
}

/**
 * A configured deadline, or the built-in one when it is not usable.
 *
 * A zero or negative value is treated as "not stated" rather than "no deadline",
 * which is what the environment variables already do and what a reader expects
 * from a field named in milliseconds. Silently disabling the deadline on a `0`
 * would turn a typo into the exact hang this exists to prevent.
 *
 * Three values that look usable are not, and each used to pass through:
 *
 * - A string. The config loader interpolates `${VAR}`, so a number written that
 *   way arrives as text and was discarded, leaving the built-in deadline in force
 *   with nothing to say so. It is coerced now, because the intent is unambiguous.
 * - A fraction. undici requires an integer and throws on anything else, so one
 *   fractional field failed every request in the session and surfaced only as
 *   "fetch failed".
 * - An absurdly large number. A deadline of 20,000,000,000 ms never fires, which
 *   is the same as having none — the outcome the paragraph above rejects.
 */
function positiveOr(value: number | undefined, fallback: number): number {
  const numeric = typeof value === "string" ? Number(value) : value;
  if (numeric === undefined || !Number.isFinite(numeric)) return fallback;
  if (!Number.isInteger(numeric)) return fallback;
  if (numeric <= 0 || numeric > MAX_TIMEOUT_MS) return fallback;
  return numeric;
}

export interface ProviderTransportDecision {
  readonly mode: "direct" | "proxy";
  readonly proxyConfigured: boolean;
  readonly noProxyMatched: boolean;
}

export function resolveTransportDecision(
  hostname: string,
  config: Pick<ProviderTransportConfig, "proxyUrl" | "noProxy">,
  proxyDispatcherAvailable = Boolean(config.proxyUrl),
): ProviderTransportDecision {
  const noProxyMatched = matchesNoProxy(hostname, config.noProxy);
  const proxyConfigured = Boolean(config.proxyUrl) && proxyDispatcherAvailable;
  return {
    mode: proxyConfigured && !noProxyMatched ? "proxy" : "direct",
    proxyConfigured,
    noProxyMatched,
  };
}

function resolveProxyUrl(env: ProviderFetchEnvironment): string | undefined {
  const explicit = normalizeText(env.CHEERS_PROVIDER_PROXY);
  if (!explicit) {
    return undefined;
  }
  if (explicit.toLowerCase() === "env") {
    return normalizeText(
      env.HTTPS_PROXY ?? env.https_proxy ?? env.HTTP_PROXY ?? env.http_proxy,
    );
  }
  if (explicit.toLowerCase() === "off" || explicit.toLowerCase() === "none") {
    return undefined;
  }
  return explicit;
}

function parseNoProxy(value?: string): readonly string[] {
  return (value ?? "")
    .split(",")
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);
}

function matchesNoProxy(hostname: string, entries: readonly string[]): boolean {
  const host = hostname.toLowerCase();
  for (const entry of entries) {
    if (entry === "*") {
      return true;
    }
    if (entry.startsWith("*.")) {
      const suffix = entry.slice(1);
      if (host.endsWith(suffix)) {
        return true;
      }
      continue;
    }
    if (entry.startsWith(".")) {
      if (host === entry.slice(1) || host.endsWith(entry)) {
        return true;
      }
      continue;
    }
    if (host === entry) {
      return true;
    }
  }
  return false;
}

function getRequestUrl(input: RequestInfo | URL): URL {
  if (input instanceof URL) {
    return input;
  }
  if (typeof input === "string") {
    return new URL(input);
  }
  return new URL(input.url);
}

function parsePositiveInteger(value: string | undefined, fallback: number): number {
  const parsed = Number.parseInt(value ?? "", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function renderProviderTransportDiagnostic(
  url: URL,
  decision: ProviderTransportDecision,
  config: ProviderTransportConfig,
): string {
  return [
    "[provider-transport]",
    `host=${url.hostname}`,
    `mode=${decision.mode}`,
    `proxyConfigured=${decision.proxyConfigured}`,
    `noProxyMatched=${decision.noProxyMatched}`,
    `connectTimeoutMs=${config.connectTimeoutMs}`,
    `headersTimeoutMs=${config.headersTimeoutMs}`,
    `bodyTimeoutMs=${config.bodyTimeoutMs}`,
  ].join(" ");
}

function isTruthy(value?: string): boolean {
  const normalized = value?.trim().toLowerCase();
  return normalized === "1" || normalized === "true" || normalized === "yes";
}

function normalizeText(value?: string): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}
