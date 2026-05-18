import { sanitizeBrowserText } from "../context/browserCapabilityModel.js";
import { parseBrowserNetworkTarget } from "../context/browserNetworkAllowlist.js";
import type { BrowserPublicReadOnlyWebMethod } from "../context/browserPublicReadOnlyWebManifest.js";

export const PUBLIC_WEB_SMOKE_ENABLE_ENV = "PRIVATE_AGENTS_ENABLE_PUBLIC_WEB_SMOKE";
export const PUBLIC_WEB_SMOKE_URL_ENV = "PRIVATE_AGENTS_PUBLIC_WEB_SMOKE_URL";
export const PUBLIC_WEB_SMOKE_METHOD_ENV = "PRIVATE_AGENTS_PUBLIC_WEB_SMOKE_METHOD";
export const PUBLIC_WEB_SMOKE_TIMEOUT_ENV = "PRIVATE_AGENTS_PUBLIC_WEB_SMOKE_TIMEOUT_MS";
export const PUBLIC_WEB_SMOKE_BYTE_BUDGET_ENV = "PRIVATE_AGENTS_PUBLIC_WEB_SMOKE_BYTE_BUDGET";

export type BrowserPublicReadOnlyWebSmokeConfigStatus = "disabled" | "ready" | "blocked";

export interface BrowserPublicReadOnlyWebSmokeConfig {
  readonly status: BrowserPublicReadOnlyWebSmokeConfigStatus;
  readonly enabled: boolean;
  readonly url?: string;
  readonly origin?: string;
  readonly method: BrowserPublicReadOnlyWebMethod;
  readonly timeoutMs: number;
  readonly byteBudget: number;
  readonly reason: string;
  readonly warnings: readonly string[];
  readonly redactions: readonly string[];
  readonly evidence: readonly string[];
}

export function parseBrowserPublicReadOnlyWebSmokeConfig(input: {
  readonly env?: Readonly<Record<string, string | undefined>>;
} = {}): BrowserPublicReadOnlyWebSmokeConfig {
  const env = input.env ?? process.env;
  if (env[PUBLIC_WEB_SMOKE_ENABLE_ENV] !== "1") {
    return config("disabled", {
      enabled: false,
      reason: "Public read-only web smoke is disabled by default.",
      evidence: ["browser-public-readonly-web-smoke-config:disabled-by-default"],
      warnings: ["public-web-smoke-skipped"],
    });
  }
  const method = parseMethod(env[PUBLIC_WEB_SMOKE_METHOD_ENV]);
  if (!method) {
    return config("blocked", {
      enabled: true,
      method: "HEAD",
      reason: "Public read-only web smoke method must be GET or HEAD.",
      evidence: ["browser-public-readonly-web-smoke-config:unsupported-method"],
      warnings: ["public-web-smoke-blocked"],
    });
  }
  const rawUrl = env[PUBLIC_WEB_SMOKE_URL_ENV];
  if (!rawUrl) {
    return config("blocked", {
      enabled: true,
      method,
      reason: "Public read-only web smoke requires an explicit URL.",
      evidence: ["browser-public-readonly-web-smoke-config:missing-url"],
      warnings: ["public-web-smoke-blocked"],
    });
  }
  const target = parseBrowserNetworkTarget(rawUrl);
  const safeUrl = target.hasCredentials ? "credential-url-redacted" : sanitizeBrowserText(rawUrl, 220);
  if (target.hasCredentials) {
    return config("blocked", {
      enabled: true,
      url: safeUrl,
      origin: "credential-url-redacted",
      method,
      reason: "Credential-bearing smoke URLs are blocked.",
      evidence: ["browser-public-readonly-web-smoke-config:credential-url"],
      warnings: ["public-web-smoke-blocked"],
      redactions: ["url-credentials"],
    });
  }
  if (target.parseError || target.scheme !== "https") {
    return config("blocked", {
      enabled: true,
      url: safeUrl,
      origin: target.origin ?? target.scheme ?? "invalid-target",
      method,
      reason: "Public read-only web smoke URL must be valid HTTPS.",
      evidence: ["browser-public-readonly-web-smoke-config:unsupported-url"],
      warnings: ["public-web-smoke-blocked"],
    });
  }
  if (target.hostname && isPrivateNetworkHost(target.hostname)) {
    return config("blocked", {
      enabled: true,
      url: safeUrl,
      origin: target.origin,
      method,
      reason: "Public read-only web smoke cannot target private or local network origins.",
      evidence: ["browser-public-readonly-web-smoke-config:private-url"],
      warnings: ["public-web-smoke-blocked"],
    });
  }
  return config("ready", {
    enabled: true,
    url: safeUrl,
    origin: target.origin,
    method,
    timeoutMs: parseBoundedInteger(env[PUBLIC_WEB_SMOKE_TIMEOUT_ENV], 50, 15_000, 1500),
    byteBudget: parseBoundedInteger(env[PUBLIC_WEB_SMOKE_BYTE_BUDGET_ENV], 128, 65_536, 4096),
    reason: "Public read-only web smoke is explicitly enabled.",
    evidence: ["browser-public-readonly-web-smoke-config:ready"],
  });
}

function config(
  status: BrowserPublicReadOnlyWebSmokeConfigStatus,
  input: Partial<BrowserPublicReadOnlyWebSmokeConfig> & {
    readonly enabled: boolean;
    readonly reason: string;
  },
): BrowserPublicReadOnlyWebSmokeConfig {
  return {
    status,
    enabled: input.enabled,
    url: input.url,
    origin: input.origin,
    method: input.method ?? "HEAD",
    timeoutMs: input.timeoutMs ?? 1500,
    byteBudget: input.byteBudget ?? 4096,
    reason: input.reason,
    warnings: unique(input.warnings ?? []),
    redactions: unique(input.redactions ?? []),
    evidence: [
      ...(input.evidence ?? []),
      `browser-public-readonly-web-smoke-config:${status}`,
      "browser-public-readonly-web-smoke-config:no-network-call",
    ],
  };
}

function parseMethod(value: string | undefined): BrowserPublicReadOnlyWebMethod | undefined {
  const method = (value ?? "HEAD").toUpperCase();
  return method === "GET" || method === "HEAD" ? method : undefined;
}

function parseBoundedInteger(
  value: string | undefined,
  min: number,
  max: number,
  fallback: number,
): number {
  if (!value) {
    return fallback;
  }
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= min && parsed <= max ? parsed : fallback;
}

function isPrivateNetworkHost(hostname: string): boolean {
  return hostname === "localhost" || hostname.endsWith(".localhost") || hostname.endsWith(".local") ||
    hostname === "::1" || hostname.startsWith("127.") || hostname.startsWith("10.") ||
    hostname.startsWith("192.168.") || /^172\.(1[6-9]|2\d|3[0-1])\./.test(hostname);
}

function unique(values: readonly string[]): readonly string[] {
  return Array.from(new Set(values.filter((value) => value.trim().length > 0)));
}
