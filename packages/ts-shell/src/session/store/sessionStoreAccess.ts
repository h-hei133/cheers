import type {
  CurrentSessionSelectionResolution,
} from "./currentSelection.js";
import type { Session } from "../schema/sessionRecord.js";
import type {
  SessionStateSnapshot,
  SessionStateSnapshotOverrides,
} from "../schema/sessionStateSnapshot.js";
import {
  clearCurrentSessionSelectionForProject,
  resolveCurrentSessionForProject,
  setCurrentSessionSelection,
} from "./currentSessionRegistry.js";
import {
  createSessionId,
  createSessionStoreLayout,
  ensureSessionStoreLayout,
  locateExistingSessionLayout,
  projectSessionFileLayout,
  validateSessionId,
  assertSessionStoreProfile,
  type SessionFileLayout,
  type SessionStoreLayout,
} from "./sessionFileLayout.js";
import { writeJsonFileAtomic } from "./sessionFileStore.js";
import { SessionFiles } from './files.js';
import {
  SessionCatalog,
  type SessionCatalogDiagnostic,
} from './catalog/index.js';
import {
  deleteSessionRecord,
  loadSessionRecord,
  sessionExistsAtLayout,
  writeSessionMetadataRecord,
  writeSessionRecord,
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

export class SessionStoreAccess {
  readonly files: SessionFiles;
  readonly catalog: SessionCatalog;
  private readonly storeLayout: SessionStoreLayout;
  private readonly listWarningState: SessionListWarningState = {
    warnedUnreadableSessionDirs: new Set<string>(),
    didWarnListSessionsFailure: false,
  };

  constructor() {
    this.storeLayout = createSessionStoreLayout();
    this.files = new SessionFiles(this.storeLayout);
    this.catalog = new SessionCatalog(this.storeLayout);
    this.ensureLayout();
  }

  /** Directory that holds session directories; the reentry index lives beside them. */
  get sessionsDir(): string { return this.storeLayout.sessionsDir; }

  ensureLayout(): void {
    ensureSessionStoreLayout(this.storeLayout);
  }

  createSessionId(): string {
    return createSessionId();
  }

  validateSessionId(sessionId: string): string {
    return validateSessionId(sessionId);
  }

  sessionDir(sessionId: string): string {
    return locateExistingSessionLayout(this.storeLayout, sessionId).sessionDir;
  }

  metadataPath(sessionId: string): string {
    return locateExistingSessionLayout(this.storeLayout, sessionId).metadataPath;
  }

  transcriptPath(sessionId: string, onSource?: (target: string) => void): string {
    for (const sessionsDir of this.storeLayout.sessionsSearchDirs) {
      onSource?.(projectSessionFileLayout({ sessionsDir, sessionId }).sessionDir);
    }
    return locateExistingSessionLayout(this.storeLayout, sessionId).transcriptPath;
  }

  statePath(sessionId: string): string {
    return locateExistingSessionLayout(this.storeLayout, sessionId).statePath;
  }

  /**
   * Where a session's state lives, for the callers that read and write it whole.
   *
   * The thread operations need the path and its lock together, and resolving them
   * separately would let the two disagree if the layout were located twice.
   */
  stateLayout(sessionId: string): SessionFileLayout {
    return locateExistingSessionLayout(this.storeLayout, sessionId);
  }

  sessionExists(sessionId: string): boolean {
    if (!sessionId?.trim()) {
      return false;
    }
    return sessionExistsAtLayout(locateExistingSessionLayout(this.storeLayout, sessionId.trim()));
  }

  load(sessionId: string): Session {
    return loadSessionRecord({
      sessionId,
      layout: locateExistingSessionLayout(this.storeLayout, sessionId),
      cwd: process.cwd(),
    });
  }

  writeSession(session: Session): void {
    writeSessionRecord({
      session,
      layout: locateExistingSessionLayout(this.storeLayout, session.id),
    });
  }

  writeSessionMetadata(session: Session): void {
    writeSessionMetadataRecord({
      session,
      layout: locateExistingSessionLayout(this.storeLayout, session.id),
    });
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
    deleteSessionRecord({
      sessionId,
      layout: locateExistingSessionLayout(this.storeLayout, sessionId),
    });
  }

  listSessions(onSource?: (target: string) => void): Session[] {
    assertSessionStoreProfile(this.storeLayout, this.storeLayout.sessionsDir);
    // Every directory that may hold sessions, so a listing does not hide the ones
    // written before the directory was renamed. Ids are unique, so an id present
    // in more than one directory is one session, read from the first that has it.
    const seen = new Set<string>();
    const sessions: Session[] = [];
    for (const sessionsDir of this.storeLayout.sessionsSearchDirs) {
      for (const session of listSessionRecords({
        sessionsDir,
        loadSession: (sessionId) => this.load(sessionId),
        warningState: this.listWarningState,
        warn: (message) => console.warn(message),
        skipSessionIds: seen,
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
      loadSession: (sessionId) => this.load(sessionId),
      readOnly: options?.readOnly,
    });
  }

  setCurrentSessionForProject(projectRoot: string, sessionId: string): void {
    assertSessionStoreProfile(this.storeLayout, this.storeLayout.currentSessionStorePath);
    setCurrentSessionSelection({
      storePath: this.storeLayout.currentSessionStorePath,
      storeSearchPaths: this.storeLayout.currentSessionStoreSearchPaths,
      projectRoot,
      sessionId,
      updatedAt: new Date().toISOString(),
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
