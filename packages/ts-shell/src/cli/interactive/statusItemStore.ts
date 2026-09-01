import fs from "node:fs";
import path from "node:path";
import { getSettingsPaths, readSettingsFileSafely } from "../../config/settingsLoader.js";
import {
  normalizeStatusItems,
  type StatusItemId,
} from "../../presentation/tui/chrome/items.js";

/**
 * Which status items the user chose to keep in the band.
 *
 * A display preference, so it lives with the user's settings rather than in the
 * session: the choice should survive `/clear`, a new project, and a restart. The
 * write merges into the existing file instead of replacing it, because that file
 * holds unrelated settings this module has no business discarding.
 */

const SETTINGS_KEY = "tui";
const ITEMS_KEY = "statusItems";

/** The configured items, or the default set when nothing is stored. */
export function readStatusItems(workspaceRoot: string): readonly StatusItemId[] {
  const { userPath, projectPaths } = getSettingsPaths(workspaceRoot);
  // Project settings win, matching how every other setting cascades.
  for (const candidate of [...projectPaths, userPath]) {
    const stored = readSettingsFileSafely(candidate) as
      | { tui?: { statusItems?: readonly string[] } }
      | undefined;
    const items = stored?.tui?.statusItems;
    if (items && items.length > 0) return normalizeStatusItems(items);
  }
  return normalizeStatusItems(undefined);
}

/** Persist `items` for this user, returning the path written. */
export function writeStatusItems(workspaceRoot: string, items: readonly StatusItemId[]): string {
  const { userPath } = getSettingsPaths(workspaceRoot);
  const existing = (readSettingsFileSafely(userPath) ?? {}) as Record<string, unknown>;
  const tui = { ...((existing[SETTINGS_KEY] as Record<string, unknown>) ?? {}), [ITEMS_KEY]: items };
  const next = { version: 1, ...existing, [SETTINGS_KEY]: tui };
  fs.mkdirSync(path.dirname(userPath), { recursive: true });
  fs.writeFileSync(userPath, `${JSON.stringify(next, null, 2)}\n`, "utf8");
  return userPath;
}
