import type { BrowserExecutionConfirmationRecord } from "./browserExecutionConfirmation.js";
import type { BrowserExecutionRequest } from "./browserExecutionContract.js";
import { parseBrowserNetworkTarget } from "./browserNetworkAllowlist.js";
import { decideBrowserNetworkEgress, type BrowserNetworkEgressDecision } from "./browserNetworkEgressGuard.js";
import type {
  BrowserPublicReadOnlyWebManifest,
  BrowserPublicReadOnlyWebManifestLoadResult,
  BrowserPublicReadOnlyWebMethod,
} from "./browserPublicReadOnlyWebManifest.js";

export type BrowserPublicReadOnlyWebPolicyStatus =
  | "public-readonly-allowed"
  | "blocked-no-manifest"
  | "blocked-no-allowlist"
  | "blocked-no-confirmation"
  | "blocked-expired-confirmation"
  | "blocked-origin-mismatch"
  | "blocked-private-network"
  | "blocked-credential-url"
  | "blocked-unsupported-scheme"
  | "blocked-sensitive-action"
  | "blocked-method"
  | "blocked-output-budget"
  | "blocked-redirect-escape"
  | "blocked-client-unavailable";

export interface BrowserPublicReadOnlyWebPolicyDecision {
  readonly status: BrowserPublicReadOnlyWebPolicyStatus;
  readonly allowed: boolean;
  readonly targetUrl: string;
  readonly targetOrigin: string;
  readonly method: BrowserPublicReadOnlyWebMethod;
  readonly actionKind: BrowserExecutionRequest["actionKind"];
  readonly publicNetwork: boolean;
  readonly egressDecision?: BrowserNetworkEgressDecision;
  readonly reason: string;
  readonly warnings: readonly string[];
  readonly redactions: readonly string[];
  readonly nextAction: string;
  readonly evidence: readonly string[];
}

export function decideBrowserPublicReadOnlyWebPolicy(input: {
  readonly request: BrowserExecutionRequest;
  readonly manifestLoad?: BrowserPublicReadOnlyWebManifestLoadResult;
  readonly confirmations?: readonly BrowserExecutionConfirmationRecord[];
  readonly method?: string;
  readonly redirectTarget?: string;
  readonly observedOutputBytes?: number;
  readonly clientAvailable?: boolean;
}): BrowserPublicReadOnlyWebPolicyDecision {
  const target = parseBrowserNetworkTarget(targetUrlFromRequest(input.request));
  const safeTargetUrl = target.hasCredentials ? "credential-url-redacted" : target.rawUrl ?? "invalid-target";
  const targetOrigin = target.hasCredentials ? "credential-url-redacted" : target.origin ?? target.scheme ?? "invalid-target";
  const method = normalizeMethod(input.method);
  const manifest = input.manifestLoad?.status === "valid" ? input.manifestLoad.manifest : undefined;
  if (input.manifestLoad?.status !== "valid" || !manifest) {
    return decision("blocked-no-manifest", safeTargetUrl, targetOrigin, method, input.request, "Public read-only web execution requires an explicit manifest.", undefined, ["missing-public-readonly-manifest"], [], "Provide a route-scoped public read-only manifest.");
  }
  if (!manifest.allowedPublicOrigins.length) {
    return decision("blocked-no-allowlist", safeTargetUrl, targetOrigin, method, input.request, "Public read-only web execution requires explicit allowed origins.", undefined, ["missing-public-allowlist"], [], "Add exact https origins to the manifest.");
  }
  if (!input.clientAvailable) {
    return decision("blocked-client-unavailable", safeTargetUrl, targetOrigin, method, input.request, "No public read-only HTTP client is available.", undefined, ["missing-public-readonly-client"], [], "Use an injected deterministic client for tests or the built-in client for explicit opt-in runs.");
  }
  if (!method || !manifest.allowedMethods.includes(method)) {
    return decision("blocked-method", safeTargetUrl, targetOrigin, method ?? "GET", input.request, "Public read-only web execution only allows GET and HEAD.", undefined, ["method-blocked"], [], "Use GET or HEAD.");
  }
  if (!manifest.allowedActionKinds.includes(input.request.actionKind as never) || isSensitive(input.request.actionKind)) {
    return decision("blocked-sensitive-action", safeTargetUrl, targetOrigin, method, input.request, "Only navigate, observe, and extract are allowed for public read-only web execution.", undefined, ["sensitive-browser-action"], [], "Keep write, auth, payment, upload, download, screenshot, and OCR actions blocked.");
  }
  if (target.hasCredentials) {
    return decision("blocked-credential-url", safeTargetUrl, targetOrigin, method, input.request, "Credential-bearing URLs are blocked.", undefined, ["credential-url"], ["url-credentials"], "Remove URL credentials.");
  }
  if (target.hostname && isPrivateNetworkHost(target.hostname)) {
    return decision("blocked-private-network", safeTargetUrl, targetOrigin, method, input.request, "Private/local origins are blocked for public read-only mode.", undefined, ["private-origin"], [], "Use public https origins only.");
  }
  if (target.parseError || target.scheme !== "https") {
    return decision("blocked-unsupported-scheme", safeTargetUrl, targetOrigin, method, input.request, "Public read-only web execution requires valid https URLs.", undefined, ["unsupported-scheme"], [], "Use an explicitly allowlisted https URL.");
  }
  const confirmation = input.confirmations?.find(
    (record) => record.kind === "network" && (!record.requestId || record.requestId === input.request.requestId),
  );
  if (confirmation?.status === "expired") {
    return decision("blocked-expired-confirmation", safeTargetUrl, targetOrigin, method, input.request, "Public read-only web confirmation is expired.", undefined, ["confirmation-expired"], [], "Refresh the explicit confirmation.");
  }
  if (confirmation?.status !== "confirmed") {
    return decision("blocked-no-confirmation", safeTargetUrl, targetOrigin, method, input.request, "Public read-only web execution requires explicit network confirmation.", undefined, ["missing-public-readonly-confirmation"], [], "Set explicit confirmation for this read-only request.");
  }
  const egressDecision = decideBrowserNetworkEgress({
    request: input.request,
    requestedUrl: safeTargetUrl,
    redirectTarget: input.redirectTarget,
    allowedOrigins: manifest.allowedPublicOrigins,
    networkMode: "public-readonly",
    outputBudgetBytes: manifest.responseByteBudget,
    observedOutputBytes: input.observedOutputBytes,
  });
  if (!egressDecision.allowed) {
    return decision(statusFromEgress(egressDecision.status), safeTargetUrl, targetOrigin, method, input.request, egressDecision.reason, egressDecision, egressDecision.warnings, egressDecision.redactions, egressDecision.nextAction);
  }
  return decision("public-readonly-allowed", safeTargetUrl, egressDecision.effectiveOrigin, method, input.request, "Public read-only web request is explicitly allowed.", egressDecision, [], [], "Execute a bounded read-only HTTP request.");
}

function statusFromEgress(status: BrowserNetworkEgressDecision["status"]): BrowserPublicReadOnlyWebPolicyStatus {
  if (status === "blocked-no-allowlist") return "blocked-no-allowlist";
  if (status === "blocked-origin-mismatch") return "blocked-origin-mismatch";
  if (status === "blocked-private-network") return "blocked-private-network";
  if (status === "blocked-credential-url") return "blocked-credential-url";
  if (status === "blocked-unsupported-scheme") return "blocked-unsupported-scheme";
  if (status === "blocked-sensitive-action") return "blocked-sensitive-action";
  if (status === "blocked-output-budget") return "blocked-output-budget";
  if (status === "blocked-redirect-escape") return "blocked-redirect-escape";
  return "blocked-origin-mismatch";
}

function decision(
  status: BrowserPublicReadOnlyWebPolicyStatus,
  targetUrl: string,
  targetOrigin: string,
  method: BrowserPublicReadOnlyWebMethod,
  request: BrowserExecutionRequest,
  reason: string,
  egressDecision: BrowserNetworkEgressDecision | undefined,
  warnings: readonly string[],
  redactions: readonly string[],
  nextAction: string,
): BrowserPublicReadOnlyWebPolicyDecision {
  return {
    status,
    allowed: status === "public-readonly-allowed",
    targetUrl,
    targetOrigin,
    method,
    actionKind: request.actionKind,
    publicNetwork: status === "public-readonly-allowed",
    egressDecision,
    reason,
    warnings: unique(warnings),
    redactions: unique(redactions),
    nextAction,
    evidence: [
      ...(egressDecision?.evidence ?? []),
      `browser-public-readonly-web-policy:${status}`,
      "browser-public-readonly-web-policy:no-browser-launch",
      "browser-public-readonly-web-policy:no-javascript",
      "browser-public-readonly-web-policy:no-cookies-auth",
      status === "public-readonly-allowed"
        ? "browser-public-readonly-web-policy:public-network-explicit"
        : "browser-public-readonly-web-policy:no-network-call",
    ],
  };
}

function targetUrlFromRequest(request: BrowserExecutionRequest): string | undefined {
  return request.action.url ?? request.action.target ?? request.action.extractionGoal;
}

function normalizeMethod(value: string | undefined): BrowserPublicReadOnlyWebMethod | undefined {
  const method = (value ?? "GET").toUpperCase();
  return method === "GET" || method === "HEAD" ? method : undefined;
}

function isSensitive(actionKind: BrowserExecutionRequest["actionKind"]): boolean {
  return !["navigate", "observe", "extract"].includes(actionKind);
}

function isPrivateNetworkHost(hostname: string): boolean {
  return hostname === "localhost" || hostname.endsWith(".localhost") || hostname.endsWith(".local") ||
    hostname === "::1" || hostname.startsWith("127.") || hostname.startsWith("10.") ||
    hostname.startsWith("192.168.") || /^172\.(1[6-9]|2\d|3[0-1])\./.test(hostname);
}

function unique(values: readonly string[]): readonly string[] {
  return Array.from(new Set(values.filter((value) => value.trim().length > 0)));
}
