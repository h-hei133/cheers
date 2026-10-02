import type { Session } from "../schema/sessionRecord.js";
import type { SessionResumeEligibility } from "./sessionResumeEligibility.js";

export type SessionResumeResult =
  | { ok: true; session: Session }
  | { ok: false; error: string; recoveryHint: string };

export interface SessionResumeOptions {
  readonly mode?: "runtime-recovery" | "continuity-only";
}

interface SessionResumeCallbacks {
  readonly sessionDirExists: (sessionId: string) => boolean;
  readonly sessionDir: (sessionId: string) => string;
  readonly loadSession: (sessionId: string) => Session;
  readonly writeSessionMetadata: (session: Session) => void;
  readonly setCurrentSessionForProject: (
    projectRoot: string,
    sessionId: string,
  ) => void;
  readonly evaluateRecoveryTrustBoundary: (
    session: Session,
  ) => SessionResumeEligibility;
  readonly cwd: () => string;
  readonly now: () => string;
}

export function resumeSession(
  callbacks: SessionResumeCallbacks,
  sessionId: string,
  projectRoot?: string,
): Session {
  if (!callbacks.sessionDirExists(sessionId)) {
    throw new Error(`Session ${sessionId} not found`);
  }

  try {
    return activateSession(callbacks, callbacks.loadSession(sessionId), projectRoot);
  } catch (error) {
    throw new Error(
      `Failed to resume session ${sessionId}: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

export function tryResumeSession(
  callbacks: SessionResumeCallbacks,
  sessionId: string,
  projectRoot?: string,
  options?: SessionResumeOptions,
): SessionResumeResult {
  try {
    const session = callbacks.loadSession(sessionId);
    const mode = options?.mode ?? "runtime-recovery";
    if (mode === "runtime-recovery") {
      const trustBoundary = callbacks.evaluateRecoveryTrustBoundary(session);
      if (!trustBoundary.recoverable) {
        return {
          ok: false,
          error: `Session ${sessionId} is not recoverable: ${trustBoundary.block?.detail ?? trustBoundary.detail}`,
          recoveryHint: trustBoundary.block?.recoveryHint ?? `Start a fresh session or inspect ${callbacks.sessionDir(sessionId)}.`,
        };
      }
    }

    return { ok: true, session: activateSession(callbacks, session, projectRoot) };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    return {
      ok: false,
      error: errorMessage.includes("Failed to resume session")
        ? errorMessage
        : `Failed to resume session ${sessionId}: ${errorMessage}`,
      recoveryHint: `Session ${sessionId} could not be restored. Start a fresh session or inspect ${callbacks.sessionDir(sessionId)}.`,
    };
  }
}

function activateSession(callbacks: SessionResumeCallbacks, loaded: Session, projectRoot?: string): Session {
  const session: Session = {
    ...loaded,
    projectRoot: loaded.projectRoot?.trim() ? loaded.projectRoot : projectRoot?.trim() || loaded.projectRoot,
    status: "active",
    updatedAt: callbacks.now(),
  };
  // Metadata stores identity and time. Durable status stays recoverable until
  // the runtime reentry boundary writes state; selection alone is not execution.
  callbacks.writeSessionMetadata(session);
  callbacks.setCurrentSessionForProject(session.projectRoot || callbacks.cwd(), session.id);
  return session;
}
