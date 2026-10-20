import type {
  SessionManager,
} from "../../session/SessionManager.js";
import type { AsyncReentryHint } from "../../session/recovery/asyncReentryHint.js";
import type { StructuredLogger } from "../../observability/structuredLogger.js";

export type RecoveryHint = AsyncReentryHint;

export interface LoadRecoveryHintInput {
  readonly sessionManager: Pick<SessionManager, "getRecoveryHintAsync">;
  readonly preferredProjectRoot: string;
  readonly currentSessionId?: string;
  readonly signal?: AbortSignal;
  /** Captured before discovery and checked again after every await. */
  readonly generation: () => string;
}

export interface StartupRecoveryHintInput {
  readonly sessionManager: Pick<SessionManager, "getRecoveryHintAsync">;
  readonly preferredProjectRoot: string;
  readonly currentSessionId?: string;
  /** Stable identity for the session/project/config state that owns the hint. */
  readonly generation: () => string;
  readonly publish: (hint: RecoveryHint) => void;
  readonly logger: Pick<StructuredLogger, "warn">;
}

export interface StartupRecoveryHint {
  /** Starts once, after the first frame has actually reached the output stream. */
  start(): Promise<void>;
  /** Stops a pending suggestion from publishing after the user takes over. */
  noteUserIntent(): void;
  /** Releases the scan during shutdown, even when no user input arrived. */
  cancel(): void;
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

/**
 * Owns the one-shot startup suggestion lifecycle.
 *
 * The scan cannot begin until the host confirms its first write, and any user
 * intent invalidates both the pending scan and its eventual result. The caller
 * still supplies the session/project/config identity so an explicit session
 * switch is fenced even when it happens before the first key reaches the host.
 */
export function createStartupRecoveryHint(
  input: StartupRecoveryHintInput,
): StartupRecoveryHint {
  const controller = new AbortController();
  let interactionRevision = 0;
  let run: Promise<void> | undefined;

  const generation = (): string =>
    JSON.stringify([input.generation(), interactionRevision]);

  const start = (): Promise<void> => {
    if (run) return run;
    if (controller.signal.aborted) {
      run = Promise.resolve();
      return run;
    }

    const startedAt = generation();
    run = loadRecoveryHint({
      sessionManager: input.sessionManager,
      preferredProjectRoot: input.preferredProjectRoot,
      ...(input.currentSessionId
        ? { currentSessionId: input.currentSessionId }
        : {}),
      signal: controller.signal,
      generation,
    }).then((hint) => {
      if (!hint || controller.signal.aborted || generation() !== startedAt) {
        return;
      }
      input.publish(hint);
    }).catch((error: unknown) => {
      if (controller.signal.aborted) return;
      try {
        input.logger.warn("Recovery hint scan failed", {
          error: error instanceof Error ? error.message : String(error),
        });
      } catch {
        // The startup scan is advisory; logging cannot become its terminal failure.
      }
    });
    return run;
  };

  const noteUserIntent = (): void => {
    if (controller.signal.aborted) return;
    interactionRevision += 1;
    controller.abort();
  };

  return {
    start,
    noteUserIntent,
    cancel: () => controller.abort(),
  };
}
