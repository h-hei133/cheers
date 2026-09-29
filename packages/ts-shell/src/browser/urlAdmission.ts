import { normalizeBrowserAllowedOrigin } from "./networkAllowlist.js";
import { blockedUnderPolicy, type BrowserOriginPolicy } from "./originPolicy.js";

/**
 * What a browser navigation may reach.
 *
 * The rule this enforces is the browser's own, not the web fetcher's: a local
 * page is what the tool is for, so loopback is allowed, while metadata,
 * private, and link-local addresses are refused. See `blockedBrowserHostReason`.
 *
 * Stated plainly because it is a policy and not a boundary: the guard is an
 * intention declaration and an auditable record of which outbound request was
 * meant. It is not the thing that keeps a compromised page from reaching a host,
 * since a shell command in the same session can already reach anything this
 * machine can reach.
 */

export type BrowserUrlRefusalCode =
  | "invalid-url"
  | "unsupported-scheme"
  | "credential-url"
  | "blocked-host"
  | "not-allowlisted";

export interface BrowserUrlRefusal {
  readonly code: BrowserUrlRefusalCode;
  readonly reason: string;
  readonly hostname: string;
  readonly nextAction: string;
}

export interface BrowserUrlAdmission {
  readonly allowed: boolean;
  readonly url: string;
  readonly hostname: string;
  readonly refusal?: BrowserUrlRefusal;
}

/**
 * Decide one URL, in the order the questions have to be asked.
 *
 * Scheme first, because a `file:` or `data:` URL has no hostname to judge and
 * would otherwise reach the host check with nothing to read. Credentials next,
 * because `https://user:pass@host/` sends a secret to whatever answers. Then the
 * host class. The allowlist is last and only when one was configured, so an
 * empty allowlist does not refuse everything by default — the policy's own rules
 * are the default, and an allowlist narrows them.
 *
 * What this does not do: resolve the hostname. A public name that resolves to a
 * private address is not caught here, and neither is a name whose resolution
 * changes between this check and the connection. The residual surface is the
 * same one `blockedHostReason` documents.
 */
export function admitBrowserUrl(
  rawUrl: string,
  policy: BrowserOriginPolicy = { allowedOrigins: [], allowPrivateNetwork: false },
): BrowserUrlAdmission {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    return refuse("invalid-url", rawUrl, "", `Not a valid URL: ${rawUrl}`, "Pass an absolute http or https URL.");
  }

  const scheme = parsed.protocol.replace(":", "").toLowerCase();
  if (scheme !== "http" && scheme !== "https") {
    return refuse(
      "unsupported-scheme",
      rawUrl,
      parsed.hostname,
      `The ${scheme}: scheme is not reachable by the browser tool.`,
      "Use an http or https URL.",
    );
  }

  if (parsed.username.length > 0 || parsed.password.length > 0) {
    return refuse(
      "credential-url",
      rawUrl,
      parsed.hostname,
      "The URL carries credentials, which would be sent to whatever answers.",
      "Remove the userinfo from the URL and authenticate through the page instead.",
    );
  }

  const blocked = blockedUnderPolicy(parsed.hostname, policy);
  if (blocked) {
    return refuse(
      "blocked-host",
      rawUrl,
      parsed.hostname,
      `${parsed.hostname} is a ${blocked}, and this tool refuses those.`,
      "Use a public address, or the local development server's loopback address.",
    );
  }

  // Normalized through the same function the allowlist uses, so a configured
  // origin and a visited URL compare as the same origin rather than as the same
  // string. A port written with a default (`https://host:443`) matches.
  if (policy.allowedOrigins.length > 0) {
    const origin = normalizeBrowserAllowedOrigin(parsed.origin) ?? parsed.origin.toLowerCase();
    if (!policy.allowedOrigins.includes(origin)) {
      return refuse(
        "not-allowlisted",
        rawUrl,
        parsed.hostname,
        `${origin} is not in the configured browser origin allowlist.`,
        `Add ${origin} to the allowlist, or clear the allowlist to fall back to the tool's own rules.`,
      );
    }
  }

  return { allowed: true, url: parsed.toString(), hostname: parsed.hostname };
}

function refuse(
  code: BrowserUrlRefusalCode,
  rawUrl: string,
  hostname: string,
  reason: string,
  nextAction: string,
): BrowserUrlAdmission {
  return {
    allowed: false,
    url: rawUrl,
    hostname,
    refusal: { code, reason, hostname, nextAction },
  };
}

/**
 * Whether a navigation that started at `requestedUrl` and ended at `finalUrl` is
 * still inside the rules.
 *
 * Exists because `page.goto` follows redirects internally: the URL the guard
 * checked is the first one, which is exactly the URL an attacker does not need
 * to control. A public page that answers `302` to `http://169.254.169.254/`
 * would otherwise be admitted on the strength of its own name.
 *
 * Same-origin hops are exempt: a site moving between its own paths is not the
 * case this guards, and re-deciding them would refuse a legitimate `/login`
 * redirect for no gain.
 */
export function admitBrowserRedirect(
  requestedUrl: string,
  finalUrl: string,
  policy: BrowserOriginPolicy = { allowedOrigins: [], allowPrivateNetwork: false },
): BrowserUrlAdmission {
  // Same-origin hops need no decision: a site moving between its own paths is
  // not the case this guards, and re-deciding would refuse a legitimate
  // `/login` redirect for no gain. Compared through `URL` so `:443` and a
  // missing port are one origin rather than two strings.
  if (originOf(requestedUrl) === originOf(finalUrl)) {
    return { allowed: true, url: finalUrl, hostname: hostnameOf(finalUrl) };
  }
  const admission = admitBrowserUrl(finalUrl, policy);
  if (!admission.allowed) {
    return {
      ...admission,
      refusal: {
        ...admission.refusal!,
        reason: `The page redirected to ${finalUrl}, and ${admission.refusal!.reason}`,
        nextAction: `${admission.refusal!.nextAction} A page's redirect cannot widen what it is allowed to reach.`,
      },
    };
  }
  return admission;
}

/**
 * An origin, or the raw value when it will not parse.
 *
 * Unparseable input compares unequal to everything, including itself, so a
 * malformed final URL falls through to the full admission check rather than
 * being waved past as a same-origin hop.
 */
function originOf(url: string): string {
  try {
    return new URL(url).origin.toLowerCase();
  } catch {
    return url;
  }
}

function hostnameOf(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return "";
  }
}
