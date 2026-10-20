import type {
  SessionManager,
} from "../../session/SessionManager.js";
import type { AsyncReentryHint } from "../../session/recovery/asyncReentryHint.js";

export type RecoveryHint = AsyncReentryHint;

export interface LoadRecoveryHintInput {
  readonly sessionManager: Pick<SessionManager, "getRecoveryHintAsync">;
  readonly preferredProjectRoot: string;
  readonly currentSessionId?: string;
  readonly signal?: AbortSignal;
  /** Captured before discovery and checked again after every await. */
  readonly generation: () => string;
}

/**
 * Discover a startup suggestion without turning it into recovery authority.
 *
 * The caller starts this after the first frame. A late result is discarded if
 * the active session, project or configuration generation changed, and an
 * explicit user action never waits for this suggestion.
 */
export async function loadRecoveryHint(
  input: LoadRecoveryHintInput,
): Promise<RecoveryHint | null> {
  const generation = input.generation();
  input.signal?.throwIfAborted();
  const hint = await input.sessionManager.getRecoveryHintAsync({
    preferredProjectRoot: input.preferredProjectRoot,
    ...(input.currentSessionId ? { currentSessionId: input.currentSessionId } : {}),
    ...(input.signal ? { signal: input.signal } : {}),
  });
  input.signal?.throwIfAborted();
  if (!hint || input.generation() !== generation) return null;
  if (input.signal?.aborted || input.generation() !== generation) return null;
  return hint;
}
