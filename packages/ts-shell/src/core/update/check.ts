import { allowsSelfInitiatedRequests, offlineReason, type NetworkPolicyInput } from "../network/policy.js";
import { isNewerVersion } from "../version/compare.js";
import { packageVersion } from "../version/current.js";

/**
 * Whether a newer release exists.
 *
 * Asked once, in the background, and only when someone is there to read the
 * answer. This is a request the harness makes on its own initiative, so it is
 * gated by the network policy and by nothing else — a check that ignores the
 * switch would be the exact traffic the switch exists to stop.
 *
 * The failure mode is silence. A machine with no network, a captive portal, an
 * endpoint that moved: none of these are the user's problem, and a session that
 * reported them would be worse than one that quietly did not know.
 */

/**
 * Where releases are announced.
 *
 * Read from the environment so a fork or an internal mirror can point at its own
 * endpoint without a code change. The default names this project's repository
 * rather than a vendor host, because that is where its releases actually are.
 */
const UPDATE_ENDPOINT_ENV = "CHEERS_UPDATE_ENDPOINT";
const DEFAULT_ENDPOINT = "https://api.github.com/repos/h-hei133/cheers/releases/latest";

/**
 * How long the check may take.
 *
 * Short on purpose. This runs while the user is waiting to work, so a slow
 * endpoint must not hold a socket open for anything like the timeout a model
 * request gets: the answer is a convenience, and a late one is worth less than
 * the connection it costs.
 */
const TIMEOUT_MS = 5_000;

export interface UpdateCheckResult {
  /** The newer version, when there is one worth reporting. */
  readonly latest?: string;
  /** Where the user can read what changed. */
  readonly url?: string;
  /**
   * Why nothing was reported, when the caller needs to say so.
   *
   * Present for a withheld check — a disabled switch is a state a user can be
   * confused by, and naming it is what separates "off" from "broken". Absent for
   * a check that simply found nothing or could not complete.
   */
  readonly withheld?: string;
}

export interface UpdateCheckInput extends NetworkPolicyInput {
  /** Overrides the endpoint, for a test or a mirror. */
  readonly endpoint?: string;
  readonly fetchImpl?: typeof fetch;
  readonly currentVersion?: string;
  /** The environment to read the endpoint and the switch from. */
  readonly env?: Readonly<Record<string, string | undefined>>;
}

/**
 * The release metadata this reads.
 *
 * GitHub's shape, narrowed to the two fields that are used. Anything else the
 * response carries is ignored rather than modelled, so a change to the rest of
 * it cannot break the check.
 */
interface ReleasePayload {
  readonly tag_name?: unknown;
  readonly html_url?: unknown;
}

export async function checkForUpdate(input: UpdateCheckInput = {}): Promise<UpdateCheckResult> {
  if (!allowsSelfInitiatedRequests(input)) {
    // Named through the policy so the message points at the switch that did it.
    // A feature that quietly does nothing is indistinguishable from one that is
    // broken, and this is the only surface that can tell them apart.
    return {
      withheld: `The update check was skipped. ${offlineReason(input)}`,
    };
  }

  const current = input.currentVersion ?? packageVersion();
  // Without a version to compare against there is no question to ask. Sending
  // the request anyway would fetch an answer that cannot be used.
  if (!current) return {};

  const env = input.env ?? process.env;
  const endpoint = input.endpoint ?? env[UPDATE_ENDPOINT_ENV]?.trim() ?? DEFAULT_ENDPOINT;
  const fetchImpl = input.fetchImpl ?? fetch;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const response = await fetchImpl(endpoint, {
      headers: { accept: "application/json" },
      signal: controller.signal,
    });
    if (!response.ok) return {};
    const payload = (await response.json()) as ReleasePayload;
    const tag = typeof payload.tag_name === "string" ? payload.tag_name.trim() : "";
    if (!tag || !isNewerVersion(tag, current)) return {};
    const url = typeof payload.html_url === "string" ? payload.html_url.trim() : "";
    return { latest: tag.replace(/^v/, ""), ...(url ? { url } : {}) };
  } catch {
    // Offline, timed out, refused, malformed: the answer is "no news".
    return {};
  } finally {
    clearTimeout(timer);
  }
}

/**
 * The line to show when a newer release exists, or nothing when none does.
 *
 * Built here rather than at the surface so the wording is decided once. A caller
 * that composed its own would eventually say something slightly different about
 * the same fact, and the two would disagree.
 */
export function formatUpdateNotice(result: UpdateCheckResult): string | undefined {
  if (result.withheld) return undefined;
  if (!result.latest) return undefined;
  const where = result.url ? ` — ${result.url}` : "";
  return `A newer version is available: ${result.latest}${where}`;
}
