import fs from "node:fs";
import {
  getProjectConfigPath,
  readProjectRuntimeConfigFile,
  readUserRuntimeConfigFile,
  writeProjectRuntimeConfigFile,
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

/**
 * What a write changed, and where it went.
 *
 * The scope travels out with the path because it is the user-facing half: a
 * setting that silently landed one layer below the value in effect is a setting
 * the user cannot see, and "saved" would be the wrong word for it.
 */
export interface StatusItemsWrite {
  readonly path: string;
  readonly scope: "user" | "project";
}

/**
 * Persist `items`, writing to whichever file currently decides the value.
 *
 * The reader prefers a project value over the user's, so writing the user file
 * while a project value exists leaves the new value shadowed — the command
 * reports success and the band does not move. Writing to the deciding layer is
 * what makes the report true: the value that is written is the value that is
 * read back, whichever layer that turns out to be.
 */
export function writeStatusItems(
  workspaceRoot: string,
  items: readonly StatusItemId[],
): StatusItemsWrite {
  if (readProjectStatusItems(workspaceRoot) !== undefined) {
    return {
      path: writeProjectRuntimeConfigFile(workspaceRoot, {
        ...readProjectRuntimeConfigFile(workspaceRoot),
        tui: { ...readProjectStatusItemsFile(workspaceRoot)?.tui, statusItems: items },
      }),
      scope: "project",
    };
  }

  const existing = readUserRuntimeConfigFile();
  return {
    path: writeUserRuntimeConfigFile({
      ...existing,
      tui: { ...existing.tui, statusItems: items },
    }),
    scope: "user",
  };
}

/** The project file's own `tui` block, so a write does not drop its siblings. */
function readProjectStatusItemsFile(
  workspaceRoot: string,
): { readonly tui?: { readonly diagrams?: "off" | "streaming"; readonly statusItems?: readonly string[] } } | undefined {
  const projectPath = getProjectConfigPath(workspaceRoot);
  if (!fs.existsSync(projectPath)) return undefined;
  try {
    return JSON.parse(fs.readFileSync(projectPath, "utf8")) as {
      readonly tui?: { readonly diagrams?: "off" | "streaming"; readonly statusItems?: readonly string[] };
    };
  } catch {
    return undefined;
  }
}

function userStatusItems(): readonly string[] | undefined {
  return readUserRuntimeConfigFile().tui?.statusItems;
}

/** The project's own choice, when it names one and the file is readable. */
/**
 * Whether diagrams are drawn, or the default when nothing is stored.
 *
 * Read at startup rather than per render, matching how the theme is chosen: the
 * value decides how every later frame is built, and re-reading a file between
 * two frames of the same answer would let the display change mid-sentence.
 */
export function readDiagramMode(workspaceRoot: string): "off" | "streaming" {
  return readProjectDiagramMode(workspaceRoot) ?? userDiagramMode() ?? "streaming";
}

function userDiagramMode(): "off" | "streaming" | undefined {
  return readUserRuntimeConfigFile().tui?.diagrams;
}

function readProjectDiagramMode(workspaceRoot: string): "off" | "streaming" | undefined {
  const projectPath = getProjectConfigPath(workspaceRoot);
  if (!fs.existsSync(projectPath)) return undefined;
  try {
    const parsed = JSON.parse(fs.readFileSync(projectPath, "utf8")) as {
      readonly tui?: { readonly diagrams?: "off" | "streaming" };
    };
    const value = parsed.tui?.diagrams;
    // Only the two known values count. An unrecognised one is a typo, and
    // silently treating it as a third mode would leave the reader unable to
    // tell a misspelling from a setting that does nothing.
    return value === "off" || value === "streaming" ? value : undefined;
  } catch {
    return undefined;
  }
}

function readProjectStatusItems(workspaceRoot: string): readonly string[] | undefined {
  const projectPath = getProjectConfigPath(workspaceRoot);
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
