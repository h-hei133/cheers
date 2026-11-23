import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { userDataSearchDirs } from '../core/paths/userHome.js';
import { assertCurrentProfile, assertProfileStorage, currentProfile, type ProfileContext } from '../core/paths/profile/context.js';
import { assertDirectoryIdentity, assertUnlinkedPath, directoryIdentity } from '../core/paths/profile/identity.js';
import { fileIdentity, inspectWorkspaceFile } from '../core/workspace/files.js';
import { configSnapshotMatches, readConfigSnapshot, serializeConfigDocument, type CapturedConfigSnapshot } from './document.js';
import { resolveConfigFile } from '../core/paths/config.js';
import { projectConfigCandidates, resolveProjectConfigFile } from '../core/paths/project.js';
import { partitionConfigDocuments, mergeConfigDocuments, userAuthPath, type ConfigDocuments } from './documents.js';
import { patchConfigDocument } from './patch.js';
import { writeTextFileAtomic, withFileLock } from '../session/store/sessionFileStore.js';
import { CREDENTIAL_FILE_MODE, holdsCredentialMaterial } from './secret.js';
import { CONFIG_MAX_BYTES, ConfigDocumentError } from './syntax.js';
import { PREFERENCE_FIELD } from './preferences/contract.js';
import { stagePreferences } from './preferences/documents.js';
import { sameValue } from './values.js';

export interface MigrationItem {
  readonly file: string;
  readonly status: 'complete' | 'unchanged' | 'partial' | 'rejected';
  readonly reason?: string;
}

const HUMAN_FILES = ['config', 'models', 'keybindings', 'sandbox'] as const;

interface Migration {
  readonly source: string;
  readonly target: string;
  readonly selected: () => string;
  readonly admit: () => void;
  readonly profile?: ProfileContext;
  readonly auth?: string;
  readonly workspace?: boolean;
  readonly workflow?: boolean;
  readonly catalog?: boolean;
}

/** Explicitly convert selected legacy user files, retaining exact backups and all source failures. */
export function migrateUserConfig(): readonly MigrationItem[] {
  const profile = currentProfile();
  return HUMAN_FILES.map(stem => {
    const selected = () => resolveConfigFile(userDataSearchDirs(), stem);
    const source = selected();
    if (!source.endsWith('.json')) return { file: source, status: 'unchanged' };
    try {
      return migrate({ source, target: `${source.slice(0, -5)}.yaml`, selected, profile,
        auth: stem === 'config' ? userAuthPath() : undefined, catalog: stem === 'models',
        admit: () => { if (profile) assertCurrentProfile(profile); } });
    } catch (error) { return { file: source, status: 'rejected', reason: safeReason(error) }; }
  });
}

/** Explicitly migrate human-editable files owned by the selected workspace. */
export function migrateWorkspaceConfig(workspaceRoot: string): readonly MigrationItem[] {
  const root = path.resolve(workspaceRoot);
  const items: MigrationItem[] = [];
  try {
    const rootIdentity = directoryIdentity(root);
    const admit = () => assertDirectoryIdentity(rootIdentity);
    admit();
    const project = () => resolveProjectConfigFile(root, 'config.json');
    const candidates = projectConfigCandidates(root, 'config.json');
    const source = project();
    if (source.endsWith('.json') && entry(source)) {
      const target = candidates.find(candidate => candidate.endsWith('.yaml'));
      if (!target) {
        items.push({ file: source, status: 'rejected', reason: 'Project settings share the personal configuration path at this workspace root.' });
      } else {
        items.push(migrate({ source, target, selected: project, admit, workspace: true }));
      }
    }
    const agents = path.join(root, '.agents');
    const definitions = path.join(agents, 'workflows');
    function add(directory: string, stem: string, workflow = false): void {
      const selected = () => resolveConfigFile([directory], stem);
      const file = selected();
      if (file.endsWith('.json')) items.push(migrate({ source: file, target: `${file.slice(0, -5)}.yaml`, selected, admit, workspace: true, workflow }));
    }
    add(agents, 'sandbox');
    try {
      assertUnlinkedPath(definitions);
      for (const file of fs.readdirSync(definitions).sort()) {
        if (/^[A-Za-z0-9_-][A-Za-z0-9_.-]{0,63}\.json$/.test(file)) add(definitions, file.slice(0, -5), true);
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') items.push({ file: definitions, status: 'rejected', reason: safeReason(error) });
    }
    return items;
  } catch (error) { return [...items, { file: root, status: 'rejected', reason: safeReason(error) }]; }
}

/** Run both personal and current-workspace migrations for the explicit CLI command. */
export function migrateConfiguration(workspaceRoot: string): readonly MigrationItem[] {
  return [...migrateUserConfig(), ...migrateWorkspaceConfig(workspaceRoot)];
}

function migrate(input: Migration): MigrationItem {
  const { source, target, auth, profile } = input;
  const backup = `${source}.bak`;
  let publicationStarted = false;
  try {
    input.admit();
    const original = entry(source);
    if (!original) return { file: source, status: 'unchanged' };
    if (input.workspace) assertUnlinkedPath(path.dirname(source));
    if (input.workflow) assertUnlinkedPath(source);
    const canonicalSource = fs.realpathSync(source);
    const lock = `${input.workspace ? source : canonicalSource}.lock`;
    const canonicalAuth = auth && (entry(auth) ? fs.realpathSync(auth) : auth);
    if (canonicalAuth === canonicalSource) throw new Error('Settings and credential files have the same target.');
    if (canonicalAuth && !entry(path.dirname(canonicalAuth))) {
      if (profile) assertProfileStorage(path.dirname(canonicalAuth), profile);
      fs.mkdirSync(path.dirname(canonicalAuth), { mode: 0o700 });
      syncDirectory(path.dirname(path.dirname(canonicalAuth)));
    }
    const check = () => {
      input.admit();
      if (profile) for (const file of [source, target, backup, lock, ...(auth ? [auth, `${canonicalAuth}.lock`, canonicalAuth!] : [])]) {
        assertProfileStorage(file, profile);
      }
      if (input.workspace) for (const file of [path.dirname(source), target, backup, lock]) assertUnlinkedPath(file);
      if (fs.realpathSync(source) !== canonicalSource || !sameIdentity(source, original)) throw new Error('Configuration source changed.');
      if (auth && entry(auth) && fs.realpathSync(auth) !== canonicalAuth) throw new Error('Credential file changed.');
    };
    check();
    const options = { createParent: false, recovery: 'local-dead' } as const;
    const action = () => {
      check();
      if (input.selected() !== source || entry(target)) return { file: source, status: 'rejected', reason: 'The selected source or YAML destination changed.' } as const;
      return migrateLocked(input, { original, backup, canonicalAuth, check, started: () => { publicationStarted = true; } });
    };
    return withFileLock(lock, () => canonicalAuth ? withFileLock(`${canonicalAuth}.lock`, action, options) : action(), options);
  } catch (error) {
    return { file: source, status: publicationStarted ? 'partial' : 'rejected', reason: safeReason(error) };
  }
}

function migrateLocked(input: Migration, lock: { original: fs.Stats; backup: string; canonicalAuth?: string; check: () => void; started: () => void }): MigrationItem {
  const { source, target, auth } = input;
  const { backup, canonicalAuth, check, original, started } = lock;
  const snapshot = readConfigSnapshot(source, { ...(input.catalog ? { allowDuplicateTopLevel: ['providers'] } : {}),
    ...(input.workflow ? { maxBytes: 512 * 1024 } : {}) });
  if (!snapshot) throw new Error('Configuration source is unavailable.');
  let credentials = auth ? readConfigSnapshot(auth) : undefined;
  const documents: ConfigDocuments = { settings: snapshot, auth: credentials,
    values: mergeConfigDocuments(snapshot.values, credentials?.values ?? {}) };
  const split = auth ? partitionConfigDocuments(documents.values, documents) : { settings: snapshot.values, auth: {} };
  const yamlText = serializeConfigDocument(split.settings, 'yaml');
  if (input.workflow && Buffer.byteLength(yamlText) > 512 * 1024) throw new ConfigDocumentError('resource-limit');
  const settingsMode = publicationMode(snapshot, split.settings);
  const backupMode = publicationMode(snapshot, snapshot.values);
  const verifySource = () => {
    check();
    if (!configSnapshotMatches(source, snapshot) || auth && !configSnapshotMatches(auth, credentials)) throw new Error('Configuration contents changed.');
  };
  const verifyBeforeTarget = () => {
    verifySource();
    if (input.selected() !== source || entry(target)) throw new Error('The selected source or YAML destination changed.');
  };
  verifyBeforeTarget();
  const backupIdentity = entry(backup) ?? publishExclusive(backup, snapshot.text, backupMode, verifyBeforeTarget, started);
  const verifyBackup = () => {
    if (fileIdentity(backupIdentity) === fileIdentity(original)) throw new Error('The backup shares the original file identity.');
    verifyPublished(backup, backupIdentity, snapshot.text, backupMode);
  };
  verifyBackup();

  const publishAuth = (values: Record<string, unknown>, admit: () => void) => {
    if (!auth || !canonicalAuth || !credentials && !Object.keys(values).length) return;
    const text = credentials ? patchConfigDocument(credentials, values) : `${serializeConfigDocument(values)}\n`;
    if (text === credentials?.text) return;
    admit(); started();
    if (credentials) {
      writeTextFileAtomic(canonicalAuth, text, CREDENTIAL_FILE_MODE, { createParent: false, beforeRename: admit });
      syncDirectory(path.dirname(canonicalAuth));
    } else {
      publishExclusive(canonicalAuth, text, CREDENTIAL_FILE_MODE, admit, started);
    }
    credentials = readConfigSnapshot(auth);
    if (credentials?.text !== text) throw new Error('Credential publication could not be verified.');
  };
  if (auth) {
    const raw = { ...snapshot.values, ...credentials?.values };
    const staged = stagePreferences(split.auth, raw);
    if (credentials?.values[PREFERENCE_FIELD] !== undefined) staged[PREFERENCE_FIELD] = credentials.values[PREFERENCE_FIELD];
    if (!sameValue(mergeConfigDocuments(snapshot.values, staged), documents.values)
      || !sameValue(mergeConfigDocuments(split.settings, split.auth), documents.values)) throw new Error('Migration would change settings.');
    publishAuth(staged, verifyBeforeTarget);
  }

  if (!entry(path.dirname(target))) {
    verifyBeforeTarget();
    if (input.workspace) assertUnlinkedPath(path.dirname(target));
    fs.mkdirSync(path.dirname(target), { mode: 0o700 });
    syncDirectory(path.dirname(path.dirname(target)));
  }
  const targetIdentity = publishExclusive(target, yamlText, settingsMode, () => {
    verifyBeforeTarget();
    verifyBackup();
  }, started);
  const verifyDestination = () => {
    verifySource(); verifyBackup(); verifyPublished(target, targetIdentity, yamlText, settingsMode);
    if (input.selected() !== target) throw new Error('The new YAML file is not the selected configuration.');
  };
  publishAuth(split.auth, verifyDestination);
  verifyDestination();
  if (!original.isSymbolicLink()) {
    fs.unlinkSync(source);
    syncDirectory(path.dirname(source));
  }
  return { file: target, status: 'complete' };
}

function publicationMode(snapshot: CapturedConfigSnapshot, values: Record<string, unknown>): number {
  const mode = snapshot.mode & 0o777;
  return holdsCredentialMaterial(values) ? mode & CREDENTIAL_FILE_MODE : mode;
}

function publishExclusive(file: string, text: string, mode: number, admit: () => void, started: () => void): fs.Stats {
  const originalDirectory = path.dirname(file);
  const directory = fs.realpathSync(originalDirectory);
  const identity = directoryIdentity(directory);
  const temporary = path.join(directory, `.${path.basename(file)}-${process.pid}-${randomUUID()}`);
  const check = () => {
    admit(); assertDirectoryIdentity(identity);
    if (fs.realpathSync(originalDirectory) !== directory || entry(file)) throw new Error('Migration destination changed.');
  };
  check();
  let staged: fs.Stats | undefined;
  try {
    const descriptor = fs.openSync(temporary, 'wx', 0o600);
    try {
      staged = fs.fstatSync(descriptor);
      fs.writeFileSync(descriptor, text, 'utf8');
      if (process.platform !== 'win32') fs.fchmodSync(descriptor, mode);
      fs.fsyncSync(descriptor);
    } finally { fs.closeSync(descriptor); }
    check();
    if (fileIdentity(fs.lstatSync(temporary)) !== fileIdentity(staged)) throw new Error('Migration stage identity changed.');
    started();
    fs.linkSync(temporary, file);
    syncDirectory(directory);
    verifyPublished(file, staged, text, mode);
    return staged;
  } finally {
    const current = entry(temporary);
    if (staged && current && fileIdentity(current) === fileIdentity(staged)) {
      fs.unlinkSync(temporary);
      syncDirectory(directory);
    }
  }
}

function syncDirectory(directory: string): void {
  if (process.platform === 'win32') return;
  const descriptor = fs.openSync(directory, fs.constants.O_RDONLY);
  try { fs.fsyncSync(descriptor); } finally { fs.closeSync(descriptor); }
}

function verifyPublished(file: string, identity: fs.Stats, text: string, mode: number): void {
  if (!identity.isFile()) throw new Error('Migration requires a regular file at the backup and destination paths.');
  const saved = inspectWorkspaceFile(fs.realpathSync(path.dirname(file)), path.basename(file), undefined, CONFIG_MAX_BYTES);
  if (saved.state !== 'exists' || saved.identity !== fileIdentity(identity) || saved.content !== text
    || process.platform !== 'win32' && (saved.mode & 0o777) !== mode) throw new Error('Migration file readback or permissions could not be verified.');
}

function sameIdentity(file: string, expected: fs.Stats): boolean {
  try {
    const current = fs.lstatSync(file);
    return fileIdentity(current) === fileIdentity(expected) && current.mode === expected.mode;
  } catch { return false; }
}

function entry(file: string): fs.Stats | undefined {
  try { return fs.lstatSync(file); }
  catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
}

function safeReason(error: unknown): string {
  return error instanceof Error ? error.message.replace(/[\x00-\x1f\x7f-\x9f]/g, ' ').slice(0, 512) : 'Configuration migration was refused.';
}
