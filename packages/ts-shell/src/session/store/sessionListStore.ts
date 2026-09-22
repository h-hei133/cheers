import * as fs from "node:fs";
import type { Session } from "../schema/sessionRecord.js";
import {
  formatListSessionsFailureWarning,
  formatUnreadableSessionDirectoryWarning,
} from "../presentation/sessionWarningSurface.js";

export interface SessionListWarningState {
  readonly warnedUnreadableSessionDirs: Set<string>;
  didWarnListSessionsFailure: boolean;
}

export function listSessionRecords(input: {
  readonly sessionsDir: string;
  readonly loadSession: (sessionId: string) => Session;
  readonly warningState: SessionListWarningState;
  readonly warn: (message: string) => void;
  /**
   * Ids to leave out of this listing.
   *
   * When sessions are read from more than one directory, an id found in an
   * earlier one must not be loaded again from a later one. Skipping rather than
   * loading and discarding keeps a duplicate from being reported as unreadable.
   */
  readonly skipSessionIds?: ReadonlySet<string>;
}): Session[] {
  try {
    const entries = fs.readdirSync(input.sessionsDir, { withFileTypes: true });
    const sessions: Session[] = [];
    const newlyUnreadableSessionDirs: string[] = [];

    for (const entry of entries) {
      if (!entry.isDirectory()) {
        continue;
      }
      if (input.skipSessionIds?.has(entry.name)) {
        continue;
      }

      try {
        sessions.push(input.loadSession(entry.name));
      } catch {
        if (!input.warningState.warnedUnreadableSessionDirs.has(entry.name)) {
          input.warningState.warnedUnreadableSessionDirs.add(entry.name);
          newlyUnreadableSessionDirs.push(entry.name);
        }
      }
    }

    if (newlyUnreadableSessionDirs.length > 0) {
      const warning = formatUnreadableSessionDirectoryWarning({
        sessionDirs: newlyUnreadableSessionDirs,
      });
      if (warning) {
        input.warn(warning);
      }
    }

    return sessions.sort(
      (a, b) =>
        new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
    );
  } catch (error) {
    if (!input.warningState.didWarnListSessionsFailure) {
      input.warningState.didWarnListSessionsFailure = true;
      input.warn(
        formatListSessionsFailureWarning({
          sessionsDir: input.sessionsDir,
          error,
        }),
      );
    }
    return [];
  }
}
