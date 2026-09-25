/**
 * Which requests this session may make on its own.
 *
 * Two kinds of request leave this process. One is asked for: a prompt, a web
 * search, a fetch the user pointed at. The other is not — a release check, a
 * cache refresh, a catalogue update, all of which happen because the harness
 * decided to, not because anyone said so.
 *
 * Only the second kind is gated here. That distinction is the whole point: a
 * switch that also blocked the model call would be a switch that turns the tool
 * off, and nobody asking for "no unasked traffic" wants that. What they want is
 * to be the only party deciding when this machine talks to the network.
 *
 * The gate is one predicate rather than a check at each call site. Checks
 * scattered across the callers drift — one grows a new bypass, another forgets
 * the environment variable — and the failure is silent in the direction that
 * matters: traffic that should have been withheld goes out anyway.
 */

/** The environment variable that turns self-initiated traffic off. */
export const OFFLINE_ENV = "CHEERS_OFFLINE";

/**
 * The values that count as "on" for a flag variable.
 *
 * `0` and `false` are off rather than on, because a variable set to `0` is how
 * someone disables a thing they exported earlier in a shell profile. Treating
 * any non-empty string as true would make `CHEERS_OFFLINE=0` mean the opposite
 * of what it says.
 */
const AFFIRMATIVE = new Set(["1", "true", "yes", "on"]);

export interface NetworkPolicyInput {
  readonly env?: Readonly<Record<string, string | undefined>>;
  /**
   * The configured setting, when the caller has one.
   *
   * The environment wins over it: a variable is set for one command, while the
   * file is what the user lives with, so the narrower statement takes precedence
   * — the same direction every other setting in this project resolves.
   */
  readonly configuredOffline?: boolean;
}

/**
 * Whether the session has been told to stop making unasked requests.
 *
 * True when the variable is set to an affirmative value, or when the
 * configuration says so and the variable does not contradict it.
 */
export function isOffline(input: NetworkPolicyInput = {}): boolean {
  const env = input.env ?? process.env;
  const raw = env[OFFLINE_ENV];
  if (raw !== undefined) return AFFIRMATIVE.has(raw.trim().toLowerCase());
  return input.configuredOffline === true;
}

/**
 * Whether a request this process decided to make may go out.
 *
 * Named for what it answers rather than for the switch, because a caller that
 * asks "are we offline?" tends to then invent its own exception. There is no
 * exception to state: if the answer is false, the request is not sent, and the
 * caller reports that it was withheld rather than silently doing nothing.
 */
export function allowsSelfInitiatedRequests(input: NetworkPolicyInput = {}): boolean {
  return !isOffline(input);
}

/**
 * Why self-initiated traffic is off, for a message a user can act on.
 *
 * A feature that quietly does nothing is indistinguishable from one that is
 * broken. Naming the switch is what turns "the update check never says
 * anything" into "you turned this off, here is where".
 */
export function offlineReason(input: NetworkPolicyInput = {}): string | undefined {
  if (!isOffline(input)) return undefined;
  const env = input.env ?? process.env;
  if (env[OFFLINE_ENV] !== undefined) {
    return `Self-initiated network requests are disabled by ${OFFLINE_ENV}.`;
  }
  return "Self-initiated network requests are disabled by the `offline` setting.";
}
