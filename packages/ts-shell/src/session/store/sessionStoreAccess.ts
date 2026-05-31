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
  projectSessionFileLayout,
  validateSessionId,
  type SessionFileLayout,
  type SessionStoreLayout,
} from "./sessionFileLayout.js";
import { writeJsonFileAtomic } from "./sessionFileStore.js";
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

export class SessionStoreAccess {
  private readonly storeLayout: SessionStoreLayout;
  private readonly listWarningState: SessionListWarningState = {
    warnedUnreadableSessionDirs: new Set<string>(),
    didWarnListSessionsFailure: false,
  };

  constructor() {
    this.storeLayout = createSessionStoreLayout();
    this.ensureLayout();
  }

  ensureLayout(): void {
    ensureSessionStoreLayout(this.storeLayout);
  }

  createSessionId(): string {
    return createSessionId();
  }

  validateSessionId(sessionId: string): string {
    return validateSessionId(sessionId);
  }

  fileLayout(sessionId: string): SessionFileLayout {
    return projectSessionFileLayout({
      sessionsDir: this.storeLayout.sessionsDir,
      sessionId,
    });
  }

  sessionDir(sessionId: string): string {
    return this.fileLayout(sessionId).sessionDir;
  }

  metadataPath(sessionId: string): string {
    return this.fileLayout(sessionId).metadataPath;
  }

  transcriptPath(sessionId: string): string {
    return this.fileLayout(sessionId).transcriptPath;
  }

  statePath(sessionId: string): string {
    return this.fileLayout(sessionId).statePath;
  }

  sessionExists(sessionId: string): boolean {
    if (!sessionId?.trim()) {
      return false;
    }
    return sessionExistsAtLayout(this.fileLayout(sessionId.trim()));
  }

  load(sessionId: string): Session {
    return loadSessionRecord({
      sessionId,
      layout: this.fileLayout(sessionId),
      cwd: process.cwd(),
    });
  }

  writeSession(session: Session): void {
    writeSessionRecord({
      session,
      layout: this.fileLayout(session.id),
    });
  }

  writeSessionMetadata(session: Session): void {
    writeSessionMetadataRecord({
      session,
      layout: this.fileLayout(session.id),
    });
  }

  writeSessionState(
    session: Session,
    overrides?: SessionStateSnapshotOverrides,
  ): void {
    writeSessionState({
      session,
      layout: this.fileLayout(session.id),
      overrides,
    });
  }

  deleteSession(sessionId: string): void {
    deleteSessionRecord({
      sessionId,
      layout: this.fileLayout(sessionId),
    });
  }

  listSessions(): Session[] {
    return listSessionRecords({
      sessionsDir: this.storeLayout.sessionsDir,
      loadSession: (sessionId) => this.load(sessionId),
      warningState: this.listWarningState,
      warn: (message) => console.warn(message),
    });
  }

  getCurrentSessionForProject(projectRoot: string): Session | null {
    const resolution = this.resolveCurrentSessionForProject(projectRoot);
    return resolution.ok ? resolution.session : null;
  }

  resolveCurrentSessionForProject(
    projectRoot: string,
  ): CurrentSessionSelectionResolution {
    return resolveCurrentSessionForProject({
      storePath: this.storeLayout.currentSessionStorePath,
      projectRoot,
      sessionExists: (sessionId) => this.sessionExists(sessionId),
      loadSession: (sessionId) => this.load(sessionId),
    });
  }

  setCurrentSessionForProject(projectRoot: string, sessionId: string): void {
    setCurrentSessionSelection({
      storePath: this.storeLayout.currentSessionStorePath,
      projectRoot,
      sessionId,
      updatedAt: new Date().toISOString(),
    });
  }

  clearCurrentSessionForProject(projectRoot: string): void {
    clearCurrentSessionSelectionForProject({
      storePath: this.storeLayout.currentSessionStorePath,
      projectRoot,
    });
  }

  readStateSnapshotSafely(statePath: string): SessionStateSnapshot | undefined {
    return readStateSnapshotSafely(statePath);
  }

  readStateSnapshotRequired(statePath: string): SessionStateSnapshot {
    return readStateSnapshotRequired(statePath);
  }

  withSessionStateLock<T>(sessionId: string, action: () => T): T {
    return withSessionStateLock(this.fileLayout(sessionId), action);
  }

  writeJsonFileAtomic(filePath: string, payload: unknown): void {
    writeJsonFileAtomic(filePath, payload);
  }
}
