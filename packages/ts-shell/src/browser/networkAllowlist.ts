import { isBlockedHost } from "../core/security/egressGuard.js";
import { sanitizeBrowserText } from "./capabilityModel.js";
import type { BrowserExecutionRequest } from "./executionContract.js";

export interface BrowserAllowedOrigin {
  readonly origin: string;
  readonly mode: "fake-test" | "explicit-local" | "future-runtime";
  readonly label?: string;
}

export interface BrowserNetworkAllowlist {
  readonly allowedOrigins: readonly BrowserAllowedOrigin[];
  readonly allowPrivateNetworkInTest: boolean;
  readonly evidence: readonly string[];
}

export interface BrowserNetworkTarget {
  readonly rawUrl?: string;
  readonly origin?: string;
  readonly scheme?: string;
  readonly hostname?: string;
  readonly hasCredentials: boolean;
  readonly parseError?: string;
}

export type BrowserNetworkDecisionStatus =
  | "allowed"
  | "blocked-no-allowlist"
  | "blocked-origin"
  | "blocked-scheme"
  | "blocked-private-network"
  | "blocked-credential-url"
  | "confirmation-required";

export interface BrowserNetworkDecision {
  readonly status: BrowserNetworkDecisionStatus;
  readonly target: BrowserNetworkTarget;
  readonly reason: string;
  readonly nextAction: string;
  readonly evidence: readonly string[];
}

export function createBrowserNetworkAllowlist(
  input: Partial<BrowserNetworkAllowlist> = {},
): BrowserNetworkAllowlist {
  return {
    allowedOrigins: input.allowedOrigins ?? [],
    allowPrivateNetworkInTest: input.allowPrivateNetworkInTest ?? false,
    evidence: [
      ...(input.evidence ?? []),
      "browser-network-allowlist:deterministic",
      "browser-network-allowlist:no-network-call",
      "browser-network-allowlist:default-deny",
    ],
  };
}

export function normalizeBrowserAllowedOrigin(origin: string): string | undefined {
  try {
    const parsed = new URL(origin);
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
      return undefined;
    }
    return parsed.origin.toLowerCase();
  } catch {
    return undefined;
  }
}

export function browserNetworkTargetFromRequest(
  request: BrowserExecutionRequest,
): BrowserNetworkTarget {
  if (request.actionKind !== "navigate") {
    const target = request.action.url ?? request.action.target ?? request.action.extractionGoal;
    if (target?.startsWith("http://") || target?.startsWith("https://")) {
      return parseBrowserNetworkTarget(target);
    }
    return {
      rawUrl: request.action.url,
      hasCredentials: false,
    };
  }
  return parseBrowserNetworkTarget(request.action.url);
}

export function parseBrowserNetworkTarget(rawUrl: string | undefined): BrowserNetworkTarget {
  if (!rawUrl) {
    return {
      rawUrl,
      hasCredentials: false,
      parseError: "missing-url",
    };
  }
  try {
    const parsed = new URL(rawUrl);
    return {
      rawUrl: sanitizeBrowserText(rawUrl),
      origin: parsed.origin.toLowerCase(),
      scheme: parsed.protocol.replace(":", "").toLowerCase(),
      hostname: parsed.hostname.toLowerCase(),
      hasCredentials: parsed.username.length > 0 || parsed.password.length > 0,
    };
  } catch {
    return {
      rawUrl: sanitizeBrowserText(rawUrl),
      hasCredentials: false,
      parseError: "invalid-url",
    };
  }
}

export function decideBrowserNetworkAllowlist(input: {
  readonly request: BrowserExecutionRequest;
  readonly allowlist?: BrowserNetworkAllowlist;
}): BrowserNetworkDecision {
  const allowlist = input.allowlist ?? createBrowserNetworkAllowlist();
  const target = browserNetworkTargetFromRequest(input.request);
  if (
    input.request.actionKind !== "navigate" &&
    !(
      target.rawUrl?.startsWith("http://") ||
      target.rawUrl?.startsWith("https://")
    )
  ) {
    return decision("allowed", target, allowlist, {
      reason: "No new network navigation target is required for this read-only action.",
      nextAction: "Continue with sandbox and evidence preflight.",
    });
  }
  if (target.parseError) {
    return decision("blocked-origin", target, allowlist, {
      reason: `Navigation target is invalid: ${target.parseError}.`,
      nextAction: "Provide a valid https URL that is explicitly allowlisted.",
    });
  }
  if (target.hasCredentials) {
    return decision("blocked-credential-url", target, allowlist, {
      reason: "Credential-bearing URLs are blocked.",
      nextAction: "Remove credentials from the URL and use explicit auth policy in a future route.",
    });
  }
  if (!target.scheme || !["https", "http"].includes(target.scheme)) {
    if (
      (
        input.request.mode === "local-fixture" ||
        input.request.mode === "playwright-local" ||
        input.request.mode === "test-local" ||
        input.request.mode === "external-local"
      ) &&
      target.scheme === "local-fixture"
    ) {
      return decision("allowed", target, allowlist, {
        reason: "Local fixture navigation does not require external network access.",
        nextAction: "Continue only if sandbox authority also permits local fixture execution.",
      });
    }
    return decision("blocked-scheme", target, allowlist, {
      reason: `URL scheme ${target.scheme ?? "(unknown)"} is not allowed.`,
      nextAction: "Use an explicitly allowlisted https origin.",
    });
  }
  if (
    target.scheme === "http" &&
    target.hostname &&
    isPrivateNetworkHost(target.hostname) &&
    allowlist.allowPrivateNetworkInTest &&
    allowlist.allowedOrigins.some(
      (allowed) => normalizeBrowserAllowedOrigin(allowed.origin) === target.origin,
    )
  ) {
    return decision("allowed", target, allowlist, {
      reason: "HTTP loopback origin is explicitly allowlisted for controlled test mode.",
      nextAction: "Continue only if confirmation and sandbox authority also pass.",
    });
  }
  if (target.scheme !== "https") {
    return decision("blocked-scheme", target, allowlist, {
      reason: "Only https origins are allowed by the initial browser network policy.",
      nextAction: "Use an explicitly allowlisted https origin.",
    });
  }
  if (target.hostname && isPrivateNetworkHost(target.hostname) && !allowlist.allowPrivateNetworkInTest) {
    return decision("blocked-private-network", target, allowlist, {
      reason: "Localhost and private-network browser targets are blocked by default.",
      nextAction: "Use a public https test origin or explicitly enable private-network test mode.",
    });
  }
  if (allowlist.allowedOrigins.length === 0) {
    return decision("blocked-no-allowlist", target, allowlist, {
      reason: "No browser network allowlist was provided.",
      nextAction: "Add an explicit https origin to the route-scoped allowlist.",
    });
  }
  const matched = allowlist.allowedOrigins.some(
    (allowed) => normalizeBrowserAllowedOrigin(allowed.origin) === target.origin,
  );
  if (!matched) {
    return decision("blocked-origin", target, allowlist, {
      reason: `Origin ${target.origin ?? "(unknown)"} is not in the browser network allowlist.`,
      nextAction: "Add the exact origin to the allowlist or keep this as dry-run.",
    });
  }
  return decision("allowed", target, allowlist, {
    reason: "Navigation origin is explicitly allowlisted.",
    nextAction: "Continue only if confirmation and sandbox authority also pass.",
  });
}

/**
 * Whether `hostname` names a host on the private or link-local network.
 *
 * This is the SSRF guard: every caller uses it to refuse a target before any
 * request is made, so a rule that exists in one copy and not another is a
 * bypass in the copy that lacks it. It was previously duplicated verbatim in
 * `publicReadOnlyWebPolicy.ts`, `publicReadOnlyWebManifest.ts` and
 * `core/harness/browserPublicReadOnlyWebSmokeConfig.ts`, and a second,
 * independently written copy lived in `networkEgressGuard.ts` as
 * `isPrivateOrigin`; that one now delegates here.
 *
 * The link-local range matters as much as the RFC 1918 ranges: 169.254.0.0/16
 * is where cloud providers publish instance metadata, so on AWS, Alibaba Cloud
 * and others, `169.254.169.254` returns the instance's temporary credentials to
 * anything that can reach it. A private-network check that omits it leaves the
 * metadata endpoint reachable whenever an allowlist happens to name it.
 *
 * Scope, stated so the next reader does not over-trust it: this covers loopback,
 * the RFC 1918 ranges, link-local, `.local` and `.localhost`. It does NOT cover
 * IPv6 link-local (`fe80::/10`), carrier-grade NAT (`100.64.0.0/10`), `0.0.0.0`,
 * or DNS rebinding, and it does not resolve names - a public hostname that
 * resolves to a private address is not caught here.
 *
 * Note that the IPv4 metadata address is covered but the IPv6 one is not:
 * `fd00:ec2::254` is the IPv6 equivalent of `169.254.169.254` on AWS, and it
 * reads as public here. The IPv4 range was added because a probe found both
 * guards letting it through; the IPv6 address was left uncovered deliberately
 * rather than accidentally, because covering it means range-parsing IPv6 and
 * that is a larger change than this fix. A caller that must be safe against the
 * metadata endpoint should not treat this guard as sufficient on its own.
 */
export function isPrivateNetworkHost(hostname: string): boolean {
  // Delegates to the shared guard rather than keeping a second copy.
  //
  // The list is a superset of what this function used to hold: it adds CGNAT and
  // the IPv6 ranges, which this one never covered, so every host that was
  // refused here is still refused here. That direction matters — this function
  // decides whether a navigation is blocked, and a shared guard narrower than
  // this one would turn a refusal into an allowance.
  //
  // The ranges this used to test itself are gone rather than left beside the
  // call: a rule stated twice is a rule that can be edited once.
  return isBlockedHost(hostname);
}

function decision(
  status: BrowserNetworkDecisionStatus,
  target: BrowserNetworkTarget,
  allowlist: BrowserNetworkAllowlist,
  input: {
    readonly reason: string;
    readonly nextAction: string;
  },
): BrowserNetworkDecision {
  return {
    status,
    target,
    reason: input.reason,
    nextAction: input.nextAction,
    evidence: [
      ...allowlist.evidence,
      `browser-network-allowlist:decision:${status}`,
      "browser-network-allowlist:no-fetch",
    ],
  };
}
