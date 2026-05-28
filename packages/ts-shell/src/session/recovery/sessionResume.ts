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
    const session = callbacks.loadSession(sessionId);
    if (!session.projectRoot?.trim() && projectRoot?.trim()) {
      session.projectRoot = projectRoot.trim();
    }
    session.status = "active";
    session.updatedAt = callbacks.now();
    callbacks.writeSessionMetadata(session);
    callbacks.setCurrentSessionForProject(
      session.projectRoot || projectRoot || callbacks.cwd(),
      session.id,
    );
    return session;
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
      if (!trustBoundary.recoverable && trustBoundary.block) {
        return {
          ok: false,
          error: `Session ${sessionId} is not recoverable: ${trustBoundary.block.detail}`,
          recoveryHint: trustBoundary.block.recoveryHint,
        };
      }
    }

    return { ok: true, session: resumeSession(callbacks, sessionId, projectRoot) };
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
