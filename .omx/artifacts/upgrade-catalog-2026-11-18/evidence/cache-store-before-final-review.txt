import fs from 'node:fs';
import path from 'node:path';
import type { CatalogProvider } from '../catalog.js';
import { resolveUserDataFile } from '../../paths/userHome.js';
import { assertCurrentProfile, assertProfileStorage, currentProfile, type ProfileContext } from '../../paths/profile/context.js';
import { fileIdentity, inspectWorkspaceFile, pathIdentity, type FileState } from '../../workspace/files.js';
import { withFileLock, writeTextFileAtomic } from '../../../session/store/sessionFileStore.js';

export type CacheOutcome = 'unchanged' | 'saved' | 'unknown';
type CacheErrorKind = 'cancelled' | 'admission' | 'stale' | 'storage';

export class CacheFailure extends Error {
  constructor(readonly kind: CacheErrorKind) {
    super(kind === 'cancelled' ? 'Catalogue refresh was cancelled.'
      : kind === 'admission' ? 'Catalogue refresh admission is no longer valid.'
      : kind === 'stale' ? 'Catalogue cache ownership or contents changed during refresh.'
      : 'Catalogue cache storage is unavailable.');
  }
}

interface StoredCatalog {
  readonly etag?: string;
  readonly indexUrl?: string;
  readonly providers: Record<string, Partial<CatalogProvider>>;
}

/** The original pathname and its body are one acquisition, including an absent file. */
export interface CacheSnapshot {
  readonly path: string;
  readonly directory: string;
  readonly directoryIdentity: string;
  readonly profile?: ProfileContext;
  readonly file: FileState;
  readonly stored?: StoredCatalog;
  readonly providers: number;
  readonly models: number;
}

export interface CachePublication {
  readonly ok: boolean;
  readonly cacheOutcome: CacheOutcome;
  readonly cachePath?: string;
  readonly errorKind?: CacheErrorKind;
  readonly error?: string;
}

/** Refresh and every local cache writer resolve and lock this same physical file. */
export function catalogCachePath(): string {
  return resolveUserDataFile('models-cache.json');
}

function assertOwner(snapshot: Pick<CacheSnapshot, 'profile' | 'path'>): void {
  try {
    if (currentProfile() !== snapshot.profile) throw new Error();
    if (snapshot.profile) assertCurrentProfile(snapshot.profile);
    assertProfileStorage(snapshot.path, snapshot.profile);
    if (path.resolve(catalogCachePath()) !== snapshot.path) throw new Error();
  } catch { throw new CacheFailure('stale'); }
}

export function captureCache(): CacheSnapshot {
  const profile = currentProfile();
  const target = path.resolve(catalogCachePath());
  assertOwner({ profile, path: target });
  const directory = path.dirname(target);
  try {
    // Check the existing ancestors before creating only the selected cache directory.
    pathIdentity(directory);
    fs.mkdirSync(directory, { recursive: true });
    const directoryIdentity = pathIdentity(directory);
    const file = inspectWorkspaceFile(directory, path.basename(target));
    const stored = file.state === 'exists' ? readStored(file.content) : undefined;
    const providers = stored ? Object.values(stored.providers) : [];
    const snapshot: CacheSnapshot = { path: target, directory, directoryIdentity, profile, file, stored,
      providers: providers.length, models: providers.reduce((total, provider) => total + provider.models!.length, 0) };
    assertCacheCurrent(snapshot);
    return snapshot;
  } catch (error) {
    if (error instanceof CacheFailure) throw error;
    throw new CacheFailure((error as NodeJS.ErrnoException)?.code ? 'storage' : 'stale');
  }
}

/** No callback follows the final pathname/content inspection before publication. */
export function assertCacheCurrent(snapshot: CacheSnapshot): void {
  assertOwner(snapshot);
  try {
    if (pathIdentity(snapshot.directory) !== snapshot.directoryIdentity) throw new Error();
    const current = inspectWorkspaceFile(snapshot.directory, path.basename(snapshot.path));
    if (current.state !== snapshot.file.state) throw new Error();
    if (current.state === 'exists') {
      if (snapshot.file.state !== 'exists' || current.identity !== snapshot.file.identity
        || current.content !== snapshot.file.content || fileIdentity(fs.lstatSync(snapshot.path)) !== current.identity) {
        throw new Error();
      }
    } else if (fs.existsSync(snapshot.path)) throw new Error();
    if (pathIdentity(snapshot.directory) !== snapshot.directoryIdentity) throw new Error();
  } catch { throw new CacheFailure('stale'); }
}

/** A validator is useful only when every persisted record belongs to a nonempty model body. */
function readStored(text: string): StoredCatalog | undefined {
  try {
    const parsed: unknown = JSON.parse(text);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed) || !('providers' in parsed)) return undefined;
    const providers = parsed.providers;
    if (!providers || typeof providers !== 'object' || Array.isArray(providers) || !Object.keys(providers).length) return undefined;
    for (const [id, provider] of Object.entries(providers)) {
      if (!id.trim() || !provider || typeof provider !== 'object' || Array.isArray(provider)
        || !Array.isArray(provider.models) || !provider.models.length
        || provider.models.some((model: unknown) => !model || typeof model !== 'object' || Array.isArray(model)
          || !('id' in model) || typeof model.id !== 'string' || !model.id.trim())) return undefined;
    }
    return parsed as StoredCatalog;
  } catch { return undefined; }
}

export function encodeCache(providers: readonly Partial<CatalogProvider>[], metadata?: { readonly etag?: string; readonly indexUrl?: string }): string {
  const byId = Object.fromEntries(providers.filter(provider => provider.id).map(provider => [provider.id!, provider]));
  return `${JSON.stringify({ ...(metadata?.etag ? { etag: metadata.etag } : {}),
    ...(metadata?.indexUrl ? { indexUrl: metadata.indexUrl } : {}), providers: byId }, null, 2)}\n`;
}

/** Guard staging and each rename retry; a lock does not provide CAS against external editors. */
export function publishCache(snapshot: CacheSnapshot, content: string | undefined, admission?: () => void): CachePublication {
  const state = { outcome: 'unchanged' as CacheOutcome, releaseFailed: false };
  const guard = () => { admission?.(); assertCacheCurrent(snapshot); };
  try {
    guard();
    if (content !== undefined) withFileLock(`${snapshot.path}.lock`, () => {
      guard();
      writeTextFileAtomic(snapshot.path, content, snapshot.file.state === 'exists' ? snapshot.file.mode & 0o777 : undefined, {
        beforeRename: guard,
        onRenameStart: () => { state.outcome = 'unknown'; },
        onRenameSuccess: () => { state.outcome = 'saved'; },
        onRenameError: error => {
          // These native errors confirm that this rename did not publish. I/O completion errors do not.
          if (['EBUSY', 'EPERM', 'ENOENT', 'EMFILE', 'ENFILE'].includes((error as NodeJS.ErrnoException)?.code ?? '')) state.outcome = 'unchanged';
        },
      });
    }, { createParent: false, onReleaseError: () => { state.releaseFailed = true; } });
    return { ok: true, cacheOutcome: state.outcome, cachePath: snapshot.path };
  } catch (error) {
    const kind = error instanceof CacheFailure ? error.kind : 'storage';
    const errorText = state.outcome === 'unknown' ? 'Catalogue cache write outcome is unverified.'
      : state.outcome === 'saved' ? `Catalogue cache was saved; ${state.releaseFailed ? 'lock' : 'staging'} cleanup is unverified.`
      : new CacheFailure(kind).message + (state.releaseFailed ? ' Catalogue cache lock cleanup is unverified.' : '');
    return { ok: false, cacheOutcome: state.outcome, errorKind: kind, error: errorText,
      ...(state.outcome === 'saved' ? { cachePath: snapshot.path } : {}) };
  }
}

/** Local callers keep the existing synchronous path result and use the same guarded writer. */
export function writeCatalogCache(providers: readonly Partial<CatalogProvider>[], metadata?: { readonly etag?: string; readonly indexUrl?: string }): string {
  const result = publishCache(captureCache(), encodeCache(providers, metadata));
  if (!result.ok) throw new Error(result.error);
  return result.cachePath!;
}
