import type { Session } from "../schema/sessionRecord.js";
import type { SessionResumeEligibility } from "./sessionResumeEligibility.js";
import { dirname } from 'node:path';
import { projectSessionFileLayout } from '../store/sessionFileLayout.js';
import { readSessionFileVersion } from '../store/version.js';
import { withSessionStateLock } from '../store/sessionStateStore.js';
import { normalizePathIdentity } from '../continuation/roots.js';
import type { PreparedActivationMetadata, SessionActivationIdentity, SessionActivationOptions } from '../store/activation.js';
import { captureActivationGuard } from '../store/activation.js';
import type { CurrentSessionSelectionRecord } from '../store/currentSelection.js';
import { PromptPublicationError } from '../store/prompt/intent.js';

export type SessionResumeResult =
  | { ok: true; session: Session; warning?: string }
  | { ok: false; error: string; recoveryHint: string; activation?: 'unknown'; promptPublication?: 'unknown' };

export interface SessionResumeOptions {
  readonly mode?: "runtime-recovery" | "continuity-only";
  readonly expectedVersion?: string;
  readonly beforeActivate?: () => void;
  readonly activation?: SessionActivationOptions;
}

interface SessionResumeCallbacks {
  readonly sessionDirExists: (sessionId: string) => boolean;
  readonly sessionDir: (sessionId: string) => string;
  readonly loadSession: (sessionId: string) => Session;
  readonly writeSessionMetadata: (session: Session, requireHeld?: boolean) => void;
  readonly prepareSessionActivation?: (session: Session, identity: SessionActivationIdentity) => PreparedActivationMetadata;
  readonly setCurrentSessionForProject: (
    projectRoot: string,
    sessionId: string,
    options?: SessionActivationOptions,
  ) => void;
  readonly readCurrentSessionSelection?: (projectRoot: string) => CurrentSessionSelectionRecord | undefined;
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
    if (error instanceof PromptPublicationError) throw error;
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
  let activationStarted = false;
  let releaseFailed = false;
  const onReleaseError = () => { releaseFailed = true; };
  let candidate: CurrentSessionSelectionRecord | undefined;
  let publishedSession: Session | undefined;
  let publishedVersion: string | undefined;
  let activationOptions: SessionActivationOptions | undefined;
  try {
    if (options?.activation || options?.expectedVersion !== undefined) {
      const capture = options.activation?.captureSelection;
      activationOptions = { guard: captureActivationGuard(options.activation?.guard), onReleaseError, captureSelection: value => {
        candidate = value;
        capture?.(value);
      } };
    }
    const locked = options?.expectedVersion !== undefined || activationOptions?.guard !== undefined;
    const layout = locked
      ? projectSessionFileLayout({ sessionsDir: dirname(callbacks.sessionDir(sessionId)), sessionId })
      : undefined;
    const expectedVersion = options?.expectedVersion ?? (layout && readSessionFileVersion(layout));
    const validateVersion = (): void => {
      if (layout && readSessionFileVersion(layout) !== expectedVersion) {
        throw new Error('The saved session changed after the preview. Reopen the session picker.');
      }
    };
    const validate = (): void => {
      options?.beforeActivate?.();
      validateVersion();
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
      if (!layout) activationStarted = true;
      const activated = activateSession(callbacks, session, projectRoot, activationOptions, value => {
        publishedSession = value;
        if (layout) publishedVersion = readSessionFileVersion(layout);
      }, layout ? () => {
        validateVersion();
        activationStarted = true;
      } : undefined);
      return { ok: true, session: activated };
    };
    return layout ? withSessionStateLock(layout, activate, { requireExisting: true, onReleaseError }) : activate();
  } catch (error) {
    if (error instanceof PromptPublicationError && !activationStarted) {
      return { ok: false, promptPublication: 'unknown', error: error.message,
        recoveryHint: 'Inspect the saved session before retrying.' };
    }
    const versioned = options?.expectedVersion !== undefined || activationOptions?.guard !== undefined;
    if (releaseFailed && publishedSession && candidate && versioned) {
      try {
        const layout = projectSessionFileLayout({ sessionsDir: dirname(callbacks.sessionDir(sessionId)), sessionId });
        const current = callbacks.loadSession(sessionId);
        const unchanged = publishedVersion !== undefined && readSessionFileVersion(layout) === publishedVersion;
        const selected = callbacks.readCurrentSessionSelection?.(publishedSession.projectRoot || callbacks.cwd());
        if (selected && selected.activationId === candidate.activationId && selected.sessionId === candidate.sessionId
          && selected.updatedAt === candidate.updatedAt && current.id === publishedSession.id
          && current.createdAt === publishedSession.createdAt && current.updatedAt === publishedSession.updatedAt
          && normalizePathIdentity(current.projectRoot) === normalizePathIdentity(publishedSession.projectRoot)
          && unchanged) {
          return { ok: true, session: { ...current, status: 'active' }, warning: 'The saved session was activated, but its storage lock could not be released. Restart before changing saved sessions.' };
        }
      } catch { /* A missing or replaced activation remains unknown. */ }
    }
    if (activationStarted && versioned) {
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

function activateSession(callbacks: SessionResumeCallbacks, loaded: Session, projectRoot?: string, options?: SessionActivationOptions,
  prepared?: (session: Session) => void, validateLockedVersion?: () => void): Session {
  const session: Session = {
    ...loaded,
    projectRoot: loaded.projectRoot?.trim() ? loaded.projectRoot : projectRoot?.trim() || loaded.projectRoot,
    status: "active",
    updatedAt: callbacks.now(),
  };
  // Metadata stores identity and time. Durable status stays recoverable until
  // the runtime reentry boundary writes state; selection alone is not execution.
  const publishMetadata = () => {
    validateLockedVersion?.();
    callbacks.writeSessionMetadata(session, validateLockedVersion !== undefined);
    prepared?.(session);
  };
  let activation = options;
  if (!validateLockedVersion) publishMetadata();
  else if (!callbacks.prepareSessionActivation) activation = { ...options, publishMetadata };
  else activation = { ...options, prepareMetadata: identity => {
    validateLockedVersion();
    const proposal = callbacks.prepareSessionActivation!(session, identity);
    return {
      ...proposal,
      assertCurrent: () => {
        validateLockedVersion();
        proposal.assertCurrent();
      },
      finish: () => {
        proposal.finish();
        prepared?.(session);
      },
    };
  } };
  callbacks.setCurrentSessionForProject(session.projectRoot || callbacks.cwd(), session.id, activation);
  return session;
}
