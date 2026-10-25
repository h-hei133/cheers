import path from "node:path";
import { getUserRuntimeConfigPath } from "../../../config/runtimeConfig.js";
import { userCatalogPath, catalogCachePath } from "../../../core/models/catalogStore.js";
import { resolveUserDataFile, userDataSearchDirs } from "../../../core/paths/userHome.js";
import { workflowsDir } from "../../../core/workflow/definition.js";
import { themeWatchDirectories } from "../../../presentation/themes/index.js";
import { resolveCatalogDirectory } from "./paths.js";
import type { CatalogKind } from "./request.js";
import { memoryCatalogStore } from "./memory.js";
import { getMcpConfigPaths } from "../../../core/mcp/config.js";
import { projectConfigCandidates } from '../../../core/paths/project.js';

interface Sources {
  readonly cwd: string;
  readonly projectRoot: string;
  readonly themePaths?: readonly string[];
  readonly grantPath?: string;
}

/** Include absent higher-priority files and fallbacks that can become effective after deletion. */
function userFiles(...files: string[]): string[] {
  return userDataSearchDirs().flatMap(directory => files.map(file => path.join(directory, path.basename(file))));
}

export function catalogSources(kind: CatalogKind, sources: Sources, query?: string): readonly string[] {
  const { cwd, projectRoot, themePaths = [], grantPath } = sources;
  if (kind === "mcp" || kind === "tools") {
    const [user] = getMcpConfigPaths(cwd);
    return [...userFiles(user!, resolveUserDataFile("trust.json")), ...projectConfigCandidates(cwd, 'mcp.json')];
  }
  if (kind === "grant") return grantPath ? [grantPath] : [];
  if (kind === "record" || kind === "invalidatable") return [memoryCatalogStore(projectRoot).ref.recordsFile!];
  if (kind === "theme") return [...new Set([...themeWatchDirectories(cwd), ...themePaths,
    ...userFiles(resolveUserDataFile("trust.json"))].map(target => path.resolve(target)))];
  if (kind === "file" || kind === "directory" || kind === 'path') return [resolveCatalogDirectory(cwd, query ?? "", kind === "directory")];
  if (kind === "connection") return userFiles(getUserRuntimeConfigPath());
  if (kind === "model" || kind === "provider") return userFiles(userCatalogPath(), catalogCachePath());
  if (kind === "workflow") return [workflowsDir(cwd), ...userFiles(resolveUserDataFile("trust.json"))];
  return [];
}
