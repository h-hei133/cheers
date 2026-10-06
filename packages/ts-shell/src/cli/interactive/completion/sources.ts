import path from "node:path";
import { getUserRuntimeConfigPath } from "../../../config/runtimeConfig.js";
import { userCatalogPath, catalogCachePath } from "../../../core/models/catalogStore.js";
import { resolveUserDataFile, userDataSearchDirs } from "../../../core/paths/userHome.js";
import { workflowsDir } from "../../../core/workflow/definition.js";
import { resolveCatalogDirectory } from "./paths.js";
import type { CatalogKind } from "./request.js";

/** Include absent higher-priority files and fallbacks that can become effective after deletion. */
function userFiles(...files: string[]): string[] {
  return userDataSearchDirs().flatMap(directory => files.map(file => path.join(directory, path.basename(file))));
}

export function catalogSources(kind: CatalogKind, cwd: string, query?: string): readonly string[] {
  if (kind === "file" || kind === "directory") return [resolveCatalogDirectory(cwd, query ?? "", kind === "directory")];
  if (kind === "connection") return userFiles(getUserRuntimeConfigPath());
  if (kind === "model" || kind === "provider") return userFiles(userCatalogPath(), catalogCachePath());
  if (kind === "workflow") return [workflowsDir(cwd), ...userFiles(resolveUserDataFile("trust.json"))];
  return [];
}
