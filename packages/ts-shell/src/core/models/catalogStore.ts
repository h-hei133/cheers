import * as fs from "node:fs";
import * as path from "node:path";
import { visit } from 'jsonc-parser';
import { resolveConfigFile } from '../paths/config.js';
import { assertProfileStorage } from '../paths/profile/context.js';
import { userDataSearchDirs } from '../paths/userHome.js';
import { writeTextFileAtomic } from '../../session/store/sessionFileStore.js';
import { ConfigDocumentError, configFormatForPath } from '../../config/syntax.js';
import { readConfigSnapshot, serializeConfigDocument } from '../../config/document.js';
import {
  BUILTIN_PROVIDERS,
  mergeProviders,
  type CatalogProvider,
} from "./catalog.js";
import { catalogCachePath } from './cache/store.js';
import { captureCostSchedule } from './pricing.js';
export { catalogCachePath, writeCatalogCache } from './cache/store.js';

/**
 * Where the catalogue comes from at runtime.
 *
 * Three layers, in order: the snapshot that ships, a refreshed copy if one has
 * been fetched, and the user's own file. The user's file is last because it is the
 * only layer they control, and a refresh must never overwrite what they wrote.
 *
 * Nothing here reaches the network. A refresh is a separate, explicit act that
 * writes the cache this reads — so a session with no network, or one that has
 * never refreshed, still has a full catalogue.
 */

const CACHE_FILE = "models-cache.json";

interface StoredCatalog {
  readonly etag?: string;
  readonly indexUrl?: string;
  readonly providers?: Record<string, Partial<CatalogProvider>>;
}

export interface CatalogSnapshot {
  readonly providers: readonly CatalogProvider[];
  /** Controlled notices only; never raw parser errors or document values. */
  readonly diagnostics: readonly string[];
}

/**
 * Path of the file a user edits to add providers and models.
 *
 * Resolved rather than assumed to be in the current directory: the file may
 * already exist under a name this directory had earlier, and a path built from the
 * current name alone would show the user a file that is not the one being read.
 */
export function userCatalogPath(): string {
  const target = resolveConfigFile(userDataSearchDirs(), 'models');
  assertProfileStorage(target);
  return target;
}

/** The full catalogue: snapshot, then any refreshed copy, then the user's file. */
export function loadCatalog(): readonly CatalogProvider[] {
  return loadCatalogSnapshot().providers;
}

/** Providers and notices from the same source acquisition. */
export function loadCatalogSnapshot(): CatalogSnapshot {
  let providers = [...BUILTIN_PROVIDERS];
  const cached = readOverlay(catalogCachePath(), CACHE_FILE);
  if (cached.providers.length > 0) {
    providers = mergeProviders(providers, cached.providers, {
      preserveExplicitCapabilities: true,
      origin: "refresh",
    });
  }
  const userPath = userCatalogPath();
  const user = readOverlay(userPath, path.basename(userPath));
  if (user.providers.length > 0) providers = mergeProviders(providers, user.providers, { origin: "user" });
  return { providers, diagnostics: [...cached.diagnostics, ...user.diagnostics] };
}

/**
 * Create the user's file with a worked example when it does not exist yet.
 *
 * An empty file teaches nothing; a commented example is what makes "add your own
 * provider" a thing someone can actually do without reading source.
 */
export function ensureUserCatalog(): string {
  const target = userCatalogPath();
  try { fs.lstatSync(target); return target; }
  catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') return target; }
  const example = {
    providers: {
      "my-proxy": {
        label: "My gateway",
        runtime: "openai-compatible",
        auth: "api-key",
        baseUrl: "https://gateway.example.com/v1",
        envVar: "MY_GATEWAY_KEY",
        models: [{ id: "some-model", contextWindow: 128000 }],
      },
    },
  };
  fs.mkdirSync(path.dirname(target), { recursive: true });
  writeTextFileAtomic(target, `# Add custom providers and models below.\n${serializeConfigDocument(example, 'yaml')}`, 0o600, {
    beforeRename: () => {
      assertProfileStorage(target);
      if (userCatalogPath() !== target || fs.existsSync(target)) throw new Error('The model catalogue changed before creation.');
    },
  });
  return target;
}

/** Provider patches and safe notices; a bad optional layer never prevents startup. */
function readOverlay(file: string, label: string): {
  readonly providers: Partial<CatalogProvider>[]; readonly diagnostics: readonly string[];
} {
  const isCache = label === CACHE_FILE;
  let raw: string;
  let parsed: StoredCatalog;
  if (isCache) {
    try { raw = fs.readFileSync(file, "utf8"); }
    catch (error) {
      return { providers: [], diagnostics: (error as NodeJS.ErrnoException).code === 'ENOENT' ? []
        : [`${label} could not be read; its catalogue entries were ignored.`] };
    }
    try { parsed = JSON.parse(raw) as StoredCatalog; }
    catch { return { providers: [], diagnostics: [`${label} could not be parsed; its catalogue entries were ignored.`] }; }
  } else {
    let snapshot;
    try { snapshot = readConfigSnapshot(file, { allowDuplicateTopLevel: ['providers'] }); }
    catch (error) {
      const action = error instanceof ConfigDocumentError && error.code === 'unreadable' ? 'read' : 'parsed';
      return { providers: [], diagnostics: [`${label} could not be ${action}; its catalogue entries were ignored.`] };
    }
    if (!snapshot) return { providers: [], diagnostics: [] };
    raw = snapshot.text;
    parsed = snapshot.values as StoredCatalog;
  }

  const providers = parsed?.providers;
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)
    || providers !== undefined && (!providers || typeof providers !== 'object' || Array.isArray(providers))) {
    return { providers: [], diagnostics: [`${label} must contain a providers object; its catalogue entries were ignored.`] };
  }
  const diagnostics = !isCache && configFormatForPath(file) === 'jsonc' && duplicateProviders(raw)
    ? [`${label} repeats the top-level providers key; only the last object is used. Merge the provider entries into one providers object.`] : [];
  let invalidPrices = false;
  const patches = Object.entries(providers ?? {}).map(([id, patch]) => {
    const models = Array.isArray(patch?.models) ? patch.models.map(model => {
      if (model?.cost === undefined) return model;
      try { return { ...model, cost: captureCostSchedule(model.cost) ?? {} }; }
      catch {
        invalidPrices = true;
        return { ...model, cost: {} };
      }
    }) : patch?.models;
    return { ...patch, id, ...(models !== undefined ? { models } : {}) };
  });
  if (invalidPrices) diagnostics.push(`${label} contains invalid prices; affected model prices are unavailable.`);
  return { providers: patches, diagnostics };
}

/** Inspect only the top-level owner key, including JSON-escaped spellings. */
function duplicateProviders(raw: string): boolean {
  let depth = 0, count = 0;
  visit(raw, {
    onObjectBegin() { depth++; }, onArrayBegin() { depth++; },
    onObjectEnd() { depth--; }, onArrayEnd() { depth--; },
    onObjectProperty(key) { if (depth === 1 && key === 'providers') count++; },
  });
  return count > 1;
}
