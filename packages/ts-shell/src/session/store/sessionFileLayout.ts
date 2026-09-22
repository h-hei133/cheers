import * as crypto from "node:crypto";
import * as fs from "node:fs";
import * as os from "node:os";
import { resolveAllUserDataFiles, userDataDirFor } from "../../core/paths/userHome.js";
import * as path from "node:path";

export interface SessionStoreLayout {
  readonly sessionsDir: string;
  /**
   * Every directory a session may already live in, current first.
   *
   * Sessions are a directory per id, so they are not resolved one file at a time
   * the way a config is: a session written under an older name is still that
   * session, and a listing or a resume that read only the current directory would
   * lose it. New sessions are still created in {@link sessionsDir}.
   */
  readonly sessionsSearchDirs: readonly string[];
  readonly currentSessionStorePath: string;
  /** Every pointer store that may already exist, current first. */
  readonly currentSessionStoreSearchPaths: readonly string[];
}

export interface SessionFileLayout {
  readonly sessionDir: string;
  readonly metadataPath: string;
  readonly transcriptPath: string;
  readonly statePath: string;
  readonly stateLockPath: string;
}

export function createSessionStoreLayout(homeDir?: string): SessionStoreLayout {
  const root = homeDir ?? process.env.USERPROFILE ?? process.env.HOME ?? os.homedir();
  const sessionsDir = path.join(userDataDirFor(root), "sessions");
  const currentSessionStorePath = path.join(
    userDataDirFor(root),
    "current-session.json",
  );
  return {
    sessionsDir,
    // `resolveAllUserDataFiles` returns only the directories that exist, so the
    // current one is added when nothing is there yet: a fresh install still has
    // one place to read from and one place to write to, and they are the same.
    sessionsSearchDirs: [
      ...new Set([sessionsDir, ...resolveAllUserDataFiles("sessions", root)]),
    ],
    currentSessionStorePath,
    currentSessionStoreSearchPaths: [
      ...new Set([
        currentSessionStorePath,
        ...resolveAllUserDataFiles("current-session.json", root),
      ]),
    ],
  };
}

export function ensureSessionStoreLayout(layout: SessionStoreLayout): void {
  if (!fs.existsSync(layout.sessionsDir)) {
    fs.mkdirSync(layout.sessionsDir, { recursive: true });
  }
}

export function createSessionId(): string {
  return `sess_${crypto.randomBytes(8).toString("hex")}_${Date.now()}`;
}

export function validateSessionId(sessionId: string): string {
  const normalizedId = sessionId.trim();
  if (!normalizedId) {
    throw new Error("Session id is required");
  }
  if (!/^[A-Za-z0-9_.-]+$/.test(normalizedId)) {
    throw new Error(
      `Invalid session id "${sessionId}". Allowed characters: letters, numbers, dot, underscore, dash.`,
    );
  }
  return normalizedId;
}

export function projectSessionFileLayout(input: {
  readonly sessionsDir: string;
  readonly sessionId: string;
}): SessionFileLayout {
  const sessionDir = path.join(input.sessionsDir, input.sessionId);
  return {
    sessionDir,
    metadataPath: path.join(sessionDir, "metadata.json"),
    transcriptPath: path.join(sessionDir, "transcript.jsonl"),
    statePath: path.join(sessionDir, "state.json"),
    stateLockPath: path.join(sessionDir, "state.lock"),
  };
}

/**
 * Where a session of this id actually is, current directory first.
 *
 * A session written before the state directory was renamed is still that session,
 * so every caller that reads or writes one by id has to look in each directory the
 * layout searched rather than assume the current one. Reading only
 * {@link SessionStoreLayout.sessionsDir} finds nothing for a session an earlier
 * name left behind — the file is there, the lookup just never asks about it.
 *
 * Falls back to the current directory, which is where a session that does not
 * exist yet would be created.
 */
export function locateExistingSessionLayout(
  layout: SessionStoreLayout,
  sessionId: string,
): SessionFileLayout {
  for (const sessionsDir of layout.sessionsSearchDirs) {
    const candidate = projectSessionFileLayout({ sessionsDir, sessionId });
    if (fs.existsSync(candidate.sessionDir)) {
      return candidate;
    }
  }
  return projectSessionFileLayout({ sessionsDir: layout.sessionsDir, sessionId });
}
