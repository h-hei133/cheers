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
  createSessionStoreLayout,
  locateExistingSessionLayout,
  assertSessionStoreProfile,
} from "./sessionFileLayout.js";
import { writeJsonFileAtomic } from "./sessionFileStore.js";
import { SessionFiles } from './files.js';
import { SessionStorePaths } from './paths.js';
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
