import fs from "node:fs";
import path from "node:path";
import { createComponentLogger } from "../../observability/structuredLogger.js";
import { applyTheme, currentTheme } from "../theme/theme.js";
import { selectedTheme } from "../theme/selection.js";
import { themeSourcePath } from "./index.js";

/**
 * Follow a theme file, so editing it shows up without a restart.
 *
 * A theme is a file the user edits, and editing a palette is iterative: the whole
 * activity is trying a colour, looking at it, and changing it again. Requiring a
 * restart between attempts makes that a chore, and the theme is already read from
 * disk on every load — the only thing missing is noticing when the file changed.
 *
 * Reloading is safe because a theme is recoloured in place. Surfaces hold the
 * shared instance rather than a name to look up, so adopting a new palette reaches
 * every one of them, and the revision counter they cache rendered rows against
 * moves with it. What is left for this module is the two things a render cache
 * cannot do for itself: noticing the change, and asking for one repaint.
 *
 * Detection and scheduling are separate on purpose. Watching is a platform event
 * arriving on the real event loop; debouncing and deciding whether to reload are
 * ordinary logic. Keeping them apart is what lets the second half be tested
 * without a filesystem and the first half be a thin composition.
 */

/**
 * How long to wait after the last change before reloading.
 *
 * Editors write a file in more than one step, and a reload per step would read a
 * half-written file. Short enough that the change still feels immediate.
 */
export const RELOAD_DEBOUNCE_MS = 100;

/** Which file to follow, and how to resolve it again later. */
export interface ThemeWatchTarget {
  readonly name: string;
  readonly filePath: string;
  readonly workspaceRoot: string;
  readonly extraPaths: readonly string[];
}

/** A running watcher, and the way to stop it. */
export interface ThemeWatcher {
  stop(): void;
}

/**
 * The debounce and reload half, without any filesystem events.
 *
 * Exported so the decisions it makes — coalescing a burst into one reload,
 * leaving a momentarily-absent file alone, giving up on a palette that does not
 * parse, ignoring a reload once the theme has been switched away from — can be
 * driven by a test clock instead of an actual file being edited.
 */
export interface ThemeReloader {
  /** Note that the file may have changed; the reload happens after the burst. */
  schedule(): void;
  stop(): void;
  /** Reload now, past the debounce. For the caller that already knows it changed. */
  reload(): void;
}

export function createThemeReloader(target: ThemeWatchTarget, onReload: () => void): ThemeReloader {
  let timer: NodeJS.Timeout | undefined;

  const applyNow = (): void => {
    // The theme may have been switched since this was scheduled, in which case
    // the file this knows about is no longer the one on screen.
    if (selectedTheme() === "auto" || currentTheme() !== target.name) return;
    try {
      if (!fs.existsSync(target.filePath)) return;
      applyTheme(target.name, target.workspaceRoot, target.extraPaths);
    } catch {
      // A file being edited is invalid for part of the write. The last palette
      // that worked stays up, and the next save reloads.
      return;
    }
    onReload();
  };

  return {
    schedule: () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        timer = undefined;
        applyNow();
      }, RELOAD_DEBOUNCE_MS);
      // A pending reload is not a reason for the process to stay alive. Without
      // this, a reload scheduled just as the user quits holds the exit open for
      // as long as the timer had left to run.
      timer.unref();
    },
    reload: () => {
      if (timer) {
        clearTimeout(timer);
        timer = undefined;
      }
      applyNow();
    },
    stop: () => {
      if (timer) {
        clearTimeout(timer);
        timer = undefined;
      }
    },
  };
}

/**
 * Follow the theme in use, if it came from a file, and repaint when it changes.
 *
 * `onReload` is called after a successful reload. It exists because adopting a
 * palette is not the same as showing it: a repaint has to be asked for, and only
 * the caller knows how to ask.
 *
 * Returns nothing when there is nothing to watch — a bundled theme, or a name
 * that resolves to no file. That is not a failure: it is the ordinary case for
 * someone who never wrote a theme.
 */
export function watchTheme(options: {
  readonly workspaceRoot?: string;
  readonly extraPaths?: readonly string[];
  readonly onReload: () => void;
}): ThemeWatcher | undefined {
  const target = resolveThemeTarget(options.workspaceRoot, options.extraPaths);
  if (!target) return undefined;
  const reloader = createThemeReloader(target, options.onReload);

  const directory = path.dirname(target.filePath);
  const fileName = path.basename(target.filePath);

  let watcher: fs.FSWatcher | undefined;
  try {
    // The directory rather than the file: an editor that saves by replacing the
    // file leaves the old inode behind, and a watch on a file whose inode has
    // changed stops reporting anything.
    watcher = fs.watch(directory, (_event, changed) => {
      // A null name means the platform could not say which file changed, and a
      // different name is a different theme being edited.
      if (changed && path.basename(changed.toString()) !== fileName) return;
      reloader.schedule();
    });
  } catch (error) {
    createComponentLogger("themes").warn(
      `Theme file could not be watched: ${error instanceof Error ? error.message : String(error)}`,
    );
    return { stop: () => reloader.stop() };
  }

  // Watching must not be what keeps the process running.
  watcher.unref();

  return {
    stop: () => {
      reloader.stop();
      try {
        watcher?.close();
      } catch {
        // Closing a watcher that is already gone is not worth reporting.
      }
    },
  };
}

/**
 * Which file to follow, or nothing when the active theme is not a file.
 *
 * Resolved through the same discovery a load uses, so a theme the project
 * shadows and a theme named on the command line are both followed at the file
 * that actually won rather than at the first directory that happens to have one.
 */
export function resolveThemeTarget(
  workspaceRoot?: string,
  extraPaths?: readonly string[],
): ThemeWatchTarget | undefined {
  const name = currentTheme();
  if (!name || selectedTheme() === "auto") return undefined;
  const root = workspaceRoot ?? process.cwd();
  const paths = extraPaths ?? [];
  const filePath = themeSourcePath(name, root, paths);
  if (!filePath) return undefined;
  return { name, filePath, workspaceRoot: root, extraPaths: paths };
}



/**
 * Follow whichever theme is in use, across switches.
 *
 * The caller says when to re-resolve and when to stop; everything about which
 * file is being followed stays in here. That split matters because the caller is
 * an interactive loop that already has a lifecycle to manage, and a watcher it
 * has to remember to stop and start in the right order is one more thing it can
 * get wrong.
 *
 * `refresh` is safe to call when nothing changed: it stops what it had and
 * resolves again, which is the same work a switch needs and harmless otherwise.
 */
export interface ThemeFollower {
  /** Re-resolve which file to follow. Call after the theme in use changes. */
  refresh(): void;
  stop(): void;
}

export function followTheme(options: {
  readonly workspaceRoot?: string;
  readonly extraPaths?: readonly string[];
  readonly onReload: () => void;
}): ThemeFollower {
  let watcher: ThemeWatcher | undefined;
  const start = (): void => {
    watcher?.stop();
    watcher = watchTheme(options);
  };
  start();
  return {
    refresh: start,
    stop: () => {
      watcher?.stop();
      watcher = undefined;
    },
  };
}
