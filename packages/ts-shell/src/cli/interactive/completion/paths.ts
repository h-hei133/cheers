import fs from "node:fs/promises";
import path from "node:path";
import type { Suggestion } from "../../../presentation/tui/chrome/suggestions.js";

export function pathDirectory(value: string): string {
  const index = Math.max(value.lastIndexOf("/"), process.platform === "win32" ? value.lastIndexOf("\\") : -1);
  return value.slice(0, index + 1);
}

export function resolveCatalogDirectory(root: string, prefix: string, directoriesOnly: boolean): string {
  const home = process.env.HOME ?? process.env.USERPROFILE;
  const expanded = prefix.startsWith("~/") && home ? path.join(home, prefix.slice(2)) : prefix;
  return path.resolve(root, expanded || ".");
}

/** One directory, bounded and cancellable between entries; never traverse a tree. */
export async function pathCatalog(root: string, prefix: string, directoriesOnly: boolean, signal: AbortSignal): Promise<readonly Suggestion[]> {
  signal.throwIfAborted();
  const directory = resolveCatalogDirectory(root, prefix, directoriesOnly);
  const handle = await fs.opendir(directory);
  const items: Suggestion[] = [];
  let count = 0;
  for await (const entry of handle) {
    signal.throwIfAborted();
    if (++count > 5000) break;
    let isDirectory = entry.isDirectory();
    let isFile = entry.isFile();
    if (entry.isSymbolicLink()) {
      const stat = await fs.stat(path.join(directory, entry.name)).catch(() => undefined);
      isDirectory = stat?.isDirectory() ?? false; isFile = stat?.isFile() ?? false;
    }
    if (!isDirectory && (directoriesOnly || !isFile)) continue;
    const value = prefix + entry.name + (isDirectory ? "/" : "");
    items.push({ value, label: value, kind: 'path', identity: path.join(directory, entry.name), detail: isDirectory ? "directory" : "file" });
  }
  signal.throwIfAborted();
  return items.sort((a, b) => a.value.localeCompare(b.value));
}
