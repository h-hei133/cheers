import fs from "node:fs";
import path from "node:path";
import { dark as darkJson, light as lightJson, darkContrast, lightContrast } from "./assets.js";
import { projectDirectories } from "../../core/project/directories.js";
import { userDataSearchDirsFor } from "../../core/paths/userHome.js";

import { parseTheme, type ThemeConfig } from "./schema.js";
export type { ThemeConfig } from "./schema.js";

/**
 * The themes that ship, keyed by name.
 *
 * These are the fallback as well as the defaults: a name that no file on disk
 * claims resolves here, so removing a user's theme directory never leaves the
 * surface with nothing to render in.
 */
const builtIn: Record<string, ThemeConfig> = {
  dark: darkJson,
  light: lightJson,
  "dark-contrast": darkContrast,
  "light-contrast": lightContrast,
};

/** Where a user keeps their own themes. */
const THEME_DIRECTORY = "themes";
/** Where a project keeps the ones it ships. */
const PROJECT_THEME_PATH = [".agents", "themes"] as const;

/** A theme file a user wrote, with where it came from. */
interface DiscoveredTheme {
  readonly name: string;
  readonly config?: ThemeConfig;
  readonly error?: Error;
  readonly filePath: string;
}

/**
 * Themes on disk, from the user's directory, the project's, and any path the
 * user named on the command line.
 *
 * Read rather than bundled because a theme is a palette, and a palette someone
 * wants is one they can edit. Bundling only two meant the answer to "can I use
 * my own colors" was no, with nothing in the product saying why.
 *
 * Both layers are searched each time rather than cached: a theme is read once per
 * session at most, and a stale cache would mean editing a file and seeing
 * nothing happen.
 *
 * `extraPaths` are the paths a `--theme` flag named, and they load last so they
 * win: naming a file is a more specific statement than whatever the directories
 * happen to contain, and a user trying a theme out expects to see the one they
 * pointed at rather than one it collided with.
 */
function discoverThemes(
  workspaceRoot: string,
  extraPaths: readonly string[] = [],
): Map<string, DiscoveredTheme> {
  const found = new Map<string, DiscoveredTheme>();

  // The user's directory first, then every project directory from the outermost
  // in. Later wins, so a project overrides the user and a nearer project
  // directory overrides a farther one — the same precedence the instruction and
  // skill readers use.
  const userDirs = userDataSearchDirsFor(process.env.USERPROFILE ?? process.env.HOME ?? "")
    .map((directory) => path.join(directory, THEME_DIRECTORY));
  const projectDirs = projectDirectories(workspaceRoot)
    .map((directory) => path.join(directory, ...PROJECT_THEME_PATH))
    .reverse();

  for (const directory of [...userDirs, ...projectDirs]) {
    for (const theme of readThemeDirectory(directory)) {
      found.set(theme.name, theme);
    }
  }
  // A named path may be one file or a directory of them, which is the shape the
  // reference uses: the file is the common case while developing a theme, and
  // the directory is how a theme collection is shared.
  for (const entry of extraPaths) {
    for (const theme of readThemePath(entry)) {
      found.set(theme.name, theme);
    }
  }
  return found;
}

/** The themes one named path holds, whether it is a file or a directory. */
function readThemePath(entry: string): DiscoveredTheme[] {
  let stats: fs.Stats;
  try {
    stats = fs.statSync(entry);
  } catch {
    // Named and unreadable: reported by the caller rather than silently dropped,
    // because a mistyped path would otherwise look like a theme that simply did
    // not apply.
    return [];
  }
  if (stats.isDirectory()) return readThemeDirectory(entry);
  if (!stats.isFile()) return [];
  const theme = readThemeFile(entry);
  return theme ? [theme] : [];
}

/** Preserve invalid files as diagnostics so selecting one cannot silently fall back. */
function readThemeFile(filePath: string): DiscoveredTheme {
  const fallback = path.basename(filePath, ".json");
  let name = fallback;
  try {
    if (fs.statSync(filePath).size > 256 * 1024) throw new Error("Theme exceeds 256 KiB.");
    const parsed: unknown = JSON.parse(fs.readFileSync(filePath, "utf8"));
    if (parsed && typeof parsed === "object" && "name" in parsed && typeof parsed.name === "string" && parsed.name.trim()) {
      name = parsed.name.trim();
    }
    const config = parseTheme(parsed, fallback, builtIn.dark!);
    return { name: config.name, config, filePath };
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    return { name, filePath, error: new Error(`Invalid theme ${name}: ${reason}`) };
  }
}

/** Every readable theme file in one directory, ignoring anything malformed. */
function readThemeDirectory(directory: string): DiscoveredTheme[] {
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(directory, { withFileTypes: true });
  } catch {
    return [];
  }

  const themes: DiscoveredTheme[] = [];
  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith(".json")) continue;
    const theme = readThemeFile(path.join(directory, entry.name));
    if (theme) themes.push(theme);
  }
  return themes;
}

/** Every theme name a user may select: the bundled ones, plus any on disk. */
export function listThemes(
  workspaceRoot: string = process.cwd(),
  extraPaths: readonly string[] = [],
): string[] {
  const names = new Set(Object.keys(builtIn));
  for (const name of discoverThemes(workspaceRoot, extraPaths).keys()) names.add(name);
  return [...names].sort();
}

/**
 * One theme by name, or nothing when no theme claims it.
 *
 * A theme on disk shadows a bundled one of the same name, so a user can adjust
 * `dark` without losing the ability to fall back to the original — deleting their
 * file restores it. A theme named on the command line shadows both.
 */
export function loadTheme(
  name: string,
  workspaceRoot: string = process.cwd(),
  extraPaths: readonly string[] = [],
): ThemeConfig | undefined {
  const theme = discoverThemes(workspaceRoot, extraPaths).get(name);
  if (theme?.error) throw theme.error;
  return theme?.config ?? (Object.hasOwn(builtIn, name) ? builtIn[name] : undefined);
}

/**
 * The file a theme was read from, when it came from disk.
 *
 * Nothing for a bundled theme: those are compiled in and there is no file whose
 * editing should change anything. A caller that wants to notice a theme file
 * being edited needs the path, and only this layer knows which one won after
 * the user, project and command-line layers were resolved.
 */
export function themeSourcePath(
  name: string,
  workspaceRoot: string = process.cwd(),
  extraPaths: readonly string[] = [],
): string | undefined {
  return discoverThemes(workspaceRoot, extraPaths).get(name)?.filePath;
}

export function getDefaultTheme(appearance: "dark" | "light" = "dark"): ThemeConfig {
  return builtIn[appearance]!;
}

/** Where a theme came from, for a listing that has to explain precedence. */
export function themeSource(
  name: string,
  workspaceRoot: string = process.cwd(),
  extraPaths: readonly string[] = [],
): "user-or-project" | "built-in" {
  return discoverThemes(workspaceRoot, extraPaths).has(name) ? "user-or-project" : "built-in";
}

/**
 * The theme names the paths a user named actually provide.
 *
 * Reported so a `--theme` path that contributed nothing can be said out loud. A
 * mistyped path and a valid theme file whose name was already taken by a
 * bundled theme both look, from the outside, exactly like the flag being
 * ignored — which is the one outcome the user cannot diagnose.
 */
export function themeNamesFromPaths(extraPaths: readonly string[]): string[] {
  const names = new Set<string>();
  for (const entry of extraPaths) {
    for (const theme of readThemePath(entry)) names.add(theme.name);
  }
  return [...names].sort();
}
