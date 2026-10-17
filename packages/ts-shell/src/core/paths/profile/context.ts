import { AsyncLocalStorage } from 'node:async_hooks';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { profileName } from './name.js';
import { assertDirectoryIdentity, assertUnlinkedPath, directoryIdentity, isWithin, type DirectoryIdentity } from './identity.js';

const PATH_VARIABLES = ['CHEERS_PLUGINS_FILE', 'CHEERS_EXTENSIONS_FILE', 'CHEERS_MARKETPLACES_FILE', 'CHEERS_MODEL_PRESETS_FILE', 'CHEERS_LOG_DIR',
  'CHEERS_BROWSER_RECEIPT_CACHE_ROOT', 'CHEERS_BROWSER_RECEIPT_CACHE_MANIFEST', 'CHEERS_STREAM_TRACE_PATH'] as const;
export type ProfilePathVariable = typeof PATH_VARIABLES[number];

export interface ProfileIdentity {
  readonly id: string;
  readonly root: string;
  readonly rootIdentity: string;
  readonly directories: readonly DirectoryIdentity[];
}

export interface ProfileContext extends ProfileIdentity {
  readonly homeDir: string;
  readonly pathOverrides: Readonly<Partial<Record<ProfilePathVariable, string>>>;
}

const contexts = new AsyncLocalStorage<ProfileContext>();
let processProfile: ProfileContext | undefined;

/** Capture once at launch. Named profiles never consult the default or legacy roots. */
export function createProfileContext(input: { readonly name?: string; readonly homeDir?: string; readonly env?: NodeJS.ProcessEnv; readonly mode?: 'existing' } = {}): ProfileContext {
  const env = input.env ?? process.env;
  const id = profileName(input.name ?? env.CHEERS_PROFILE);
  const homeDir = fs.realpathSync(path.resolve(input.homeDir ?? (env.USERPROFILE || env.HOME || os.homedir())));
  const base = path.join(homeDir, '.cheers');
  const selected = id === 'default' ? base : path.join(base, 'profiles', id);
  if (id !== 'default' || input.mode === 'existing') assertUnlinkedPath(selected);
  if (input.mode !== 'existing') fs.mkdirSync(selected, { recursive: true, mode: 0o700 });
  if (id !== 'default' || input.mode === 'existing') assertUnlinkedPath(selected);
  const root = fs.realpathSync(selected);
  const directories = id === 'default' ? [directoryIdentity(root)]
    : [base, path.dirname(selected), selected].map(directoryIdentity);
  const pathOverrides: Partial<Record<ProfilePathVariable, string>> = {};
  for (const key of PATH_VARIABLES) {
    const value = env[key]?.trim();
    if (!value) continue;
    const target = path.resolve(value);
    if (id !== 'default') {
      // A manifest is an explicit read-only input; its mutable cache root is checked separately.
      if (key !== 'CHEERS_BROWSER_RECEIPT_CACHE_MANIFEST' && !isWithin(root, target)) throw new Error(`${key} must stay inside the selected profile.`);
      assertUnlinkedPath(target);
    }
    pathOverrides[key] = target;
  }
  return Object.freeze({ id, homeDir, root, rootIdentity: directoryIdentity(root).identity,
    directories: Object.freeze(directories), pathOverrides: Object.freeze(pathOverrides) });
}

export function currentProfile(): ProfileContext | undefined {
  return contexts.getStore() ?? processProfile;
}

export function assertProfileIdentity(profile: ProfileIdentity): void {
  for (const directory of profile.directories) assertDirectoryIdentity(directory);
  if (profile.id !== 'default') assertUnlinkedPath(profile.root);
}

export function assertCurrentProfile(profile: ProfileContext): void {
  assertProfileIdentity(profile);
  const active = currentProfile();
  if (!active || active.root !== profile.root || active.rootIdentity !== profile.rootIdentity) {
    throw new Error('Profile identity changed; start an operation in its owning profile.');
  }
}

/** Process event emitters also use this immutable identity outside an async scope. */
export function installProcessProfile(profile: ProfileContext): void {
  assertProfileIdentity(profile);
  if (processProfile && processProfile !== profile) throw new Error('A process profile is immutable; switching profiles requires a new process.');
  processProfile = profile;
}

export function withProfile<T>(profile: ProfileContext, operation: () => T): T {
  if (processProfile && processProfile !== profile) throw new Error('A process profile is immutable; switching profiles requires a new process.');
  assertProfileIdentity(profile);
  return contexts.run(profile, operation);
}

export function profilePath(relative: string, profile: ProfileIdentity): string {
  const target = path.resolve(profile.root, relative);
  if (!isWithin(profile.root, target)) throw new Error('Profile state path escapes its owner.');
  assertProfileStorage(target, profile);
  return target;
}

/** Recheck captured paths at their storage owner before each effect. */
export function assertProfileStorage(target: string, profile: ProfileIdentity | undefined = currentProfile()): void {
  if (!profile) return;
  assertProfileIdentity(profile);
  if (profile.id === 'default') return;
  if (!isWithin(profile.root, target)) throw new Error('Profile state path escapes its owner.');
  assertUnlinkedPath(target);
}

/** Non-secret durable binding; default receipts preserve their existing format. */
export function captureProfileIdentity(): ProfileIdentity | undefined {
  const profile = currentProfile();
  if (!profile || profile.id === 'default') return undefined;
  return Object.freeze({ id: profile.id, root: profile.root, rootIdentity: profile.rootIdentity, directories: profile.directories });
}

/** Capture path overrides with the launch identity, never from a later environment. */
export function profilePathOverride(key: ProfilePathVariable): string | undefined {
  const profile = currentProfile();
  if (!profile) return process.env[key]?.trim() || undefined;
  assertProfileIdentity(profile);
  const target = profile.pathOverrides[key];
  if (target && profile.id !== 'default') assertUnlinkedPath(target);
  return target;
}
