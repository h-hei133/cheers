import fs from 'node:fs';
import path from 'node:path';
import { registryBytes, ARCHIVE_BYTES, exact } from '../registry/client.js';
import { selectedSource, sourceIdentity } from '../registry/sources.js';
import { canonical, name, version } from '../registry/validation.js';
import { validateArchive } from '../archive/validation.js';
import { assertInventory, extractArchive } from '../archive/storage.js';
import { assertStorageIdentity, assertStoragePath, packageRoot, storageIdentity, versionPath, type ExtensionStore } from '../store/state.js';
import type { EffectOutcome, ExtensionState, PackageRecord, VersionRecord } from '../model.js';
import type { ToolExecutionContext } from '../../tools/types.js';

export interface LifecycleHost { readonly store: ExtensionStore; readonly check: () => void; readonly offline: () => boolean; readonly invalidate: (except?: AbortSignal) => Promise<void>; readonly request: <T>(action: (signal: AbortSignal) => Promise<T>, signal?: AbortSignal) => Promise<T> }
export interface Operation { readonly preview: string; readonly apply: (context: ToolExecutionContext) => Promise<EffectOutcome> }
export function parseSpec(input: string): { source: string; name: string; version: string } {
  const match = /^([^:]+):([^@]+)@([^@]+)$/.exec(input);
  if (!match) throw new Error('Use an explicit source:name@exact-version.');
  return { source: name(match[1]), name: name(match[2]), version: version(match[3]) };
}
export function assertPackage(record: PackageRecord, store: ExtensionStore): void {
  for (const selected of [record.active, ...record.history]) assertInventory(versionPath(selected, store.file), selected);
}
function sourceCurrent(selected: string, expected: string): void { if (sourceIdentity(selectedSource(selected)) !== expected) throw new Error('Approved extension source or trust anchor changed.'); }

export async function installOperation(host: LifecycleHost, input: string, replacing?: string, signal?: AbortSignal): Promise<Operation> {
  host.check(); const spec = parseSpec(input); const source = selectedSource(spec.source); const identity = sourceIdentity(source);
  const approved = await host.request(signal => exact(source, spec.name, spec.version, signal, host.offline()), signal);
  host.check(); const state = host.store.read(); const old = state.packages.find(entry => entry.name === spec.name);
  const storage = storageIdentity(path.join(packageRoot(host.store.file), spec.name));
  if (replacing && replacing !== spec.name) throw new Error('Update package name must match its pinned release.');
  if (Boolean(old) !== Boolean(replacing)) throw new Error(old ? 'Extension is already installed; use update.' : 'Extension is not installed.');
  if (old) { assertPackage(old, host.store); if (old.active.digest === approved.digest) throw new Error('That exact extension content is already active.'); if (old.history.length >= 3) throw new Error('Extension history limit reached; uninstall intact owned versions before a fresh installation.'); }
  return { preview: `${replacing ? 'Update' : 'Install'} ${spec.source}:${spec.name}@${spec.version}\nSHA256 ${approved.digest}\nTrust ${source.trust!.keyId} ${source.trust!.fingerprint}\nManifest ${canonical(approved.manifest)}\nNo lifecycle scripts run. Activation and capability grants start empty.`,
    apply: async context => {
      context.abortSignal?.throwIfAborted(); host.check(); sourceCurrent(spec.source, identity); assertStorageIdentity(storage);
      const bytes = await registryBytes(source, approved.url, ARCHIVE_BYTES, context.abortSignal, host.offline());
      const archive = await validateArchive(bytes, approved);
      context.abortSignal?.throwIfAborted(); host.check(); sourceCurrent(spec.source, identity); assertStorageIdentity(storage);
      const root = packageRoot(host.store.file); assertStoragePath(root); fs.mkdirSync(root, { recursive: true, mode: 0o700 }); assertStoragePath(root);
      const stage = fs.mkdtempSync(path.join(root, '.stage-')); fs.chmodSync(stage, 0o700);
      let moved = false; let cleanupUnknown = false;
      let outcome: EffectOutcome;
      try {
        extractArchive(archive, stage);
        const installedBase = { ...approved, source: spec.source, sourceIdentity: identity, trustFingerprint: source.trust!.fingerprint, files: archive.files, directories: archive.directories };
        outcome = host.store.locked(state, current => {
          host.check(); context.abortSignal?.throwIfAborted(); sourceCurrent(spec.source, identity);
          assertStorageIdentity(storage);
          const latest = current.packages.find(entry => entry.name === spec.name); if (latest) assertPackage(latest, host.store);
          const destination = path.join(root, spec.name, approved.digest);
          assertStoragePath(destination);
          if (fs.existsSync(destination)) throw new Error('An untracked or retained extension destination already exists; content was preserved.');
          fs.mkdirSync(path.dirname(destination), { recursive: true, mode: 0o700 });
          assertStoragePath(destination);
          fs.renameSync(stage, destination); moved = true;
          const installed: VersionRecord = { ...installedBase, storage: storageIdentity(destination) };
          const next: PackageRecord = { name: spec.name, active: installed, history: latest ? [latest.active, ...latest.history] : [], activation: {} };
          return host.store.publish({ ...current, packages: [...current.packages.filter(entry => entry.name !== spec.name), next] },
            { effect: 'published', detail: `${spec.name}@${spec.version} package files published; activation and grants cleared.` });
        });
      } finally {
        if (!moved) try { fs.rmSync(stage, { recursive: true }); } catch { cleanupUnknown = true; }
      }
      await host.invalidate(context.abortSignal);
      if (cleanupUnknown) return { ...outcome!, durability: 'unknown', detail: `${outcome!.detail} Private staging cleanup is unknown.` };
      return outcome!;
    } };
}

export function removeOperation(host: LifecycleHost, packageName: string): Operation {
  host.check(); const state = host.store.read(); const record = state.packages.find(entry => entry.name === packageName);
  if (!record) throw new Error('Extension is not installed.'); assertPackage(record, host.store);
  return { preview: `Uninstall ${packageName}: remove only the reviewed intact owned versions; preserve user data and unknown content.`, apply: async context => {
    host.check(); context.abortSignal?.throwIfAborted();
    const outcome = host.store.locked(state, current => {
      assertPackage(record, host.store); host.check(); context.abortSignal?.throwIfAborted();
      // Detach first; no disabled tool can survive deletion or an uncertain cleanup.
      const publication = host.store.publish({ ...current, packages: current.packages.filter(entry => entry.name !== packageName) }, { effect: 'saved', detail: `${packageName} registration removed.` });
      if (publication.durability === 'unknown') return publication;
      let removed = 0;
      try { for (const selected of [record.active, ...record.history]) { assertInventory(versionPath(selected, host.store.file), selected); fs.rmSync(versionPath(selected, host.store.file), { recursive: true }); removed++; } }
      catch { return { effect: 'removed' as const, durability: 'unknown' as const, detail: `${packageName} disabled; ${removed} owned versions removed; cleanup of remaining versions is unknown and user content was preserved.` }; }
      return { effect: 'removed' as const, durability: 'confirmed' as const, detail: `${packageName} uninstalled; ${removed} intact owned versions removed. User data was preserved.` };
    });
    await host.invalidate(context.abortSignal); return outcome;
  } };
}
export function rollbackOperation(host: LifecycleHost, packageName: string, pinned: string): Operation {
  host.check(); const state: ExtensionState = host.store.read(); const record = state.packages.find(entry => entry.name === packageName);
  if (!record) throw new Error('Extension is not installed.'); const selected = record.history.find(entry => entry.manifest.version === version(pinned));
  if (!selected) throw new Error('Reviewed rollback version is unavailable.'); assertPackage(record, host.store);
  sourceCurrent(selected.source, selected.sourceIdentity);
  return { preview: `Rollback ${packageName} to ${pinned} SHA256 ${selected.digest}. Activation and capability grants clear.`, apply: async context => {
    context.abortSignal?.throwIfAborted(); host.check();
    const outcome = host.store.locked(state, current => {
      assertPackage(record, host.store); sourceCurrent(selected.source, selected.sourceIdentity); host.check(); context.abortSignal?.throwIfAborted();
      const next = { ...record, active: selected, history: [record.active, ...record.history.filter(entry => entry !== selected)], activation: {} };
      return host.store.publish({ ...current, packages: current.packages.map(entry => entry.name === packageName ? next : entry) }, { effect: 'saved', detail: `${packageName} rolled back to ${pinned}; activation and grants cleared.` });
    });
    await host.invalidate(context.abortSignal); return outcome;
  } };
}
