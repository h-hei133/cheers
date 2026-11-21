import type { Session } from "../schema/sessionRecord.js";
import type { SessionStateSnapshot } from "../schema/sessionStateSnapshot.js";
import { isRecord } from "../../core/values/record.js";
import { normalizePathIdentity } from "./roots.js";
import { projectSessionRootRebase } from "./sessionRootRebase.js";
import type { ProjectBindingOptions } from '../store/projectBindingPolicy.js';
import { validateWorkspaceRoots } from '../../core/workspace/roots.js';
import type { WorkspaceRoot } from '../../core/workspace/model.js';
import { captureActivationGuard, sameSessionActivation, SessionActivationConflict,
  type SessionActivationGuard, type SessionActivationOptions } from '../store/activation.js';
import type { CurrentSessionSelectionRecord } from '../store/currentSelection.js';
import { hasPromptIntent } from '../store/prompt/intent.js';
import type { SessionStoreAccess } from '../store/sessionStoreAccess.js';
import { readSessionFileVersion } from '../store/version.js';

type RebindOutcome = "unchanged" | "restored" | "partial" | "committed";
type RebindStage = "prepare" | "state" | "metadata" | "lock-release" | "selection";

export class SessionRootRebindError extends Error {
  constructor(readonly outcome: RebindOutcome, readonly stage: RebindStage, cause: unknown) {
    const detail = {
      unchanged: "session records were not changed",
      restored: "the previous state was restored and metadata is unchanged",
      partial: "record updates are partial or unverified; inspect the session before retrying",
      committed: "session records were saved, but the operation reported a follow-up failure",
    }[outcome];
    super("Session root migration failed at " + stage + ": " + detail + ". " +
      (cause instanceof Error ? cause.message : String(cause)), { cause });
    this.name = "SessionRootRebindError";
  }
}

export interface SessionRootRebindOptions {
  readonly beforeCommit?: () => void;
  readonly binding?: Omit<ProjectBindingOptions, 'workspaceRoots'>;
  readonly workspaceRoots?: readonly WorkspaceRoot[];
  readonly activationGuard?: SessionActivationGuard;
}

interface RebindInput extends SessionRootRebindOptions {
  readonly store: SessionStoreAccess;
  readonly sessionId: string;
  readonly nextProjectRoot: string;
  readonly updatedAt: string;
  readonly select: (projectRoot: string, sessionId: string, options: SessionActivationOptions) => void;
}

export function rebindSessionProjectRootContinuity(input: RebindInput): Session {
  const { store, sessionId } = input;
  const publication: {
    preparing?: { readonly version: string; readonly projectRoot: string };
    saved?: { readonly projectRoot: string; readonly version: string };
    candidate?: CurrentSessionSelectionRecord;
  } = {};
  let stage: RebindStage = 'prepare';
  try {
    const session = store.load(sessionId);
    const guard = captureActivationGuard(input.activationGuard ?? {
      source: { projectRoot: session.projectRoot, expected: store.readCurrentSessionSelection(session.projectRoot) },
      destination: store.readCurrentSessionSelection(input.nextProjectRoot),
    });
    if (!guard || guard.source.projectRoot !== normalizePathIdentity(session.projectRoot)) throw new SessionActivationConflict();
    return store.withSessionStateLock(sessionId, () => {
      const layout = store.stateLayout(sessionId);
      const version = readSessionFileVersion(layout);
      const { session: latest, state: current } = store.readSnapshot(sessionId, { readOnly: true });
      validateSource(session, latest, current, input.nextProjectRoot);
      const projection = projectSessionRootRebase({
        workingMemory: current.workingMemory,
        previousRoot: latest.projectRoot,
        nextProjectRoot: input.nextProjectRoot,
      });
      const roots = (input.workspaceRoots ?? current.workspaceRoots)?.filter(root => normalizePathIdentity(root.path) !== normalizePathIdentity(projection.projectRoot));
      if (roots?.length) validateWorkspaceRoots(projection.projectRoot, roots);
      const nextState: SessionStateSnapshot = {
        ...current,
        projectRoot: projection.projectRoot,
        ...(roots ? { workspaceRoots: roots } : {}),
        ...(projection.workingMemory !== undefined ? { workingMemory: projection.workingMemory } : {}),
      };
      const nextSession: Session = {
        ...latest,
        projectRoot: projection.projectRoot,
        updatedAt: input.updatedAt,
        status: current.status,
        ...(roots ? { workspaceRoots: roots } : {}),
        pendingPrompt: current.pendingPrompt,
        lastError: current.lastError,
      };
      if (normalizePathIdentity(latest.projectRoot) !== normalizePathIdentity(projection.projectRoot)) {
        nextSession.requestedWorkspaceRoot = projection.projectRoot;
        nextSession.targetPathBase = projection.projectRoot;
        // These describe the old filesystem. Existing runtime entrypoints
        // discover and persist the destination's actual Git binding.
        delete nextSession.rootMode;
        delete nextSession.gitRoot;
      }
      if (input.binding) Object.assign(nextSession, input.binding);
      const assertCurrent = () => {
        input.beforeCommit?.();
        if (store.sessionDir(sessionId) !== layout.sessionDir || readSessionFileVersion(layout) !== version) {
          throw new Error('The saved session changed before migration.');
        }
      };
      assertCurrent();
      stage = 'selection';
      input.select(nextSession.projectRoot, sessionId, {
        guard,
        captureSelection: observed => { publication.candidate = observed; },
        prepareMetadata: identity => {
          assertCurrent();
          publication.preparing = { version, projectRoot: nextSession.projectRoot };
          const proposal = store.prepareSessionActivation(nextSession, identity, nextState);
          return {
            ...proposal,
            assertCurrent: () => { assertCurrent(); proposal.assertCurrent(); },
            finish: () => {
              proposal.finish();
              publication.saved = { projectRoot: nextSession.projectRoot, version: readSessionFileVersion(layout) };
            },
          };
        },
      });
      if (!publication.candidate || !publication.saved
        || !sameSessionActivation(store.readCurrentSessionSelection(nextSession.projectRoot), publication.candidate)) {
        throw new SessionActivationConflict();
      }
      stage = 'lock-release';
      return nextSession;
    }, { requireExisting: true });
  } catch (error) {
    const { saved, candidate, preparing } = publication;
    const attempt = saved ?? preparing;
    let outcome: RebindOutcome = 'unchanged';
    if (attempt && (saved || !(error instanceof SessionActivationConflict))) {
      outcome = 'partial';
      try {
        const selected = store.readCurrentSessionSelection(attempt.projectRoot);
        const current = candidate !== undefined && sameSessionActivation(selected, candidate);
        const layout = store.stateLayout(sessionId);
        const version = readSessionFileVersion(layout);
        if (saved && current && version === saved.version) outcome = 'committed';
        if (!saved && preparing && !current && version === preparing.version
          && !hasPromptIntent(layout)) outcome = 'unchanged';
      } catch { /* Keep an unreadable result unverified. */ }
    }
    throw new SessionRootRebindError(outcome, stage, error);
  }
}

function validateSource(session: Session, latest: Session, current: SessionStateSnapshot, nextProjectRoot: string): void {
  if (!isRecord(current) ||
    typeof current.status !== "string" ||
    !["active", "interrupted", "completed", "completed_unproven", "error", "terminated"].includes(current.status) ||
    (current.projectRoot !== undefined && (typeof current.projectRoot !== "string" || !normalizePathIdentity(current.projectRoot)))) {
    throw new Error("Session state is missing or invalid");
  }
  if (!nextProjectRoot.trim()) throw new Error("Destination project root is empty");
  const expectedRoot = normalizePathIdentity(session.projectRoot);
  const latestRoot = normalizePathIdentity(latest.projectRoot);
  if (latest.id !== session.id || latest.createdAt !== session.createdAt || !expectedRoot || expectedRoot !== latestRoot) {
    throw new Error("Session identity or project root changed before migration");
  }
  if (current.projectRoot !== undefined && normalizePathIdentity(current.projectRoot) !== latestRoot) {
    throw new Error("Session metadata and state project roots disagree");
  }
  if (current.status === 'active' && (current.runPhase === 'prompt-persisted' || current.runPhase === 'turn-active')) {
    throw new Error('Session is busy; finish or recover the active turn before migration');
  }
}
