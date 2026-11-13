import * as fs from "node:fs";
import * as path from "node:path";
import { visit } from 'jsonc-parser';
import { resolveUserDataFile } from "../paths/userHome.js";
import {
  BUILTIN_PROVIDERS,
  mergeProviders,
  type CatalogProvider,
} from "./catalog.js";

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

const USER_FILE = "models.json";
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
  return resolveUserDataFile(USER_FILE);
}

/** Path of the cache an explicit refresh writes. */
export function catalogCachePath(): string {
  return resolveUserDataFile(CACHE_FILE);
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
  const user = readOverlay(userCatalogPath(), USER_FILE);
  if (user.providers.length > 0) providers = mergeProviders(providers, user.providers, { origin: "user" });
  return { providers, diagnostics: [...cached.diagnostics, ...user.diagnostics] };
}

/** Write a fetched catalogue into the cache the next load will read. */
export function writeCatalogCache(
  providers: readonly Partial<CatalogProvider>[],
  metadata?: { readonly etag?: string; readonly indexUrl?: string },
): string {
  const target = catalogCachePath();
  const byId: Record<string, Partial<CatalogProvider>> = {};
  for (const provider of providers) {
    if (provider.id) byId[provider.id] = provider;
  }
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(
    target,
    `${JSON.stringify({
      ...(metadata?.etag ? { etag: metadata.etag } : {}),
      ...(metadata?.indexUrl ? { indexUrl: metadata.indexUrl } : {}),
      providers: byId,
    }, null, 2)}\n`,
    "utf8",
  );
  return target;
}

export function readCatalogCacheEtag(indexUrl?: string): string | undefined {
  try {
    const parsed = JSON.parse(fs.readFileSync(catalogCachePath(), "utf8")) as StoredCatalog;
    if (indexUrl && parsed?.indexUrl && parsed.indexUrl !== indexUrl) return undefined;
    if (indexUrl && !parsed?.indexUrl) return undefined;
    return typeof parsed?.etag === "string" && parsed.etag ? parsed.etag : undefined;
  } catch {
    return undefined;
  }
}

export function updateCatalogCacheEtag(etag: string, indexUrl: string): void {
  try {
    const target = catalogCachePath();
    const parsed = JSON.parse(fs.readFileSync(target, "utf8")) as StoredCatalog;
    if (parsed && typeof parsed === "object" && parsed.providers) {
      fs.writeFileSync(
        target,
        `${JSON.stringify({ ...parsed, etag, indexUrl }, null, 2)}\n`,
        "utf8",
      );
    }
  } catch {
    // Ignore if cache file is absent or unreadable.
  }
}

/**
 * Create the user's file with a worked example when it does not exist yet.
 *
 * An empty file teaches nothing; a commented example is what makes "add your own
 * provider" a thing someone can actually do without reading source.
 */
export function ensureUserCatalog(): string {
  const target = userCatalogPath();
  if (fs.existsSync(target)) return target;
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
  fs.writeFileSync(target, `${JSON.stringify(example, null, 2)}\n`, "utf8");
  return target;
}

/** Provider patches and safe notices; a bad optional layer never prevents startup. */
function readOverlay(file: string, label: typeof USER_FILE | typeof CACHE_FILE): {
  readonly providers: Partial<CatalogProvider>[]; readonly diagnostics: readonly string[];
} {
  let raw: string;
  try {
    raw = fs.readFileSync(file, "utf8");
  } catch (error) {
    return { providers: [], diagnostics: (error as NodeJS.ErrnoException).code === 'ENOENT' ? []
      : [`${label} could not be read; its catalogue entries were ignored.`] };
  }
  try {
    const parsed = JSON.parse(raw) as StoredCatalog;
    const providers = parsed?.providers;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)
      || providers !== undefined && (!providers || typeof providers !== 'object' || Array.isArray(providers))) {
      return { providers: [], diagnostics: [`${label} must contain a providers object; its catalogue entries were ignored.`] };
    }
    return { providers: Object.entries(providers ?? {}).map(([id, patch]) => ({ ...patch, id })),
      diagnostics: duplicateProviders(raw) ? [`${label} repeats the top-level providers key; only the last object is used. Merge the provider entries into one providers object.`] : [] };
  } catch {
    // A hand-edited file with a stray comma should degrade to "no overlay", not
    // to a session that cannot start.
    return { providers: [], diagnostics: [`${label} could not be parsed; its catalogue entries were ignored.`] };
  }
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
