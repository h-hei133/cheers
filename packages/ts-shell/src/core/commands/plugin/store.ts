import fs from "node:fs";
import { resolveUserDataFile } from "../../paths/userHome.js";
import { withFileLock, writeJsonFileAtomic } from "../../../session/store/sessionFileStore.js";
import { isRecord } from "../../values/record.js";

export type PluginOrigin = "path" | "package";

export interface InstalledPlugin {
  readonly name: string;
  readonly version: string;
  enabled: boolean;
  /** Where the extension resolves from: a local directory, or a package name. */
  readonly source: PluginOrigin;
  /** The path or package spec exactly as given. */
  readonly spec: string;
  readonly description?: string;
  /** False until the spec has been resolved on disk. */
  readonly resolved: boolean;
}

export function getPluginStoragePath(): string {
  return process.env.CHEERS_PLUGINS_FILE?.trim() || resolveUserDataFile("plugins.json");
}

export function getInstalledPlugins(): InstalledPlugin[] {
  let value: unknown;
  try { value = JSON.parse(fs.readFileSync(getPluginStoragePath(), "utf8")); }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw new Error("Extension registry could not be read.");
  }
  if (!Array.isArray(value)) throw new Error("Extension registry must be a list.");
  const names = new Set<string>();
  for (const entry of value) {
    if (!isRecord(entry) || typeof entry.name !== "string" || !entry.name.trim() || names.has(entry.name) ||
      typeof entry.version !== "string" || typeof entry.spec !== "string" || !entry.spec.trim() ||
      typeof entry.enabled !== "boolean" || typeof entry.resolved !== "boolean" ||
      (entry.source !== "path" && entry.source !== "package") ||
      (entry.description !== undefined && typeof entry.description !== "string")) throw new Error("Extension registry contains an invalid entry.");
    names.add(entry.name);
  }
  return value as InstalledPlugin[];
}

export function savePersistedPlugins(plugins: InstalledPlugin[]): void {
  writeJsonFileAtomic(getPluginStoragePath(), plugins);
}

/** Read and mutate the current file under the existing process lock. */
export function withPluginRegistry<T>(action: (plugins: InstalledPlugin[]) => T): T {
  return withFileLock(`${getPluginStoragePath()}.lock`, () => action(getInstalledPlugins()));
}

export function resetInstalledPlugins(): void {
  withPluginRegistry(() => savePersistedPlugins([]));
}
