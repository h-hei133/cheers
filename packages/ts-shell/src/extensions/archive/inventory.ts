import { canonical, digest } from '../registry/validation.js';
import type { ExtensionManifest } from '../model.js';

export const FILE_BYTES = 4 * 1024 * 1024;
export const TOTAL_BYTES = 32 * 1024 * 1024;
export const ENTRY_COUNT = 512;

export interface ExtensionInventory {
  readonly files: Readonly<Record<string, string>>;
  readonly directories: readonly string[];
}

export function inventoryDigest(inventory: ExtensionInventory): string {
  return digest(canonical(['local-package-v1', inventory.files, [...inventory.directories].sort()]));
}

export function assertManifestFiles(manifest: ExtensionManifest, files: ExtensionInventory['files']): void {
  for (const entry of [...manifest.skills, ...manifest.scripts]) {
    if (!Object.hasOwn(files, entry.path)) throw new Error('Declared extension file is missing.');
  }
}
