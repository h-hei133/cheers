import {
  createSessionId,
  ensureSessionStoreLayout,
  locateExistingSessionLayout,
  projectSessionFileLayout,
  validateSessionId,
  type SessionFileLayout,
  type SessionStoreLayout,
} from './sessionFileLayout.js';

/** All path queries resolve against the store identity captured at construction. */
export class SessionStorePaths {
  constructor(protected readonly storeLayout: SessionStoreLayout) {}

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

}
