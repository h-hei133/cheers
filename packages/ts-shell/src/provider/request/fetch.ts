import { Agent, ProxyAgent, fetch as undiciFetch } from "undici";

export interface ProviderFetchEnvironment {
  readonly PRIVATE_AGENTS_PROVIDER_PROXY?: string;
  readonly PRIVATE_AGENTS_PROVIDER_NO_PROXY?: string;
  readonly PRIVATE_AGENTS_PROVIDER_TRANSPORT_DIAGNOSTICS?: string;
  readonly PRIVATE_AGENTS_PROVIDER_CONNECT_TIMEOUT_MS?: string;
  readonly PRIVATE_AGENTS_PROVIDER_HEADERS_TIMEOUT_MS?: string;
  readonly PRIVATE_AGENTS_PROVIDER_BODY_TIMEOUT_MS?: string;
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

export function createProviderFetchFromEnv(
  options: ProviderFetchOptions = {},
): typeof fetch {
  const config = resolveProviderTransportConfig(options.env ?? process.env);
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

export function resolveProviderTransportConfig(
  env: ProviderFetchEnvironment = process.env,
): ProviderTransportConfig {
  return {
    proxyUrl: resolveProxyUrl(env),
    noProxy: parseNoProxy(
      env.PRIVATE_AGENTS_PROVIDER_NO_PROXY ?? env.NO_PROXY ?? env.no_proxy,
    ),
    diagnosticsEnabled: isTruthy(env.PRIVATE_AGENTS_PROVIDER_TRANSPORT_DIAGNOSTICS),
    connectTimeoutMs: parsePositiveInteger(
      env.PRIVATE_AGENTS_PROVIDER_CONNECT_TIMEOUT_MS,
      DEFAULT_CONNECT_TIMEOUT_MS,
    ),
    headersTimeoutMs: parsePositiveInteger(
      env.PRIVATE_AGENTS_PROVIDER_HEADERS_TIMEOUT_MS,
      DEFAULT_HEADERS_TIMEOUT_MS,
    ),
    bodyTimeoutMs: parsePositiveInteger(
      env.PRIVATE_AGENTS_PROVIDER_BODY_TIMEOUT_MS,
      DEFAULT_BODY_TIMEOUT_MS,
    ),
  };
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
  const explicit = normalizeText(env.PRIVATE_AGENTS_PROVIDER_PROXY);
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
