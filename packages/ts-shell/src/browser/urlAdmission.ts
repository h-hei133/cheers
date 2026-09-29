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
/**
 * Decide a request the page made for itself, rather than one the caller named.
 *
 * Only the host rule applies here, and that is the whole point of a separate
 * entry point: a document legitimately asks for images, stylesheets, fonts,
 * `data:` URLs, and a websocket to the same local server it came from, so
 * applying the open-URL rules to every request would refuse the page's own
 * furniture and break pages the tool exists to serve. What no document has a
 * legitimate reason to ask for is a host that answers with credentials — the
 * metadata services and the private network behind them.
 *
 * The allowlist is not consulted: it narrows what the caller may ask for, and a
 * page's own subresources are not the caller asking.
 */
export function admitPageRequest(
  url: string,
  policy: BrowserOriginPolicy = { allowedOrigins: [], allowPrivateNetwork: false },
): BrowserUrlAdmission {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    // A request the runtime cannot parse is not something this can judge; the
    // runtime's own handling of it is what decides.
    return { allowed: true, url, hostname: "" };
  }
  // A `data:` or `blob:` request has no host to judge, and a scheme the browser
  // supports for page content is not a navigation out of it.
  if (parsed.protocol === "data:" || parsed.protocol === "blob:" || parsed.protocol === "about:") {
    return { allowed: true, url, hostname: "" };
  }
  const blocked = blockedUnderPolicy(parsed.hostname, policy);
  if (!blocked) return { allowed: true, url, hostname: parsed.hostname };
  return refuse(
    "blocked-host",
    url,
    parsed.hostname,
    `The page asked for ${parsed.hostname}, which is a ${blocked}.`,
    "Load the page somewhere that does not need it, or check what the page is reaching for.",
  );
}

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
