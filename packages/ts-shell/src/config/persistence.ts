import path from 'node:path';
import fs from 'node:fs';
import { createHash } from 'node:crypto';
import { freezeDeep } from '../core/values/freeze.js';
import { withFileLock, writeTextFileAtomic } from '../session/store/sessionFileStore.js';
import { configSnapshotMatches, readConfigSnapshot, type CapturedConfigSnapshot } from './document.js';
import { type ConfigFields } from './fields.js';
import { validateRawConfig } from './layers.js';
import { ConfigDocumentError } from './syntax.js';
import { patchConfigDocument } from './patch.js';
import { mergeConfigEdit } from './conflict.js';
import { configDocumentPaths, mergeConfigDocuments, partitionConfigDocuments, readConfigDocuments } from './documents.js';
import { CREDENTIAL_FILE_MODE, holdsCredentialMaterial, narrowCredentialFile } from './secret.js';
import { ConfigWriteError, type ConfigWriteState } from './outcome.js';
import { assertCurrentProfile, assertProfileStorage, currentProfile, type ProfileContext } from '../core/paths/profile/context.js';
import { isWithin } from '../core/paths/profile/identity.js';
import { stagePreferences } from './preferences/documents.js';
import { PREFERENCE_FIELD, PreferenceDocumentError } from './preferences/contract.js';

export interface ConfigEdit<T> {
  readonly path: string;
  readonly revision: string | null;
  readonly values: T;
}

interface EditOwner {
  readonly profile: ProfileContext | undefined;
  readonly paths: ReturnType<typeof configDocumentPaths>;
  readonly settingsPresent: boolean;
  readonly authPresent: boolean;
  readonly settingsCanonical?: string;
  readonly authCanonical?: string;
  readonly settingsRevision?: string;
  readonly authRevision?: string;
}
const owners = new WeakMap<ConfigEdit<unknown>, EditOwner>();

/** Explicit immutable baselines cannot accidentally survive a spread as raw config. */
class EditBaseline<T> implements ConfigEdit<T> {
  constructor(readonly path: string, readonly revision: string | null, readonly values: T, owner: EditOwner) {
    owners.set(this, owner); freezeDeep(this);
  }
}

function assertOwner(file: string, profile: ProfileContext | undefined): void {
  if (!profile) return;
  assertCurrentProfile(profile);
  if (isWithin(profile.root, file)) assertProfileStorage(file, profile);
}

function revision(text: string | undefined): string | null {
  return text === undefined ? null : createHash('sha256').update(text).digest('hex');
}

/** One revision over every document an edit covers, so a change to any refuses it. */
function pairRevision(settingsText: string | undefined, authText: string | undefined, authPath: string | undefined): string | null {
  if (settingsText === undefined && authText === undefined) return null;
  return revision(authPath === undefined ? settingsText : JSON.stringify([settingsText ?? null, authText ?? null]));
}

/** Fallback sources and link destinations remain owned by the acquired edit. */
function assertSelection(filePath: string, owner: EditOwner): void {
  try {
    const selected = configDocumentPaths(filePath);
    if (selected.settingsPath !== owner.paths.settingsPath || selected.authPath !== owner.paths.authPath
      || owner.settingsCanonical && fs.realpathSync(owner.paths.settingsPath) !== owner.settingsCanonical
      || owner.authCanonical && fs.realpathSync(owner.paths.authPath!) !== owner.authCanonical) throw new Error();
  } catch { throw new ConfigWriteError('conflict', 'unchanged'); }
}

/** Read-only receipt checks use the same physical ownership fence as saves. */
export function configEditStorage(baseline: ConfigEdit<unknown>): readonly string[] {
  const owner = owners.get(baseline);
  if (!(baseline instanceof EditBaseline) || !owner) throw new ConfigWriteError('baseline-invalid', 'unchanged');
  assertOwner(owner.paths.settingsPath, owner.profile);
  if (owner.paths.authPath) assertOwner(owner.paths.authPath, owner.profile);
  assertSelection(baseline.path, owner);
  return [owner.paths.settingsPath, owner.settingsCanonical ?? owner.paths.settingsPath,
    ...(owner.paths.authPath ? [owner.paths.authPath, owner.authCanonical ?? owner.paths.authPath] : [])];
}

/** Physical revisions describe origin files; the combined edit revision fences the logical pair. */
export function configEditDocuments(baseline: ConfigEdit<unknown>): readonly { source: string; path: string; revision: string | null }[] {
  configEditStorage(baseline);
  const owner = owners.get(baseline)!;
  return [{ source: owner.paths.settingsPath, path: owner.settingsCanonical ?? owner.paths.settingsPath, revision: owner.settingsRevision ?? null },
    ...(owner.paths.authPath ? [{ source: owner.paths.authPath, path: owner.authCanonical ?? owner.paths.authPath, revision: owner.authRevision ?? null }] : [])];
}

export function readConfigEdit<T>(filePath: string, fields: ConfigFields): ConfigEdit<T> {
  const profile = currentProfile();
  const paths = configDocumentPaths(filePath);
  const { settingsPath, authPath } = paths;
  assertOwner(settingsPath, profile);
  if (authPath) assertOwner(authPath, profile);
  const settings = readConfigSnapshot(settingsPath);
  const auth = authPath ? readConfigSnapshot(authPath) : undefined;
  // The credential document is read second, so a field it holds wins. That order
  // is what makes the migration invisible: a pre-split file still carries its
  // credentials, and a re-entered credential must not be shadowed by the copy.
  let values: Record<string, unknown>;
  try { values = authPath ? mergeConfigDocuments(settings?.values ?? {}, auth?.values ?? {}) : settings?.values ?? {}; }
  catch (error) {
    if (error instanceof PreferenceDocumentError) throw new ConfigWriteError('conflict', 'unchanged');
    throw error;
  }
  validateRawConfig(settings?.values ?? {}, fields);
  validateRawConfig(auth?.values ?? {}, fields);
  validateRawConfig(values, fields);
  if (!configSnapshotMatches(settingsPath, settings) || authPath && !configSnapshotMatches(authPath, auth)) {
    throw new ConfigWriteError('conflict', 'unchanged');
  }
  return new EditBaseline(settingsPath, pairRevision(settings?.text, auth?.text, authPath), values as T,
    { profile, paths, settingsPresent: settings !== undefined, authPresent: auth !== undefined,
      settingsCanonical: settings ? fs.realpathSync(settingsPath) : undefined,
      authCanonical: auth ? fs.realpathSync(authPath!) : undefined,
      settingsRevision: settings?.revision, authRevision: auth?.revision });
}

/** Lock + reread protects participating writers, not external editors' rename windows. */
export function persistConfigEdit<T>(filePath: string, patch: T, baseline: ConfigEdit<T>, fields: ConfigFields,
  precondition?: (current: Readonly<T>) => boolean): string {
  if (!(baseline instanceof EditBaseline) || baseline.path !== path.resolve(filePath)) throw new ConfigWriteError('baseline-invalid', 'unchanged');
  let state: ConfigWriteState = 'unchanged';
  let code: 'lock-failed' | 'invalid-document' | 'write-failed' | 'verification-failed' = 'lock-failed';
  let cleanupFailed = false;
  let savedRevision: string | undefined;
  try {
    const owner = owners.get(baseline)!;
    const { profile, paths: { settingsPath, authPath } } = owner;
    assertSelection(filePath, owner);
    if (!profile && currentProfile()) throw new ConfigWriteError('conflict', 'unchanged');
    const settingsTarget = owner.settingsCanonical ?? settingsPath;
    const authTarget = owner.authCanonical ?? authPath;
    if (settingsTarget === authTarget) throw new ConfigWriteError('conflict', 'unchanged');
    assertOwner(settingsPath, profile);
    assertOwner(settingsTarget, profile);
    assertOwner(`${settingsTarget}.lock`, profile);
    if (authPath) { assertOwner(authPath, profile); assertOwner(authTarget!, profile); assertOwner(`${authTarget}.lock`, profile); }
    code = 'invalid-document';
    validateRawConfig(patch, fields);
    // Physical envelopes are edited through their joined logical records.
    if (authPath && Object.hasOwn(patch as object, PREFERENCE_FIELD)) throw new ConfigWriteError('invalid-document', 'unchanged');
    const desired = JSON.parse(JSON.stringify({ ...baseline.values, ...patch }));
    validateRawConfig(desired, fields);
    code = 'lock-failed';
    const locked = (): string => {
      assertOwner(settingsPath, profile);
      if (authPath) assertOwner(authPath, profile);
      code = 'invalid-document';
      assertSelection(filePath, owner);
      const documents = authPath ? readConfigDocuments(settingsPath, authPath)
        : { settings: readConfigSnapshot(settingsPath), auth: undefined, values: {} };
      const { settings, auth } = documents;
      // Disjoint edits can merge, but removing an acquired document is a reset:
      // an old edit must not resurrect it, even when its fields were untouched.
      if (owner.settingsPresent && !settings || owner.authPresent && !auth) throw new ConfigWriteError('conflict', 'unchanged');
      validateRawConfig(settings?.values ?? {}, fields);
      validateRawConfig(auth?.values ?? {}, fields);
      const current = authPath ? documents.values : settings?.values ?? {};
      validateRawConfig(current, fields);
      // Some edits depend on a selector in another record. A three-way merge
      // alone cannot validate that dependency against the locked snapshot.
      if (precondition && !precondition(freezeDeep(current) as Readonly<T>)) throw new ConfigWriteError('conflict', 'unchanged');
      const merged = mergeConfigEdit(baseline.values as Record<string, unknown>, desired, current);
      validateRawConfig(merged, fields);
      // Each document is patched against its own bytes, so comments and unknown
      // fields survive exactly as they did when there was one file.
      const split = authPath ? partitionConfigDocuments(merged, documents) : { settings: merged, auth: {} };
      const settingsText = documentText(settings, split.settings);
      const authText = authPath ? documentText(auth, split.auth) : undefined;
      // Also guard absence and exact trivia. No CAS claim against an editor
      // that changes a path between this check and the atomic rename.
      if (readConfigSnapshot(settingsPath)?.text !== settings?.text || !configSnapshotMatches(settingsPath, settings)
        || authPath && (readConfigSnapshot(authPath)?.text !== auth?.text || !configSnapshotMatches(authPath, auth))) {
        throw new ConfigWriteError('conflict', 'unchanged');
      }
      if (precondition && !precondition(freezeDeep(current) as Readonly<T>)) throw new ConfigWriteError('conflict', 'unchanged');
      assertSelection(filePath, owner);
      let wrote = false;
      let expectedSettings = settings; let expectedAuth = auth;
      const check = (): void => {
        try { assertSelection(filePath, owner); }
        catch { throw new ConfigWriteError('conflict', state); }
        if (!configSnapshotMatches(settingsPath, expectedSettings)
          || authPath && !configSnapshotMatches(authPath, expectedAuth)) throw new ConfigWriteError('conflict', state);
      };
      const publish = (kind: 'settings' | 'auth', text: string | undefined): void => {
        const previous = kind === 'auth' ? expectedAuth : expectedSettings;
        if (text === undefined && previous) text = patchConfigDocument(previous, {});
        if (text === previous?.text) return;
        check();
        const selected = kind === 'auth' ? authPath! : settingsPath;
        const target = kind === 'auth' ? authTarget! : settingsTarget;
        assertOwner(selected, profile); assertOwner(target, profile);
        state = 'unknown'; code = 'write-failed';
        writeTextFileAtomic(target, text!, kind === 'auth' || holdsCredentialMaterial(split.settings) ? CREDENTIAL_FILE_MODE : undefined);
        code = 'verification-failed';
        const saved = readConfigSnapshot(selected);
        if (saved?.text !== text) throw new ConfigWriteError('verification-failed', 'unknown');
        if (kind === 'auth') expectedAuth = saved; else expectedSettings = saved;
        wrote = true;
        check();
      };
      // Preserve credentials in auth before stripping legacy settings. Preserve
      // existing defaults in the staged auth until their settings destination is
      // verified; only then remove those legacy leaves and deleted records.
      if (authPath) {
        const staged = stagePreferences(split.auth, { ...(settings?.values ?? {}), ...(auth?.values ?? {}) });
        if (auth?.values[PREFERENCE_FIELD] !== undefined) staged[PREFERENCE_FIELD] = auth.values[PREFERENCE_FIELD];
        publish('auth', settingsText === settings?.text ? authText : documentText(auth, staged));
      }
      publish('settings', settingsText);
      if (authPath) publish('auth', authText);
      check();
      if (authPath && auth && authText === auth.text) {
        narrowCredentialFile(authTarget!);
        const narrowed = readConfigSnapshot(authPath);
        if (narrowed?.text !== expectedAuth?.text) throw new ConfigWriteError('conflict', state);
        expectedAuth = narrowed;
      }
      if (settings && settingsText === settings.text && holdsCredentialMaterial(settings.values)) {
        narrowCredentialFile(settingsTarget);
        const narrowed = readConfigSnapshot(settingsPath);
        if (narrowed?.text !== expectedSettings?.text) throw new ConfigWriteError('conflict', state);
        expectedSettings = narrowed;
      }
      check();
      if (wrote) {
        assertOwner(settingsPath, profile);
        if (authPath) assertOwner(authPath, profile);
        code = 'verification-failed';
        if (readConfigSnapshot(settingsPath)?.text !== settingsText
          || (authPath && !configSnapshotMatches(authPath, expectedAuth))) {
          throw new ConfigWriteError('verification-failed', 'unknown');
        }
        state = 'persisted';
        savedRevision = pairRevision(settingsText, expectedAuth?.text, authPath)!;
      }
      try { assertSelection(filePath, owner); }
      catch { throw new ConfigWriteError('conflict', wrote ? 'unknown' : 'unchanged'); }
      code = 'lock-failed';
      return filePath;
    };
    // Cooperating writers hold both locks in this order. Readers do not lock:
    // readback is verified, but this is not a cross-file atomic transaction.
    return withFileLock(`${settingsTarget}.lock`,
      () => (authPath ? withFileLock(`${authTarget}.lock`, locked,
        { recovery: 'local-dead', onReleaseError: () => { cleanupFailed = true; } }) : locked()),
      { recovery: 'local-dead', onReleaseError: () => { cleanupFailed = true; } });
  } catch (error) {
    if (error instanceof ConfigWriteError) throw new ConfigWriteError(error.code, error.state, cleanupFailed, savedRevision);
    throw new ConfigWriteError(error instanceof ConfigDocumentError && state === 'unchanged' ? error.code : code, state, cleanupFailed, savedRevision);
  }
}

/** A save does not create an absent document that has no owned fields. */
function documentText(snapshot: CapturedConfigSnapshot | undefined, values: Record<string, unknown>): string | undefined {
  return !snapshot && Object.keys(values).length === 0 ? undefined : patchConfigDocument(snapshot, values);
}
