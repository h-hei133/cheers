import fs from "node:fs";
import {
  getCandidateConfigPaths,
  readUserRuntimeConfigFile,
  writeUserRuntimeConfigFile,
} from "../../config/runtimeConfig.js";
import {
  normalizeStatusItems,
  type StatusItemId,
} from "../../presentation/tui/chrome/items.js";

/**
 * Display preferences for the interactive surface.
 *
 * These belong to the user rather than the session: a chosen band should survive
 * `/clear`, a new project, and a restart. They live in the same file as the rest
 * of the user's configuration, so there is one place to look and one to edit.
 */

/** The configured items, or the default set when nothing is stored. */
export function readStatusItems(workspaceRoot: string): readonly StatusItemId[] {
  // Project settings win, matching how every other setting cascades.
  return normalizeStatusItems(readProjectStatusItems(workspaceRoot) ?? userStatusItems());
}

/** Persist `items` for this user, returning the path written. */
export function writeStatusItems(_workspaceRoot: string, items: readonly StatusItemId[]): string {
  const existing = readUserRuntimeConfigFile();
  return writeUserRuntimeConfigFile({
    ...existing,
    tui: { ...existing.tui, statusItems: items },
  });
}

function userStatusItems(): readonly string[] | undefined {
  return readUserRuntimeConfigFile().tui?.statusItems;
}

/** The project's own choice, when it names one and the file is readable. */
function readProjectStatusItems(workspaceRoot: string): readonly string[] | undefined {
  const [, projectPath] = getCandidateConfigPaths(workspaceRoot);
  if (!fs.existsSync(projectPath)) return undefined;
  try {
    const parsed = JSON.parse(fs.readFileSync(projectPath, "utf8")) as {
      readonly tui?: { readonly statusItems?: readonly string[] };
    };
    const items = parsed.tui?.statusItems;
    return items && items.length > 0 ? items : undefined;
  } catch {
    // A hand-edited project file with a stray comma should fall back to the
    // user's choice, not make the surface unreadable.
    return undefined;
  }
}
