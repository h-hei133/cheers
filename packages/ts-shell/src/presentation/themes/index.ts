import fs from "node:fs";
import path from "node:path";
import darkJson from "./dark.json" with { type: "json" };
import lightJson from "./light.json" with { type: "json" };
import { projectDirectories } from "../../core/project/directories.js";
import { userDataSearchDirsFor } from "../../core/paths/userHome.js";

export interface ThemeConfig {
  name: string;
  description: string;
  colors: Record<string, string>;
}

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
};

/** Where a user keeps their own themes. */
const THEME_DIRECTORY = "themes";
/** Where a project keeps the ones it ships. */
const PROJECT_THEME_PATH = [".agents", "themes"] as const;

/** A theme file a user wrote, with where it came from. */
interface DiscoveredTheme {
  readonly config: ThemeConfig;
  readonly filePath: string;
}

/**
 * Themes on disk, from the user's directory and from the project's.
 *
 * Read rather than bundled because a theme is a palette, and a palette someone
 * wants is one they can edit. Bundling only two meant the answer to "can I use
 * my own colors" was no, with nothing in the product saying why.
 *
 * Both layers are searched each time rather than cached: a theme is read once per
 * session at most, and a stale cache would mean editing a file and seeing
 * nothing happen.
 */
function discoverThemes(workspaceRoot: string): Map<string, DiscoveredTheme> {
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
      found.set(theme.config.name, theme);
    }
  }
  return found;
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
    const filePath = path.join(directory, entry.name);
    let parsed: unknown;
    try {
      parsed = JSON.parse(fs.readFileSync(filePath, "utf8"));
    } catch {
      // A theme file with a stray comma is a broken theme, not a broken session.
      continue;
    }
    const config = asThemeConfig(parsed, entry.name);
    if (config) themes.push({ config, filePath });
  }
  return themes;
}

/**
 * A parsed theme file, or nothing when it is not usable.
 *
 * The name falls back to the file name so a theme can be identified without
 * repeating itself inside the file.
 *
 * Colors are completed from the bundled dark theme rather than left to the
 * renderer's per-token fallback. That fallback is a hardcoded white for text,
 * which a theme defining only `accent` would then use for every message body —
 * an unreadable theme on a light terminal, from a file that looks perfectly
 * valid. Inheriting means a partial theme is a *recolor* of a working one, so
 * omitting a token is never a mistake the reader has to see.
 */
function asThemeConfig(parsed: unknown, fileName: string): ThemeConfig | undefined {
  if (!parsed || typeof parsed !== "object") return undefined;
  const record = parsed as { name?: unknown; description?: unknown; colors?: unknown };
  if (!record.colors || typeof record.colors !== "object") return undefined;
  const colors: Record<string, string> = { ...builtIn.dark!.colors };
  for (const [token, value] of Object.entries(record.colors as Record<string, unknown>)) {
    if (typeof value === "string") colors[token] = value;
  }
  return {
    name: typeof record.name === "string" && record.name.trim() !== ""
      ? record.name.trim()
      : path.basename(fileName, ".json"),
    description: typeof record.description === "string" ? record.description : "",
    colors,
  };
}

/** Every theme name a user may select: the bundled ones, plus any on disk. */
export function listThemes(workspaceRoot: string = process.cwd()): string[] {
  const names = new Set(Object.keys(builtIn));
  for (const name of discoverThemes(workspaceRoot).keys()) names.add(name);
  return [...names].sort();
}

/**
 * One theme by name, or nothing when no theme claims it.
 *
 * A theme on disk shadows a bundled one of the same name, so a user can adjust
 * `dark` without losing the ability to fall back to the original — deleting their
 * file restores it.
 */
export function loadTheme(name: string, workspaceRoot: string = process.cwd()): ThemeConfig | undefined {
  return discoverThemes(workspaceRoot).get(name)?.config ?? builtIn[name];
}

export function getDefaultTheme(): ThemeConfig {
  return builtIn.dark!;
}

/** Where a theme came from, for a listing that has to explain precedence. */
export function themeSource(name: string, workspaceRoot: string = process.cwd()): "user-or-project" | "built-in" {
  return discoverThemes(workspaceRoot).has(name) ? "user-or-project" : "built-in";
}
