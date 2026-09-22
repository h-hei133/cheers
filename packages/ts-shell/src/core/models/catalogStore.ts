import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
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
  readonly providers?: Record<string, Partial<CatalogProvider>>;
}

function agentDir(): string {
  const home = process.env.USERPROFILE || process.env.HOME || os.homedir();
  return path.join(home, ".private-agents");
}

/** Path of the file a user edits to add providers and models. */
export function userCatalogPath(): string {
  return path.join(agentDir(), USER_FILE);
}

/** Path of the cache an explicit refresh writes. */
export function catalogCachePath(): string {
  return path.join(agentDir(), CACHE_FILE);
}

/** The full catalogue: snapshot, then any refreshed copy, then the user's file. */
export function loadCatalog(): readonly CatalogProvider[] {
  let providers = [...BUILTIN_PROVIDERS];
  const cached = readOverlay(catalogCachePath());
  if (cached.length > 0) providers = mergeProviders(providers, cached);
  const user = readOverlay(userCatalogPath());
  if (user.length > 0) providers = mergeProviders(providers, user);
  return providers;
}

/** Write a fetched catalogue into the cache the next load will read. */
export function writeCatalogCache(providers: readonly Partial<CatalogProvider>[]): string {
  const target = catalogCachePath();
  const byId: Record<string, Partial<CatalogProvider>> = {};
  for (const provider of providers) {
    if (provider.id) byId[provider.id] = provider;
  }
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, `${JSON.stringify({ providers: byId }, null, 2)}\n`, "utf8");
  return target;
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

/** Provider patches from one file, or nothing when it is absent or malformed. */
function readOverlay(file: string): Partial<CatalogProvider>[] {
  let raw: string;
  try {
    raw = fs.readFileSync(file, "utf8");
  } catch {
    return [];
  }
  try {
    const parsed = JSON.parse(raw) as StoredCatalog;
    const providers = parsed.providers;
    if (!providers || typeof providers !== "object") return [];
    return Object.entries(providers).map(([id, patch]) => ({ ...patch, id }));
  } catch {
    // A hand-edited file with a stray comma should degrade to "no overlay", not
    // to a session that cannot start.
    return [];
  }
}
