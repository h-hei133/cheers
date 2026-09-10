import fs from "node:fs";
import path from "node:path";
import { getSettingsPaths, readSettingsFileSafely } from "../../config/settingsLoader.js";
import {
  normalizeStatusItems,
  type StatusItemId,
} from "../../presentation/tui/chrome/items.js";

/**
 * Display preferences for the interactive surface.
 *
 * These belong to the user rather than the session: a chosen band, or a chosen
 * way of copying text, should survive `/clear`, a new project, and a restart.
 * Writes merge into the existing settings file instead of replacing it, because
 * that file holds unrelated settings this module has no business discarding.
 */

const SETTINGS_KEY = "tui";
const ITEMS_KEY = "statusItems";
const SURFACE_KEY = "surface";
/** Environment override for the surface, so one run can try the other without a settings edit. */
const SURFACE_ENV = "CODING_AGENTS_TUI_SURFACE";

/**
 * Which surface draws the session. `frame` renders the chrome directly and is
 * the default; `composed` builds the same frame from components. Both project
 * the same host-owned state, and the host falls back to `frame` if `composed`
 * fails to paint.
 */
export type SurfaceChoice = "frame" | "composed";

export const DEFAULT_SURFACE: SurfaceChoice = "frame";

interface StoredTuiSettings {
  readonly tui?: {
    readonly statusItems?: readonly string[];
    readonly surface?: string;
  };
}

function isSurfaceChoice(value: unknown): value is SurfaceChoice {
  return value === "frame" || value === "composed";
}

/**
 * The configured surface: the environment wins, then project settings, then
 * user settings, then the default. Anything unrecognised is the default rather
 * than an error, since a typo in a preference must not stop the session.
 */
export function readSurfaceChoice(
  workspaceRoot: string,
  env: NodeJS.ProcessEnv = process.env,
): SurfaceChoice {
  const forced = env[SURFACE_ENV]?.trim();
  if (isSurfaceChoice(forced)) return forced;
  const { userPath, projectPaths } = getSettingsPaths(workspaceRoot);
  for (const candidate of [...projectPaths, userPath]) {
    const stored = readSettingsFileSafely(candidate) as StoredTuiSettings | undefined;
    const surface = stored?.tui?.surface;
    if (isSurfaceChoice(surface)) return surface;
  }
  return DEFAULT_SURFACE;
}

/** Persist the surface for this user, returning the path written. */
export function writeSurfaceChoice(workspaceRoot: string, surface: SurfaceChoice): string {
  return writeTuiSetting(workspaceRoot, SURFACE_KEY, surface);
}

/** The configured items, or the default set when nothing is stored. */
export function readStatusItems(workspaceRoot: string): readonly StatusItemId[] {
  const { userPath, projectPaths } = getSettingsPaths(workspaceRoot);
  // Project settings win, matching how every other setting cascades.
  for (const candidate of [...projectPaths, userPath]) {
    const stored = readSettingsFileSafely(candidate) as StoredTuiSettings | undefined;
    const items = stored?.tui?.statusItems;
    if (items && items.length > 0) return normalizeStatusItems(items);
  }
  return normalizeStatusItems(undefined);
}

/** Persist `items` for this user, returning the path written. */
export function writeStatusItems(workspaceRoot: string, items: readonly StatusItemId[]): string {
  return writeTuiSetting(workspaceRoot, ITEMS_KEY, items);
}


function writeTuiSetting(workspaceRoot: string, key: string, value: unknown): string {
  const { userPath } = getSettingsPaths(workspaceRoot);
  const existing = (readSettingsFileSafely(userPath) ?? {}) as Record<string, unknown>;
  const tui = { ...((existing[SETTINGS_KEY] as Record<string, unknown>) ?? {}), [key]: value };
  const next = { version: 1, ...existing, [SETTINGS_KEY]: tui };
  fs.mkdirSync(path.dirname(userPath), { recursive: true });
  fs.writeFileSync(userPath, `${JSON.stringify(next, null, 2)}\n`, "utf8");
  return userPath;
}
