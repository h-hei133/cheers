/**
 * Where this tool keeps the state that belongs to the person using it.
 *
 * The name has changed twice, and the earlier directories are still on disk with
 * real content in them: `~/.cheer` holds sessions, teams and tasks,
 * `~/.private-agents` holds settings, skills and sessions, and `~/.coding-agents`
 * holds logs, plugins and trust decisions. Losing them would mean re-authoring
 * skills and re-approving hooks, so reads consult the old locations rather than
 * pretending they are not there.
 *
 * Reads therefore try the current directory first and each earlier one after it,
 * while writes always land in the current one. That ordering is what makes the
 * change invisible to someone who already has data: everything they had is still
 * found, and anything new is written once, in one place. A file that only exists
 * in an old directory is read from there and, the next time it is written, copied
 * forward — no separate migration step.
 *
 * The directories are listed newest first, and the order is the whole contract:
 * a name that appears earlier wins.
 */

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { assertProfileIdentity, currentProfile, profilePath } from './profile/context.js';

/** The directory in use now. */
const CURRENT_DIRECTORY_NAME = ".cheers";

/**
 * Where the same state used to live, most recent first.
 *
 * Nothing writes here any more. They are read so that an existing installation
 * keeps working, and dropped when a future release no longer expects them.
 */
const LEGACY_DIRECTORY_NAMES = [".cheer", ".private-agents", ".coding-agents"] as const;

/** The home directory to resolve against, honouring the environment override. */
export function userHomeDir(): string {
  return currentProfile()?.homeDir ?? (process.env.USERPROFILE || process.env.HOME || os.homedir());
}

/**
 * The directory to write user state to.
 *
 * Always the current name, even when an older directory exists, so that state
 * does not keep accreting in a location that is only read.
 */
export function userDataDir(): string {
  const profile = currentProfile();
  return profile ? profilePath('.', profile) : path.join(userHomeDir(), CURRENT_DIRECTORY_NAME);
}

/**
 * The current data directory under an explicit root, rather than the real home.
 *
 * For the callers that take a root as an argument — session storage, project
 * state, sandbox rules — so a test or an isolated run gets its own tree instead
 * of writing to the operator's home. The name is the same one `userDataDir`
 * uses, which is what keeps the two from diverging.
 */
export function userDataDirFor(root: string): string {
  const profile = currentProfile();
  if (!profile) return path.join(root, CURRENT_DIRECTORY_NAME);
  assertProfileHome(root);
  return profilePath('.', profile);
}

/**
 * Every directory a user file may be found in, current first.
 *
 * Exposed for the cases that need to look at more than one — listing what a user
 * has, or reporting where a value came from — rather than only resolving a path.
 */
export function userDataSearchDirs(): readonly string[] {
  return userDataSearchDirsFor(userHomeDir());
}

/**
 * Every directory under an explicit root that a user file may be found in.
 *
 * The root-scoped twin of {@link userDataSearchDirs}, for the callers that take a
 * home directory as an argument instead of reading the environment.
 */
export function userDataSearchDirsFor(root: string): readonly string[] {
  const profile = currentProfile();
  if (profile) {
    assertProfileHome(root);
    assertProfileIdentity(profile);
    if (profile.id !== 'default') return [profile.root];
    return [profile.root, ...LEGACY_DIRECTORY_NAMES.map(name => path.join(profile.homeDir, name))];
  }
  return [CURRENT_DIRECTORY_NAME, ...LEGACY_DIRECTORY_NAMES].map((name) => path.join(root, name));
}

/**
 * The path to read `relativePath` from, preferring the current directory.
 *
 * Falls back to an older directory only when the file actually exists there, so
 * the answer is a path that can be opened. Returns the current path when none of
 * them has it, which is the path a caller should then create.
 *
 * `root` names the home directory to resolve under. It defaults to the real one,
 * and callers that were handed a specific home must pass it: reading the
 * environment here instead would silently look in the operator's home while the
 * caller believes it is isolated.
 */
export function resolveUserDataFile(relativePath: string, root?: string): string {
  const profile = currentProfile();
  if (profile) {
    if (root !== undefined) assertProfileHome(root);
    const target = profilePath(relativePath, profile);
    if (profile.id !== 'default') return target;
  }
  const dirs = root === undefined ? userDataSearchDirs() : userDataSearchDirsFor(root);
  const candidates = dirs.map((dir) => path.join(dir, relativePath));
  return candidates.find((candidate) => fs.existsSync(candidate)) ?? candidates[0]!;
}

/**
 * Every existing path for `relativePath`, current first.
 *
 * For the callers that merge rather than choose — reading a whole directory of
 * skills, say, where an older file is not superseded but additional. Works for a
 * directory as well as a file: state that is a tree rather than one file
 * (sessions, teams, tasks) is found the same way, and a caller that read only the
 * current name would lose what an older installation already has.
 */
export function resolveAllUserDataFiles(relativePath: string, root?: string): readonly string[] {
  const profile = currentProfile();
  if (profile) {
    if (root !== undefined) assertProfileHome(root);
    const target = profilePath(relativePath, profile);
    if (profile.id !== 'default') return fs.existsSync(target) ? [target] : [];
  }
  const dirs = root === undefined ? userDataSearchDirs() : userDataSearchDirsFor(root);
  return dirs
    .map((dir) => path.join(dir, relativePath))
    .filter((candidate) => fs.existsSync(candidate));
}

function assertProfileHome(root: string): void {
  const profile = currentProfile();
  if (profile && fs.realpathSync(root) !== profile.homeDir) throw new Error('The requested home differs from the captured profile.');
}
