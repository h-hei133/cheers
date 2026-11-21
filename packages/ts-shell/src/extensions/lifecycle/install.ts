import fs from 'node:fs';
import path from 'node:path';
import { registryBytes, ARCHIVE_BYTES, exact } from '../registry/client.js';
import { assertVersionSource, readSources, selectedSource, sourceIdentity } from '../registry/sources.js';
import { canonical, name, text, version } from '../registry/validation.js';
import { exactNpm, npmPackageName, npmRegistry } from '../registry/npm.js';
import { gitArchiveTarget, gitSpec, type GitRelease } from '../registry/git.js';
import { validateArchive, validateGitArchive, validateNpmArchive, type ValidatedArchive } from '../archive/validation.js';
import { assertInventory, extractArchive } from '../archive/storage.js';
import { captureLocalPackage, isLocalPackage, localPackagePath } from '../archive/local.js';
import type { ExtensionInventory } from '../archive/inventory.js';
import { assertStorageIdentity, assertStoragePath, packageRoot, storageIdentity, versionPath, type ExtensionStore } from '../store/state.js';
import type { EffectOutcome, ExtensionSource, ExtensionState, PackageRecord, VersionRecord, VersionSource } from '../model.js';
import type { ToolExecutionContext } from '../../tools/types.js';

export interface LifecycleHost { readonly store: ExtensionStore; readonly check: () => void; readonly offline: () => boolean;
  readonly invalidate: (except?: AbortSignal) => Promise<void>; readonly request: <T>(action: (signal: AbortSignal) => Promise<T>, signal?: AbortSignal) => Promise<T>;
  readonly root?: string; readonly assertSourceAccess?: (target: string) => void; readonly npmRegistry?: string; readonly gitArchiveBase?: string }
export interface Operation { readonly preview: string; readonly explicitApproval?: true;
  readonly apply: (context: ToolExecutionContext) => Promise<EffectOutcome | AcquisitionResult> }
interface AcquisitionResult { readonly acquisition: 'verified' | 'failed'; readonly detail: string }
export interface InstallPlan { readonly acquisition?: Operation; complete(): Operation }
type InstallVersion = VersionSource & Pick<VersionRecord, 'manifest' | 'digest'>;
type RegistrySpec = { kind: 'registry'; source: string; name: string; version: string };
type InstallSpec = RegistrySpec | { kind: 'local'; directory: string } | ({ kind: 'git' } & GitRelease);
interface InstallSource {
  readonly version: InstallVersion;
  readonly preview: string;
  readonly check: () => void;
  readonly load: (signal?: AbortSignal) => Promise<ExtensionInventory & { readonly stage: (target: string) => void; readonly check?: () => void }>;
}
export function parseSpec(input: string): InstallSpec {
  text(input, 2048);
  if (isLocalPackage(input)) return { kind: 'local', directory: input };
  if (/^git:[a-z][a-z0-9+.-]*:\/\//i.test(input)) return { kind: 'git', ...gitSpec(input) };
  const match = /^([^:]+):(.+)@([^@]+)$/.exec(input);
  if (!match) throw new Error('Use source:name@version, npm:name@version, git:https://github.com/OWNER/REPO#COMMIT, or ./package.');
  const source = name(match[1]);
  return { kind: 'registry', source, name: source === 'npm' ? npmPackageName(match[2]) : name(match[2]), version: version(match[3]) };
}
export function assertPackage(record: PackageRecord, store: ExtensionStore): void {
  for (const selected of [record.active, ...record.history]) assertInventory(versionPath(selected, store.file), selected);
}
export async function prepareInstallPlan(host: LifecycleHost, input: string, replacing?: string, signal?: AbortSignal): Promise<InstallPlan> {
  host.check();
  signal?.throwIfAborted();
  const spec = parseSpec(input);
  const remote = remotePackage(host, spec);
  if (!remote) {
    if (spec.kind === 'git') throw new Error('Git extension source is unavailable.');
    if (spec.kind === 'registry') assertReplacementName(replacing, spec.name);
    const source = await (spec.kind === 'local' ? localSource(host, spec.directory, signal) : registrySource(host, spec, signal));
    return { complete: () => packageOperation(host, source, replacing) };
  }
  let source: InstallSource | undefined;
  let started = false;
  const acquisition: Operation = {
    preview: `Download and validate this extension for review.\n${remote.description}\nPublication requires separate approval of the downloaded SHA256 and manifest.`,
    explicitApproval: true,
    apply: async context => {
      if (started) throw new Error('Extension source acquisition has already been consumed.');
      started = true;
      const requestSignal = context.abortSignal ?? signal;
      try {
        const check = () => {
          requestSignal?.throwIfAborted(); host.check(); remote.check();
          const blocked = context.admission?.(); if (blocked) throw new Error(blocked);
        };
        check();
        const acquired = await remote.load(check, requestSignal);
        check();
        assertReplacementName(replacing, acquired.version.manifest.name);
        source = acquired;
        const { name, version } = acquired.version.manifest;
        return { acquisition: 'verified', detail: `Downloaded and verified ${name}@${version} for publication review.` };
      } catch (error) {
        return { acquisition: 'failed', detail: requestSignal?.aborted ? 'Package download cancelled.'
          : error instanceof Error ? error.message : 'Package download could not be verified.' };
      }
    },
  };
  let completed = false;
  return {
    acquisition,
    complete: () => {
      if (completed) throw new Error('Extension installation plan has already been consumed.');
      completed = true;
      if (!source) throw new Error('Approve and verify the exact package source before reviewing publication.');
      host.check(); source.check();
      return packageOperation(host, source, replacing);
    },
  };
}

function packageOperation(host: LifecycleHost, source: InstallSource, replacing?: string): Operation {
  host.check(); source.check();
  const approved = source.version;
  const { name, version } = approved.manifest;
  assertReplacementName(replacing, name);
  const state = host.store.read(); const old = state.packages.find(entry => entry.name === name);
  const root = packageRoot(host.store.file);
  const storage = storageIdentity(path.join(root, name));
  if (Boolean(old) !== Boolean(replacing)) throw new Error(old ? 'Extension is already installed; use update.' : 'Extension is not installed.');
  if (old) {
    assertPackage(old, host.store);
    if (old.active.digest === approved.digest) throw new Error('That exact extension content is already active.');
    if (old.history.some(entry => entry.digest === approved.digest)) throw new Error('That exact extension content is retained; use rollback.');
    if (old.history.length >= 3) throw new Error('Extension history limit reached; uninstall intact owned versions before a fresh installation.');
  } else if (state.packages.length >= 64) throw new Error('Installed extension limit reached.');
  const description = old ? `Replace ${name}@${old.active.manifest.version} with ${name}@${version}` : `Install ${name}@${version}`;
  const receipt = { effect: 'published' as const, detail: `${name}@${version} package files published; activation and grants cleared.` };
  return { preview: `${description}\n${source.preview}\nSHA256 ${approved.digest}\nManifest ${canonical(approved.manifest)}\nNo lifecycle scripts run. Activation and capability grants start empty.`,
    ...(approved.origin === 'npm' || approved.origin === 'git' ? { explicitApproval: true } : {}),
    apply: async context => {
      const check = () => {
        context.abortSignal?.throwIfAborted();
        host.check();
        const blocked = context.admission?.();
        if (blocked) throw new Error(blocked);
        source.check();
        assertStorageIdentity(storage);
      };
      check();
      const files = await source.load(context.abortSignal);
      check(); files.check?.();
      assertStoragePath(root); fs.mkdirSync(root, { recursive: true, mode: 0o700 }); assertStoragePath(root);
      const stage = fs.mkdtempSync(path.join(root, '.stage-'));
      const stageIdentity = storageIdentity(stage);
      let moved = false;
      let outcome: EffectOutcome | undefined;
      try {
        fs.chmodSync(stage, 0o700);
        files.stage(stage);
        const installedBase = { ...approved, files: files.files, directories: files.directories };
        outcome = host.store.locked(state, current => {
          check();
          const latest = current.packages.find(entry => entry.name === name); if (latest) assertPackage(latest, host.store);
          const destination = path.join(root, name, approved.digest);
          assertStoragePath(destination);
          if (fs.existsSync(destination)) throw new Error('An untracked or retained extension destination already exists; content was preserved.');
          fs.mkdirSync(path.dirname(destination), { recursive: true, mode: 0o700 });
          assertStoragePath(destination);
          assertInventory(stage, { ...installedBase, storage: stageIdentity });
          check(); files.check?.();
          fs.renameSync(stage, destination); moved = true;
          const installed: VersionRecord = { ...installedBase, storage: storageIdentity(destination) };
          const next: PackageRecord = { name, active: installed, history: latest ? [latest.active, ...latest.history] : [], activation: {} };
          return host.store.publish({ ...current, packages: [...current.packages.filter(entry => entry.name !== name), next] }, receipt);
        });
      } catch (error) {
        if (moved) outcome = host.store.recordUnknown({ effect: 'published', detail: `${name}@${version} installation could not be verified after publishing its files.` });
        else {
          try { assertStorageIdentity(stageIdentity); fs.rmSync(stage, { recursive: true }); }
          catch { outcome = host.store.recordUnknown({ effect: 'saved', detail: 'Private extension staging cleanup could not be verified.' }); }
          if (!outcome) throw error;
        }
      }
      await host.invalidate(context.abortSignal);
      return outcome;
    } };
}

function assertReplacementName(replacing: string | undefined, requested: string): void {
  if (replacing && replacing !== requested) throw new Error('Update package must match the selected package.');
}

function remotePackage(host: LifecycleHost, spec: InstallSpec): { description: string; check(): void; load(admission: () => void, signal?: AbortSignal): Promise<InstallSource> } | undefined {
  if (spec.kind === 'git') {
    const target = gitArchiveTarget(spec, host.gitArchiveBase);
    const check = () => {
      if (gitArchiveTarget(spec, host.gitArchiveBase).url !== target.url) throw new Error('Approved Git archive endpoint changed.');
    };
    return { description: `Git repository ${spec.repository}\nCommit ${spec.commit}\nArchive ${target.url}`, check,
      load: (_admission, signal) => gitSource(host, spec, target, check, signal) };
  }
  if (spec.kind !== 'registry' || spec.source !== 'npm'
    || (/^[a-z][a-z0-9_-]{0,63}$/.test(spec.name) && readSources().some(source => source.name === 'npm'))) return undefined;
  const registry = npmRegistry(host.npmRegistry);
  const check = () => {
    if (npmRegistry(host.npmRegistry).url !== registry.url) throw new Error('Approved npm registry changed.');
  };
  return { description: `Npm package ${spec.name}@${spec.version}\nRegistry ${registry.url}`, check,
    load: (admission, signal) => npmSource(host, spec, registry, check, admission, signal) };
}

function archiveFiles(archive: ValidatedArchive): ExtensionInventory & { readonly stage: (target: string) => void } {
  return { files: archive.files, directories: archive.directories, stage: target => extractArchive(archive, target) };
}

async function registrySource(host: LifecycleHost, spec: RegistrySpec, signal?: AbortSignal): Promise<InstallSource> {
  const source = selectedSource(spec.source);
  const approved = await host.request(signal => exact(source, spec.name, spec.version, signal, host.offline()), signal);
  const version = { ...approved, source: spec.source, sourceIdentity: sourceIdentity(source), trustFingerprint: source.trust!.fingerprint };
  return { version, preview: `Source ${spec.source}\nTrust ${source.trust!.keyId} ${source.trust!.fingerprint}`,
    check: () => assertVersionSource(version), load: async signal => {
      const bytes = await registryBytes(source, approved.url, ARCHIVE_BYTES, signal, host.offline());
      return archiveFiles(await validateArchive(bytes, approved));
    } };
}

async function npmSource(host: LifecycleHost, spec: RegistrySpec, registry: ExtensionSource, check: () => void, admission: () => void, signal?: AbortSignal): Promise<InstallSource> {
  const release = await exactNpm(registry, spec.name, spec.version, signal, host.offline());
  admission();
  const bytes = await registryBytes(registry, release.url, ARCHIVE_BYTES, signal, host.offline());
  const { archive, manifest, digest } = await validateNpmArchive(bytes, release);
  const selected: InstallVersion = { origin: 'npm', source: 'npm', registry: registry.url, packageName: release.packageName,
    integrity: release.integrity, url: release.url, manifest, digest };
  return { version: selected, preview: `Npm package ${release.packageName}@${release.version}\nRegistry ${registry.url}\nIntegrity ${release.integrity}`,
    check, load: async () => archiveFiles(archive) };
}

async function gitSource(host: LifecycleHost, release: GitRelease, target: ReturnType<typeof gitArchiveTarget>, check: () => void, signal?: AbortSignal): Promise<InstallSource> {
  const bytes = await registryBytes(target.source, target.url, ARCHIVE_BYTES, signal, host.offline());
  const { archive, manifest, digest } = await validateGitArchive(bytes, release);
  const selected: InstallVersion = { origin: 'git', source: 'git', repository: release.repository,
    commit: release.commit, url: target.url, manifest, digest };
  return { version: selected, preview: `Git repository ${release.repository}\nCommit ${release.commit}\nArchive ${target.url}`,
    check, load: async () => archiveFiles(archive) };
}

async function localSource(host: LifecycleHost, input: string, signal?: AbortSignal): Promise<InstallSource> {
  const root = host.root;
  if (!root || !host.assertSourceAccess) throw new Error('Local extension source authority is unavailable.');
  const access = host.assertSourceAccess.bind(host);
  const directory = localPackagePath(root, input);
  const ownership = storageIdentity(directory);
  const check = () => { access(directory); assertStorageIdentity(ownership); };
  const approved = await host.request(async signal => {
    const captured = await captureLocalPackage(root, directory, access, signal);
    return { origin: 'local' as const, source: 'local' as const, manifest: captured.manifest, digest: captured.digest };
  }, signal);
  return { version: approved, preview: `Local package ${path.relative(root, directory) || '.'}\nTrust Explicit local content approval`, check,
    load: async signal => {
      const captured = await captureLocalPackage(root, directory, access, signal);
      if (captured.digest !== approved.digest) throw new Error('Local extension content changed after review.');
      return captured;
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
  if (!record) throw new Error('Extension is not installed.');
  const selected = /^[a-f0-9]{64}$/.test(pinned)
    ? record.history.find(entry => entry.digest === pinned)
    : record.history.find(entry => entry.manifest.version === version(pinned));
  if (!selected) throw new Error('Reviewed rollback version is unavailable.'); assertPackage(record, host.store);
  assertVersionSource(selected);
  const selectedVersion = selected.manifest.version;
  return { preview: `Rollback ${packageName} to ${selectedVersion} SHA256 ${selected.digest}. Activation and capability grants clear.`, apply: async context => {
    context.abortSignal?.throwIfAborted(); host.check();
    const outcome = host.store.locked(state, current => {
      assertPackage(record, host.store); assertVersionSource(selected); host.check(); context.abortSignal?.throwIfAborted();
      const next = { ...record, active: selected, history: [record.active, ...record.history.filter(entry => entry !== selected)], activation: {} };
      return host.store.publish({ ...current, packages: current.packages.map(entry => entry.name === packageName ? next : entry) }, { effect: 'saved', detail: `${packageName} rolled back to ${selectedVersion}; activation and grants cleared.` });
    });
    await host.invalidate(context.abortSignal); return outcome;
  } };
}
