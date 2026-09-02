import fs from "node:fs";
import path from "node:path";
import { getSettingsPaths, readSettingsFileSafely } from "../../config/settingsLoader.js";
import {
  normalizeStatusItems,
  type StatusItemId,
} from "../../presentation/tui/chrome/items.js";
import type { ResizeScrollbackMode } from "../../presentation/tui/render/frame.js";

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
const MOUSE_KEY = "mouseCopy";

interface StoredTuiSettings {
  readonly tui?: {
    readonly statusItems?: readonly string[];
    readonly mouseCopy?: boolean;
  };
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

/**
 * Whether drag-to-copy owns the mouse. Off by default: asking for mouse reports
 * takes the wheel away from the terminal, and this surface is built on the
 * terminal's own scrollback, so that trade is the user's to make.
 */
export function readMouseCopy(workspaceRoot: string): boolean {
  const { userPath, projectPaths } = getSettingsPaths(workspaceRoot);
  for (const candidate of [...projectPaths, userPath]) {
    const stored = readSettingsFileSafely(candidate) as StoredTuiSettings | undefined;
    if (typeof stored?.tui?.mouseCopy === "boolean") return stored.tui.mouseCopy;
  }
  return false;
}

/** Persist the drag-to-copy choice, returning the path written. */
export function writeMouseCopy(workspaceRoot: string, enabled: boolean): string {
  return writeTuiSetting(workspaceRoot, MOUSE_KEY, enabled);
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

/**
 * How a settled width change refreshes rows already in scrollback. Rebuilding is
 * right for every terminal that rewraps them; preserving is the escape hatch for
 * one that does not.
 */
export function resizeScrollbackMode(env: NodeJS.ProcessEnv): ResizeScrollbackMode {
  return env.TSSHELL_TUI_RESIZE_SCROLLBACK === "preserve" ? "preserve" : "rebuild";
}
