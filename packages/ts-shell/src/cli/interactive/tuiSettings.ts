import {
  getRuntimeConfig, type RuntimeConfig,
  readRuntimeConfigEditAt, getProjectConfigPath, getUserRuntimeConfigPath,
  writeProjectRuntimeConfigFile,
  writeUserRuntimeConfigFile,
} from "../../config/runtimeConfig.js";
import {
  normalizeStatusItems,
  type StatusItemId,
} from "../../presentation/tui/chrome/items.js";
import type { ComposerShapeId } from "../../presentation/tui/composer/contract.js";

/**
 * Display preferences for the interactive surface.
 *
 * These belong to the user rather than the session: a chosen band should survive
 * `/clear`, a new project, and a restart. They live in the same file as the rest
 * of the user's configuration, so there is one place to look and one to edit.
 */

/** The configured items, or the default set when nothing is stored. */
export function readStatusItems(workspaceRoot: string, config: RuntimeConfig = getRuntimeConfig(workspaceRoot)): readonly StatusItemId[] {
  return normalizeStatusItems(config.tui?.statusItems);
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
  const projectEdit = readRuntimeConfigEditAt(getProjectConfigPath(workspaceRoot));
  const project = projectEdit.values;
  if (project.tui?.statusItems?.length) {
    return {
      path: writeProjectRuntimeConfigFile(workspaceRoot, {
        ...project,
        tui: { ...project.tui, statusItems: items },
      }, projectEdit),
      scope: "project",
    };
  }

  const edit = readRuntimeConfigEditAt(getUserRuntimeConfigPath());
  const existing = edit.values;
  return {
    path: writeUserRuntimeConfigFile({
      ...existing,
      tui: { ...existing.tui, statusItems: items },
    }, edit),
    scope: "user",
  };
}

/** The validated project-first diagram preference, or the renderer default. */
export function readDiagramMode(workspaceRoot: string, config: RuntimeConfig = getRuntimeConfig(workspaceRoot)): "off" | "streaming" {
  return config.tui?.diagrams ?? "streaming";
}

/** The accepted shape, with the product default kept outside persisted files. */
export function readComposerShape(config: RuntimeConfig): ComposerShapeId {
  return config.tui?.composerShape ?? "default";
}

/** A picker proposes a shape without changing the accepted configuration. */
export class ComposerPreference {
  private preview: { readonly shape: ComposerShapeId; readonly revision: number } | undefined;
  constructor(private readonly config: () => RuntimeConfig, private readonly changed: () => void,
    private readonly revision: () => number = () => 0) {}
  readonly read = (): ComposerShapeId => {
    if (this.preview && this.preview.revision !== this.revision()) this.preview = undefined;
    return this.preview?.shape ?? readComposerShape(this.config());
  };
  readonly propose = (shape: ComposerShapeId | undefined): void => {
    this.preview = shape === undefined ? undefined : { shape, revision: this.revision() };
    this.changed();
  };
}
