/**
 * Signing in on a machine that cannot open a browser.
 *
 * A server, a container or a remote shell has nowhere to show a consent page, so
 * instead of redirecting it asks the provider for a short code, shows it to the
 * person, and polls until they have entered it somewhere that does have a
 * browser. The polling rules come from the specification and each one exists
 * because of a way the naive version misbehaves.
 *
 * The loop is separated from the request that drives it so the state machine can
 * be tested against a scripted provider: the rules are arithmetic and timing, and
 * the failures they prevent are all in the transitions.
 */

/** What one polling attempt found. */
export type PollOutcome<T> =
  | { readonly status: "complete"; readonly value: T }
  | { readonly status: "pending" }
  | { readonly status: "slow_down" }
  | { readonly status: "failed"; readonly message: string };

/** How to drive a device-code flow. */
export interface DeviceFlowOptions<T> {
  /** One attempt against the provider, classified. */
  readonly poll: () => PollOutcome<T> | Promise<PollOutcome<T>>;
  /** The cadence the provider asked for. Absent means the specification's five seconds. */
  readonly intervalSeconds?: number;
  /** How long the code is good for. Absent means it does not expire. */
  readonly expiresInSeconds?: number;
  readonly signal?: AbortSignal;
}

/** A device-code flow that ended without a token, and why. */
export class DeviceFlowError extends Error {
  constructor(message: string, readonly kind: "cancelled" | "timeout" | "refused") {
    super(message);
    this.name = "DeviceFlowError";
  }
}

/**
 * The shortest interval a client may poll at.
 *
 * The specification sets this floor, and it is the difference between polling and
 * hammering: a provider that reports no interval, or a negative one, gets the
 * default rather than a busy loop.
 */
const MINIMUM_INTERVAL_MS = 1_000;
const DEFAULT_INTERVAL_SECONDS = 5;

/**
 * How much longer to wait after being told to slow down.
 *
 * A fixed step rather than a doubling: the specification says to increase the
 * interval, and the reason is a client polling faster than the server wants —
 * which one step fixes. Doubling would make the flow slow enough to discourage
 * the person waiting through it.
 */
const SLOW_DOWN_STEP_MS = 5_000;

/**
 * Poll until the flow ends.
 *
 * Three ways out, and each is distinguishable on purpose: the flow completed, the
 * provider refused, or time ran out. A caller can only act on the difference, and
 * an error that says only "failed" leaves the person with no idea whether to try
 * again.
 */
export async function pollDeviceFlow<T>(options: DeviceFlowOptions<T>): Promise<T> {
  const deadline =
    options.expiresInSeconds === undefined ? Number.POSITIVE_INFINITY : Date.now() + options.expiresInSeconds * 1_000;
  let intervalMs = Math.max(
    MINIMUM_INTERVAL_MS,
    Math.floor((options.intervalSeconds ?? DEFAULT_INTERVAL_SECONDS) * 1_000),
  );
  let slowedDown = false;

  while (Date.now() < deadline) {
    if (options.signal?.aborted) throw new DeviceFlowError("The sign-in was cancelled.", "cancelled");

    const outcome = await options.poll();
    if (outcome.status === "complete") return outcome.value;
    if (outcome.status === "failed") throw new DeviceFlowError(outcome.message, "refused");
    if (outcome.status === "slow_down") {
      slowedDown = true;
      intervalMs = Math.max(MINIMUM_INTERVAL_MS, intervalMs + SLOW_DOWN_STEP_MS);
    }

    const remaining = deadline - Date.now();
    if (remaining <= 0) break;
    await sleepInterruptibly(Math.min(intervalMs, remaining), options.signal);
  }

  // The two timeouts are told apart because they point at different things: one
  // means nobody finished the sign-in, and the other often means the clock is
  // wrong — a client whose clock runs fast polls faster than the server allows,
  // is told to slow down, and runs out of time while obeying.
  throw slowedDown
    ? new DeviceFlowError(
        "The sign-in timed out after the provider asked for a slower poll. This usually means the clock is wrong; sync it and try again.",
        "timeout",
      )
    : new DeviceFlowError("The sign-in timed out before it was completed.", "timeout");
}

/**
 * Wait, or stop as soon as the caller cancels.
 *
 * Built by hand rather than with a promise-with-resolvers helper, which exists
 * only on a newer runtime than this package declares. Aborting during the wait is
 * the case that matters: a person who cancels a sign-in expects it to stop rather
 * than to wait out the interval first.
 */
function sleepInterruptibly(ms: number, signal: AbortSignal | undefined): Promise<void> {
  if (ms <= 0) return Promise.resolve();
  if (!signal) return new Promise((resolve) => setTimeout(resolve, ms));
  if (signal.aborted) return Promise.reject(new DeviceFlowError("The sign-in was cancelled.", "cancelled"));

  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      signal.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    const onAbort = (): void => {
      clearTimeout(timer);
      reject(new DeviceFlowError("The sign-in was cancelled.", "cancelled"));
    };
    signal.addEventListener("abort", onAbort, { once: true });
  });
}

/** What a provider returns when it is asked to start a flow. */
export interface DeviceCodeGrant {
  readonly deviceCode: string;
  readonly userCode: string;
  readonly verificationUri: string;
  /** What to show a person, which may differ from the URL a client would open. */
  readonly verificationUriComplete?: string;
  readonly intervalSeconds?: number;
  readonly expiresInSeconds?: number;
}

/**
 * The polling outcome for one token request, from what the provider answered.
 *
 * The three documented failures are matched by name because they are the
 * protocol's vocabulary rather than prose: a client that matched on wording would
 * treat a rephrased response as a refusal. Anything else is a failure, and its
 * own words travel with it.
 */
export function classifyDeviceTokenResponse(body: unknown): PollOutcome<unknown> {
  const record = (body ?? {}) as Record<string, unknown>;
  if (typeof record.access_token === "string") {
    return { status: "complete", value: record };
  }
  const error = typeof record.error === "string" ? record.error : undefined;
  if (error === "authorization_pending") return { status: "pending" };
  if (error === "slow_down") return { status: "slow_down" };
  if (error === "expired_token") {
    return { status: "failed", message: "The code expired before it was entered." };
  }
  if (error === "access_denied") {
    return { status: "failed", message: "The request was refused." };
  }
  const description = typeof record.error_description === "string" ? record.error_description : undefined;
  return {
    status: "failed",
    message: description ?? error ?? "The sign-in was refused without a reason.",
  };
}
