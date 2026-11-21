import type {
  CurrentSessionSelectionResolution,
  CurrentSessionSelectionRecord,
} from "./currentSelection.js";
import type { SessionActivationIdentity, SessionActivationOptions } from './activation.js';
import type { Session } from "../schema/sessionRecord.js";
import type {
  SessionStateSnapshot,
  SessionStateSnapshotOverrides,
} from "../schema/sessionStateSnapshot.js";
import {
  clearCurrentSessionSelectionForProject,
  readCurrentSessionSelection,
  resolveCurrentSessionForProject,
  setCurrentSessionSelection,
} from "./currentSessionRegistry.js";
import {
  createSessionStoreLayout,
  locateExistingSessionLayout,
  assertSessionStoreProfile,
} from "./sessionFileLayout.js";
import { writeJsonFileAtomic } from "./sessionFileStore.js";
import { SessionFiles } from './files.js';
import { SessionStorePaths } from './paths.js';
import { prepareSessionActivationRecord, writeSessionMetadataRecord } from './metadata.js';
import { createSessionRecord, type InitialSessionRecord } from './create.js';
import {
  SessionCatalog,
  type SessionCatalogDiagnostic,
} from './catalog/index.js';
import {
  deleteSessionRecord,
  loadSessionRecord,
  previewPendingSessionRecord,
  readSessionRecordSnapshot,
  sessionExistsAtLayout,
  type SessionRecordSnapshot,
} from "./sessionStore.js";
import {
  listSessionRecords,
  type SessionListWarningState,
} from "./sessionListStore.js";
import {
  readStateSnapshotRequired,
  readStateSnapshotSafely,
  withSessionStateLock,
  writeSessionState,
} from "./sessionStateStore.js";
import {
  formatListSessionsFailureWarning,
  formatUnreadableSessionDirectoryWarning,
} from "../presentation/sessionWarningSurface.js";
import { ArtifactManager } from "../../core/session/artifactManager.js";
import { recoverSessionPrompt } from './prompt/commit.js';

export interface SessionListOptions {
  /** Resolve an ID prefix before startup admission, including recoverable sessions. */
  readonly previewPrefix: string;
}

export class SessionStoreAccess extends SessionStorePaths {
  readonly files: SessionFiles;
  readonly catalog: SessionCatalog;
  private readonly listWarningState: SessionListWarningState = {
    warnedUnreadableSessionDirs: new Set<string>(),
    didWarnListSessionsFailure: false,
  };

  constructor() {
    super(createSessionStoreLayout());
    this.files = new SessionFiles(this.storeLayout);
    this.catalog = new SessionCatalog(this.storeLayout);
    this.ensureLayout();
  }

  sessionExists(sessionId: string): boolean {
    if (!sessionId?.trim()) {
      return false;
    }
    return sessionExistsAtLayout(locateExistingSessionLayout(this.storeLayout, sessionId.trim()));
  }

  load(sessionId: string, options?: { readonly readOnly?: boolean }): Session {
    return this.readSnapshot(sessionId, options).session;
  }

  readSnapshot(sessionId: string, options?: { readonly readOnly?: boolean }): SessionRecordSnapshot {
    const layout = locateExistingSessionLayout(this.storeLayout, sessionId);
    if (!options?.readOnly) recoverSessionPrompt(layout, sessionId, this.storeLayout.currentSessionStorePath);
    return readSessionRecordSnapshot({
      sessionId,
      layout,
      cwd: process.cwd(),
    });
  }

  writeSession(session: Session, initial?: InitialSessionRecord): void {
    createSessionRecord(session, this.storeLayout, initial);
  }

  writeSessionMetadata(session: Session, requireHeld?: boolean): void {
    writeSessionMetadataRecord({
      session,
      layout: locateExistingSessionLayout(this.storeLayout, session.id),
      requireHeld,
    });
  }

  prepareSessionActivation(session: Session, identity: SessionActivationIdentity) {
    return prepareSessionActivationRecord(session, locateExistingSessionLayout(this.storeLayout, session.id), identity);
  }

  writeSessionState(
    session: Session,
    overrides?: SessionStateSnapshotOverrides,
  ): void {
    writeSessionState({
      session,
      layout: locateExistingSessionLayout(this.storeLayout, session.id),
      overrides,
    });
  }

  deleteSession(sessionId: string): void {
    let artifactRoots: string[] = [];
    try {
      const session = this.load(sessionId);
      artifactRoots = [session.projectRoot, ...(session.workspaceRoots ?? []).map((root) => root.path)];
    } catch {
      // Preserve deletion behavior for unreadable or partially-written sessions.
    }
    deleteSessionRecord({
      sessionId,
      layout: locateExistingSessionLayout(this.storeLayout, sessionId),
    });
    try {
      ArtifactManager.cleanupSessionArtifacts(sessionId, artifactRoots, { profile: this.storeLayout.profile });
    } catch {
      // Artifact cleanup is advisory and cannot turn a completed deletion into a failure.
    }
  }

  listSessions(onSource?: (target: string) => void, options?: SessionListOptions): Session[] {
    assertSessionStoreProfile(this.storeLayout, this.storeLayout.sessionsDir);
    // Every directory that may hold sessions, so a listing does not hide the ones
    // written before the directory was renamed. Ids are unique, so an id present
    // in more than one directory is one session, read from the first that has it.
    const seen = new Set<string>();
    const sessions: Session[] = [];
    for (const sessionsDir of this.storeLayout.sessionsSearchDirs) {
      for (const session of listSessionRecords({
        sessionsDir,
        loadSession: (sessionId) => {
          if (!options) return this.load(sessionId);
          const layout = locateExistingSessionLayout(this.storeLayout, sessionId);
          const input = { sessionId, layout, cwd: process.cwd() };
          return previewPendingSessionRecord({ ...input, registryPath: this.storeLayout.currentSessionStorePath })?.snapshot.session ?? loadSessionRecord(input);
        },
        warningState: this.listWarningState,
        warn: (message) => console.warn(message),
        skipSessionIds: seen,
        idPrefix: options?.previewPrefix,
        onSource,
      })) {
        seen.add(session.id);
        sessions.push(session);
      }
    }
    return sessions.sort(
      (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
    );
  }

  /** Report catalog failures through the same de-duplicated warning owner as listSessions. */
  reportCatalogUnreadable(input: SessionCatalogDiagnostic): void {
    const newlyUnreadable = input.unreadableSessionIds.filter(
      (sessionId) => !this.listWarningState.warnedUnreadableSessionDirs.has(sessionId),
    );
    if (newlyUnreadable.length > 0) {
      for (const sessionId of newlyUnreadable) {
        this.listWarningState.warnedUnreadableSessionDirs.add(sessionId);
      }
      const warning = formatUnreadableSessionDirectoryWarning({
        sessionDirs: newlyUnreadable,
      });
      if (warning) console.warn(warning);
    }

    if (
      input.unreadableDirectories.length > 0 &&
      !this.listWarningState.didWarnListSessionsFailure
    ) {
      this.listWarningState.didWarnListSessionsFailure = true;
      console.warn(
        formatListSessionsFailureWarning({
          sessionsDir: input.unreadableDirectories[0]!,
          error: new Error("session directory could not be opened"),
        }),
      );
    }
  }

  getCurrentSessionForProject(projectRoot: string, options?: { readonly readOnly?: boolean }): Session | null {
    const resolution = this.resolveCurrentSessionForProject(projectRoot, options);
    return resolution.ok ? resolution.session : null;
  }

  readCurrentSessionSelection(projectRoot: string): CurrentSessionSelectionRecord | undefined {
    assertSessionStoreProfile(this.storeLayout, this.storeLayout.currentSessionStorePath);
    return readCurrentSessionSelection({ storePaths: this.storeLayout.currentSessionStoreSearchPaths, projectRoot });
  }

  resolveCurrentSessionForProject(
    projectRoot: string,
    options?: { readonly readOnly?: boolean },
  ): CurrentSessionSelectionResolution {
    assertSessionStoreProfile(this.storeLayout, this.storeLayout.currentSessionStorePath);
    return resolveCurrentSessionForProject({
      storePath: this.storeLayout.currentSessionStorePath,
      storeSearchPaths: this.storeLayout.currentSessionStoreSearchPaths,
      projectRoot,
      sessionExists: (sessionId) => this.sessionExists(sessionId),
      loadSession: (sessionId) => this.load(sessionId, options),
      readOnly: options?.readOnly,
    });
  }

  setCurrentSessionForProject(projectRoot: string, sessionId: string, options?: SessionActivationOptions): void {
    assertSessionStoreProfile(this.storeLayout, this.storeLayout.currentSessionStorePath);
    setCurrentSessionSelection({
      storePath: this.storeLayout.currentSessionStorePath,
      storeSearchPaths: this.storeLayout.currentSessionStoreSearchPaths,
      projectRoot,
      sessionId,
      updatedAt: new Date().toISOString(),
      ...options,
    });
  }

  clearCurrentSessionForProject(projectRoot: string): void {
    assertSessionStoreProfile(this.storeLayout, this.storeLayout.currentSessionStorePath);
    clearCurrentSessionSelectionForProject({
      storePath: this.storeLayout.currentSessionStorePath,
      storeSearchPaths: this.storeLayout.currentSessionStoreSearchPaths,
      projectRoot,
    });
  }

  readStateSnapshotSafely(statePath: string): SessionStateSnapshot | undefined {
    assertSessionStoreProfile(this.storeLayout, statePath);
    return readStateSnapshotSafely(statePath);
  }

  readStateSnapshotRequired(statePath: string): SessionStateSnapshot {
    assertSessionStoreProfile(this.storeLayout, statePath);
    return readStateSnapshotRequired(statePath);
  }

  withSessionStateLock<T>(sessionId: string, action: () => T, options?: { readonly requireExisting?: boolean }): T {
    return withSessionStateLock(locateExistingSessionLayout(this.storeLayout, sessionId), () => {
      assertSessionStoreProfile(this.storeLayout);
      return action();
    }, options);
  }

  writeJsonFileAtomic(filePath: string, payload: unknown): void {
    assertSessionStoreProfile(this.storeLayout, filePath);
    writeJsonFileAtomic(filePath, payload);
  }
}
