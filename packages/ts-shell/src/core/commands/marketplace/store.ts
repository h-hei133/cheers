import fs from "node:fs";
import path from "node:path";
import { userDataDir } from "../../paths/userHome.js";
import { isRecord } from "../../values/record.js";
import { withFileLock, writeJsonFileAtomic } from "../../../session/store/sessionFileStore.js";

export interface MarketplaceSource {
  readonly name: string;
  readonly url: string;
  readonly description?: string;
  readonly isDefault?: boolean;
}

function storagePath(): string {
  return process.env.CHEERS_MARKETPLACES_FILE?.trim() || path.join(userDataDir(), "marketplaces.json");
}

function readSources(filePath: string): MarketplaceSource[] {
  let value: unknown;
  try {
    value = JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    if (error instanceof SyntaxError) throw new Error("Marketplace source registry contains invalid JSON.");
    throw error;
  }
  if (!Array.isArray(value)) throw new Error("Marketplace source registry must be a list.");
  const seen = new Set<string>();
  return value.map((entry): MarketplaceSource => {
    if (!isRecord(entry) || typeof entry.name !== "string" || !entry.name.trim() ||
      typeof entry.url !== "string" || !entry.url.trim() ||
      (entry.description !== undefined && typeof entry.description !== "string") ||
      (entry.isDefault !== undefined && typeof entry.isDefault !== "boolean")) {
      throw new Error("Marketplace source registry contains an invalid entry.");
    }
    const name = entry.name.trim().toLowerCase();
    if (seen.has(name)) throw new Error("Marketplace source registry contains duplicate names.");
    seen.add(name);
    return {
      name, url: entry.url.trim(),
      ...(entry.description !== undefined ? { description: entry.description } : {}),
      ...(entry.isDefault !== undefined ? { isDefault: entry.isDefault } : {}),
    };
  });
}

export function getMarketplaceSources(): readonly MarketplaceSource[] {
  return readSources(storagePath());
}

/** Read under the existing file lock; publish only through atomic replacement. */
function updateSources(change: (sources: MarketplaceSource[]) => MarketplaceSource[] | undefined): boolean {
  const filePath = storagePath();
  return withFileLock(`${filePath}.lock`, () => {
    const next = change(readSources(filePath));
    if (!next) return false;
    writeJsonFileAtomic(filePath, next);
    return true;
  });
}

export function addMarketplaceSource(source: MarketplaceSource): boolean {
  return updateSources((sources) => sources.some((entry) => entry.name === source.name)
    ? undefined : [...sources, source]);
}

export function removeMarketplaceSource(name: string): boolean {
  return updateSources((sources) => sources.some((entry) => entry.name === name)
    ? sources.filter((entry) => entry.name !== name) : undefined);
}

export function resetMarketplaceSources(): void {
  updateSources(() => []);
}
