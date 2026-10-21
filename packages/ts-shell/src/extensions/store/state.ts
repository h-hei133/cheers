import path from 'node:path';
import { resolveUserDataFile } from '../../core/paths/userHome.js';
import { assertProfileStorage, currentProfile, profilePathOverride } from '../../core/paths/profile/context.js';
import { withFileLock, writeJsonFileAtomic } from '../../session/store/sessionFileStore.js';
import { isRecord } from '../../core/values/record.js';
import { readTextFile } from '../../core/workspace/files.js';
import { canonical, digest, manifest, name, relativePath, release } from '../registry/validation.js';
import type { ExtensionState, PackageRecord, VersionRecord, EffectOutcome } from '../model.js';
import { assertStoragePath } from './paths.js';
export { assertStoragePath, storageIdentity, assertStorageIdentity } from './paths.js';

const STATE_CHARACTERS = 2 * 1024 * 1024;

export function extensionFile(): string { return profilePathOverride('CHEERS_EXTENSIONS_FILE') || resolveUserDataFile('extensions/registry.json'); }
export function packageRoot(file = extensionFile()): string { return path.join(path.dirname(file), 'packages'); }
export function versionPath(record: VersionRecord, file = extensionFile()): string { return path.join(packageRoot(file), record.manifest.name, record.digest); }
function validVersion(value: unknown): VersionRecord {
  if (!isRecord(value) || !isRecord(value.files) || Object.keys(value.files).length > 512 || !Array.isArray(value.directories) || value.directories.length > 512 || typeof value.source !== 'string' || typeof value.sourceIdentity !== 'string' || typeof value.trustFingerprint !== 'string') throw new Error('Invalid installed extension provenance.');
  for (const [selected, hash] of Object.entries(value.files)) if (relativePath(selected) !== selected || typeof hash !== 'string' || !/^[a-f0-9]{64}$/.test(hash)) throw new Error('Invalid installed extension inventory.');
  const pinned = release(value); manifest(pinned.manifest); name(value.source);
  if (!/^[a-f0-9]{64}$/.test(value.sourceIdentity) || !/^[a-f0-9]{64}$/.test(value.trustFingerprint)) throw new Error('Invalid installed extension identity.');
  if (!Array.isArray(value.storage) || !value.storage.length || value.storage.length > 128 || value.storage.some(entry => !isRecord(entry) || typeof entry.path !== 'string' || !path.isAbsolute(entry.path) || path.resolve(entry.path) !== entry.path || typeof entry.identity !== 'string' || !/^\d+:\d+:\d+$/.test(entry.identity))) throw new Error('Invalid installed storage ownership.');
  return { ...pinned, source: value.source, sourceIdentity: value.sourceIdentity, trustFingerprint: value.trustFingerprint, files: value.files as Record<string, string>, directories: value.directories.map(relativePath), storage: value.storage as VersionRecord['storage'] };
}
export function readState(file = extensionFile()): ExtensionState {
  assertStoragePath(file);
  let value: unknown;
  try {
    // Bound acquisition before decoding; keep the existing UTF-16 character limit.
    const raw = readTextFile(file, STATE_CHARACTERS * 4);
    if (raw === undefined) return { schema: 1, revision: 0, packages: [], imports: [] };
    if (raw.length > STATE_CHARACTERS) throw new Error();
    value = JSON.parse(raw);
  } catch { throw new Error('Extension state is unreadable; capabilities are withheld.'); }
  if (!isRecord(value) || value.schema !== 1 || !Number.isSafeInteger(value.revision) || (value.revision as number) < 0 || !Array.isArray(value.packages) || value.packages.length > 64 || !Array.isArray(value.imports) || value.imports.length > 64) throw new Error('Invalid extension state.');
  const packages: PackageRecord[] = value.packages.map(entry => {
    if (!isRecord(entry) || !Array.isArray(entry.history) || entry.history.length > 3 || !isRecord(entry.activation) || Object.keys(entry.activation).length > 64) throw new Error('Invalid extension record.');
    const active = validVersion(entry.active); const history = entry.history.map(validVersion); name(entry.name);
    if (active.manifest.name !== entry.name || history.some(version => version.manifest.name !== entry.name)) throw new Error('Extension identity mismatch.');
    for (const version of [active, ...history]) {
      let selected = path.resolve(versionPath(version, file));
      for (const directory of version.storage) { if (directory.path !== selected) throw new Error('Installed storage ownership path differs.'); selected = path.dirname(selected); }
      if (version.storage.at(-1)!.path !== path.parse(selected).root) throw new Error('Installed storage ancestry is incomplete.');
    }
    for (const [root, activation] of Object.entries(entry.activation)) {
      if (!path.isAbsolute(root) || !isRecord(activation) || typeof activation.workspaceIdentity !== 'string' || activation.workspaceIdentity.length > 128 || typeof activation.enabled !== 'boolean' || !Array.isArray(activation.grants) || activation.grants.length > 128 || activation.grants.some(grant => typeof grant !== 'string' || grant.length > 100)) throw new Error('Invalid extension activation.');
    }
    return { name: entry.name as string, active, history, activation: entry.activation as PackageRecord['activation'] };
  });
  if (new Set(packages.map(entry => entry.name)).size !== packages.length) throw new Error('Duplicate installed extension.');
  const imports = value.imports.map(entry => { if (!isRecord(entry) || typeof entry.name !== 'string' || typeof entry.spec !== 'string' || typeof entry.version !== 'string' || entry.status !== 'unresolved') throw new Error('Invalid legacy extension import.'); return { name: entry.name, spec: entry.spec, version: entry.version, status: 'unresolved' as const }; });
  return { schema: 1, revision: value.revision as number, packages, imports };
}
export function stateIdentity(state: ExtensionState): string { return digest(canonical(state)); }
export class ExtensionStore {
  private readonly profile = currentProfile();
  readonly outcomes: EffectOutcome[] = [];
  constructor(readonly file = extensionFile(), readonly save = writeJsonFileAtomic) { assertProfileStorage(file, this.profile); }
  read(): ExtensionState { assertProfileStorage(this.file, this.profile); return readState(this.file); }
  locked<T>(expected: ExtensionState, action: (state: ExtensionState) => T): T {
    assertProfileStorage(`${this.file}.lock`, this.profile);
    if (this.outcomes.some(outcome => outcome.durability === 'unknown')) throw new Error('Extension publication is uncertain; inspect retained package data and restart before a fresh mutation.');
    return withFileLock(`${this.file}.lock`, () => { const current = this.read(); if (stateIdentity(current) !== stateIdentity(expected)) throw new Error('Approved extension state changed.'); return action(current); });
  }
  publish(state: ExtensionState, outcome: Omit<EffectOutcome, 'durability'>): EffectOutcome {
    assertProfileStorage(this.file, this.profile);
    const actual: EffectOutcome = { ...outcome, durability: 'confirmed' };
    try { this.save(this.file, { ...state, revision: state.revision + 1 }); assertProfileStorage(this.file, this.profile); }
    catch { const unknown: EffectOutcome = { ...outcome, durability: 'unknown' }; this.outcomes.push(unknown); return unknown; }
    this.outcomes.push(actual); if (this.outcomes.length > 32) this.outcomes.shift(); return actual;
  }
}
