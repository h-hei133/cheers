/**
 * How long a command may run, and what a caller is allowed to ask for.
 *
 * The default matters as much as the ceiling. A command with no timeout at all
 * can hold a turn open forever — a shell that spawns a background child and
 * waits on it does exactly that — so the tool keeps a bound even when the model
 * names none. What the model gains here is the ability to say "this one needs
 * longer", not the ability to say "no limit".
 *
 * The ceiling is not a taste decision. `setTimeout` stores its delay in a signed
 * 32-bit integer, so a larger value overflows and fires immediately — a command
 * asked to run for a month would be killed on the next tick. Refusing the value
 * is the only honest answer; clamping it would silently run something other than
 * what was asked for.
 */

/** The bound applied when a caller names no timeout. */
export const DEFAULT_COMMAND_TIMEOUT_MS = 60_000;

/** The largest delay `setTimeout` accepts without overflowing. */
export const MAX_COMMAND_TIMEOUT_MS = 2_147_483_647;

export type CommandTimeoutResult =
  | { readonly ok: true; readonly timeoutMs: number }
  | { readonly ok: false; readonly reason: string };

/**
 * Resolve a caller-supplied timeout in seconds against the default and ceiling.
 *
 * Seconds rather than milliseconds because that is the unit a person writes and
 * the unit a model reasons in; the conversion happens once, here.
 */
export function resolveCommandTimeout(seconds: unknown): CommandTimeoutResult {
  if (seconds === undefined || seconds === null) {
    return { ok: true, timeoutMs: DEFAULT_COMMAND_TIMEOUT_MS };
  }
  if (typeof seconds !== 'number' || !Number.isFinite(seconds) || seconds <= 0) {
    return {
      ok: false,
      reason:
        'Invalid timeout: must be a finite number of seconds greater than zero. ' +
        `Omit it to use the ${DEFAULT_COMMAND_TIMEOUT_MS / 1000}-second default.`,
    };
  }
  const timeoutMs = Math.round(seconds * 1000);
  if (timeoutMs > MAX_COMMAND_TIMEOUT_MS) {
    return {
      ok: false,
      reason: `Invalid timeout: maximum is ${MAX_COMMAND_TIMEOUT_MS / 1000} seconds.`,
    };
  }
  return { ok: true, timeoutMs };
}
