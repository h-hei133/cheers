import fs from 'node:fs';
import path from 'node:path';
import { assertProfileIdentity, createProfileContext, type ProfileContext } from '../../core/paths/profile/context.js';
import { assertUnlinkedPath } from '../../core/paths/profile/identity.js';
import { profileName } from '../../core/paths/profile/name.js';

function explicitName(name: string): string {
  if (!name.trim()) throw new Error('A profile name is required.');
  return profileName(name);
}

/** Management never inherits mutable path overrides from the active profile. */
export function openProfile(name: string, homeDir: string): ProfileContext {
  return createProfileContext({ name: explicitName(name), homeDir, env: {}, mode: 'existing' });
}

export function createProfile(name: string, owner: ProfileContext): { readonly profile: ProfileContext; readonly created: boolean } {
  assertProfileIdentity(owner);
  const id = explicitName(name);
  const base = path.join(owner.homeDir, '.cheers');
  const target = id === 'default' ? base : path.join(base, 'profiles', id);
  assertUnlinkedPath(target);
  const existed = fs.existsSync(target);
  const profile = createProfileContext({ name: id, homeDir: owner.homeDir, env: {} });
  assertProfileIdentity(owner);
  return { profile, created: !existed };
}

/** Bounded inventory; malformed names and linked roots remain visible as unavailable. */
export function listProfiles(owner: ProfileContext): readonly { readonly name: string; readonly available: boolean }[] {
  assertProfileIdentity(owner);
  const directory = path.join(owner.homeDir, '.cheers', 'profiles');
  assertUnlinkedPath(directory);
  const names = new Set(['default']);
  if (fs.existsSync(directory)) {
    const handle = fs.opendirSync(directory);
    try {
      let entry: fs.Dirent | null;
      while ((entry = handle.readSync())) {
        if (names.size >= 1024) throw new Error('Profile inventory exceeds 1024 entries.');
        names.add(entry.name);
      }
    } finally { handle.closeSync(); }
  }
  const result = [...names].sort().map(name => {
    try { openProfile(name, owner.homeDir); return { name, available: true }; }
    catch { return { name, available: false }; }
  });
  assertProfileIdentity(owner);
  return result;
}
