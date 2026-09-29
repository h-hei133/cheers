import { blockedBrowserHostReason, classifyBlockedHost } from "../core/security/egressGuard.js";
import { normalizeBrowserAllowedOrigin } from "./networkAllowlist.js";

/**
 * What a browser navigation may reach, and how a user widens or narrows it.
 *
 * The defaults are the tool's own policy: public addresses and loopback are
 * reachable, everything else is not. Two environment settings change that, and
 * they are read once per call rather than cached, so a value set before the
 * session starts is in force for every navigation in it.
 *
 * Read plainly rather than parsed as a schema: both values are a list and a
 * switch, and a malformed entry drops that entry instead of failing the session,
 * which is what a user who mistyped one origin wants.
 */
export const BROWSER_ALLOWED_ORIGINS_ENV = "CHEERS_BROWSER_ALLOWED_ORIGINS";
export const BROWSER_ALLOW_PRIVATE_NETWORK_ENV = "CHEERS_BROWSER_ALLOW_PRIVATE_NETWORK";

export interface BrowserOriginPolicy {
  /**
   * Exact origins this session may reach. Empty means no narrowing: the policy's
   * own rules apply.
   */
  readonly allowedOrigins: readonly string[];
  /**
   * Whether RFC 1918 and CGNAT addresses are reachable.
   *
   * Off by default, and it is a separate switch from the allowlist because the
   * two say different things: an allowlist names hosts, while private-network
   * access is about a class of address. Reaching an internal development server
   * needs this, and needing it is a deliberate act.
   *
   * Loopback is unaffected — it is allowed without this — and so are metadata
   * and link-local addresses, which stay refused either way.
   */
  readonly allowPrivateNetwork: boolean;
}

export function readBrowserOriginPolicy(
  env: Readonly<Record<string, string | undefined>> = process.env,
): BrowserOriginPolicy {
  return {
    allowedOrigins: parseAllowedOrigins(env[BROWSER_ALLOWED_ORIGINS_ENV]),
    allowPrivateNetwork: env[BROWSER_ALLOW_PRIVATE_NETWORK_ENV] === "1",
  };
}

function parseAllowedOrigins(raw: string | undefined): readonly string[] {
  if (!raw) return [];
  const origins: string[] = [];
  for (const entry of raw.split(",")) {
    const normalized = normalizeBrowserAllowedOrigin(entry.trim());
    if (normalized) origins.push(normalized);
  }
  return origins;
}

/**
 * The host rule under a policy, or nothing when the host may be reached.
 *
 * The private-network switch is applied here rather than inside the shared
 * classifier, because it is this tool's decision and the fetcher must not inherit
 * it: `blockedHostReason` has no setting that makes a private address acceptable,
 * and should not grow one for a caller that will never want it.
 */
export function blockedUnderPolicy(
  hostname: string,
  policy: BrowserOriginPolicy,
): string | undefined {
  const blocked = blockedBrowserHostReason(hostname);
  if (!blocked) return undefined;
  if (policy.allowPrivateNetwork && classifyBlockedHost(hostname)?.class === "private") {
    return undefined;
  }
  return blocked;
}
