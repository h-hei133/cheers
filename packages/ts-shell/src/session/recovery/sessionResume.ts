import type { Session } from "../schema/sessionRecord.js";
import type { SessionResumeEligibility } from "./sessionResumeEligibility.js";
import { dirname } from 'node:path';
import { projectSessionFileLayout } from '../store/sessionFileLayout.js';
import { readSessionFileVersion } from '../store/version.js';
import { withSessionStateLock } from '../store/sessionStateStore.js';
import { normalizePathIdentity } from '../continuation/roots.js';

export type SessionResumeResult =
  | { ok: true; session: Session; warning?: string }
  | { ok: false; error: string; recoveryHint: string; activation?: 'unknown' };

export interface SessionResumeOptions {
  readonly mode?: "runtime-recovery" | "continuity-only";
  readonly expectedVersion?: string;
  readonly beforeActivate?: () => void;
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
  readonly getCurrentSessionForProject?: (projectRoot: string) => Session | null;
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
  let activated: Session | undefined;
  let activatedVersion: string | undefined;
  let activationStarted = false;
  try {
    const validate = (): void => {
      options?.beforeActivate?.();
      if (options?.expectedVersion !== undefined) {
        const layout = projectSessionFileLayout({ sessionsDir: dirname(callbacks.sessionDir(sessionId)), sessionId });
        if (readSessionFileVersion(layout) !== options.expectedVersion) {
          throw new Error('The saved session changed after the preview. Reopen the session picker.');
        }
      }
    };
    validate();
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

    const activate = (): SessionResumeResult => {
      validate();
      if (session.id !== sessionId) throw new Error('The stored session identity does not match the selected session.');
      activationStarted = true;
      activated = activateSession(callbacks, session, projectRoot);
      if (options?.expectedVersion !== undefined) {
        activatedVersion = readSessionFileVersion(projectSessionFileLayout({
          sessionsDir: dirname(callbacks.sessionDir(sessionId)), sessionId,
        }));
      }
      return { ok: true, session: activated };
    };
    return options?.expectedVersion === undefined ? activate()
      : withSessionStateLock(projectSessionFileLayout({ sessionsDir: dirname(callbacks.sessionDir(sessionId)), sessionId }),
        activate, { requireExisting: true });
  } catch (error) {
    if (activationStarted && options?.expectedVersion !== undefined) {
      // Cleanup can fail after publication. Reread both the exact saved files
      // and durable selection before adopting that committed activation.
      try {
        const layout = projectSessionFileLayout({ sessionsDir: dirname(callbacks.sessionDir(sessionId)), sessionId });
        const current = activated && callbacks.getCurrentSessionForProject?.(activated.projectRoot || callbacks.cwd());
        if (activated && activatedVersion && readSessionFileVersion(layout) === activatedVersion
          && current?.id === activated.id && current.createdAt === activated.createdAt
          && current.updatedAt === activated.updatedAt
          && normalizePathIdentity(current.projectRoot) === normalizePathIdentity(activated.projectRoot)) {
          return { ok: true, session: activated,
            warning: 'The saved session was activated, but its storage lock could not be released. Restart before changing saved sessions.' };
        }
      } catch { /* An unreadable publication remains unknown. */ }
      return { ok: false, activation: 'unknown',
        error: 'Saved session activation could not be verified after a storage failure.',
        recoveryHint: 'Restart and inspect the current saved session before continuing.' };
    }
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
