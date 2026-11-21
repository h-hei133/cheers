import * as crypto from "node:crypto";
import * as fs from "node:fs";
import { profileSearchDirs, userDataSearchDirsFor, userDataDirFor, userHomeDir } from "../../core/paths/userHome.js";
import * as path from "node:path";
import { assertProfileIdentity, currentProfile, profilePath, type ProfileContext } from '../../core/paths/profile/context.js';
import { withFileLock } from './sessionFileStore.js';

export interface SessionStoreLayout {
  readonly profile?: ProfileContext;
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

export function createSessionStoreLayout(homeDir?: string, profile = currentProfile()): SessionStoreLayout {
  const root = homeDir ?? userHomeDir();
  if (profile && homeDir !== undefined && fs.realpathSync(root) !== profile.homeDir) throw new Error('The requested home differs from the captured profile.');
  const dataRoot = profile ? profilePath('.', profile) : userDataDirFor(root);
  const search = profile ? profileSearchDirs(profile) : userDataSearchDirsFor(root);
  const sessionsDir = path.join(dataRoot, "sessions");
  const currentSessionStorePath = path.join(
    dataRoot,
    "current-session.json",
  );
  return {
    ...(profile ? { profile } : {}),
    sessionsDir,
    // `resolveAllUserDataFiles` returns only the directories that exist, so the
    // current one is added when nothing is there yet: a fresh install still has
    // one place to read from and one place to write to, and they are the same.
    sessionsSearchDirs: [
      ...new Set([sessionsDir, ...search.map(dir => path.join(dir, 'sessions')).filter(target => fs.existsSync(target))]),
    ],
    currentSessionStorePath,
    currentSessionStoreSearchPaths: [
      ...new Set([
        currentSessionStorePath,
        ...search.map(dir => path.join(dir, 'current-session.json')).filter(target => fs.existsSync(target)),
      ]),
    ],
  };
}

export function ensureSessionStoreLayout(layout: SessionStoreLayout): void {
  assertSessionStoreProfile(layout, layout.sessionsDir);
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

export function sessionCreationDirectory(layout: SessionStoreLayout): string {
  const directory = path.join(path.dirname(layout.sessionsDir), '.session-create');
  assertSessionStoreProfile(layout, directory);
  return directory;
}

/** Serialize publication of the same ID by ordinary and staged creators. */
export function reserveSessionLayout(layout: SessionStoreLayout, sessionId: string,
  publish?: (target: SessionFileLayout) => void): SessionFileLayout {
  const id = validateSessionId(sessionId);
  assertSessionStoreProfile(layout, layout.sessionsDir);
  const reserved = projectSessionFileLayout({ sessionsDir: layout.sessionsDir, sessionId: id });
  if (id === '.' || id === '..') throw new Error(`Session ${id} already exists`);
  const lock = path.join(sessionCreationDirectory(layout), 'locks', id);
  assertSessionStoreProfile(layout, lock);
  return withFileLock(lock, () => {
    for (const sessionsDir of layout.sessionsSearchDirs) {
      const candidate = projectSessionFileLayout({ sessionsDir, sessionId: id });
      assertSessionStoreProfile(layout, candidate.sessionDir);
      let existing: fs.Stats | undefined;
      try {
        existing = fs.lstatSync(candidate.sessionDir, { throwIfNoEntry: false });
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOTDIR') throw error;
      }
      if (existing) throw new Error(`Session ${id} already exists`);
    }
    for (const target of Object.values(reserved)) assertSessionStoreProfile(layout, target);
    try {
      if (publish) publish(reserved);
      else fs.mkdirSync(reserved.sessionDir);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'EEXIST') throw new Error(`Session ${id} already exists`);
      throw error;
    }
    return reserved;
  }, { recovery: 'local-dead' });
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
  assertSessionStoreProfile(layout);
  for (const sessionsDir of layout.sessionsSearchDirs) {
    const candidate = projectSessionFileLayout({ sessionsDir, sessionId });
    for (const target of Object.values(candidate)) assertSessionStoreProfile(layout, target);
    if (fs.existsSync(candidate.sessionDir)) {
      return candidate;
    }
  }
  return projectSessionFileLayout({ sessionsDir: layout.sessionsDir, sessionId });
}

/** A captured store never follows a replaced profile or a link into another one. */
export function assertSessionStoreProfile(layout: SessionStoreLayout, target?: string): void {
  if (!layout.profile) return;
  assertProfileIdentity(layout.profile);
  if (target && layout.profile.id !== 'default') profilePath(path.relative(layout.profile.root, target), layout.profile);
}
