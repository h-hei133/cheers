import fs from 'node:fs';
import path from 'node:path';
import { assertCurrentProfile, currentProfile } from '../../core/paths/profile/context.js';
import { assertDirectoryIdentity, directoryIdentity } from '../../core/paths/profile/identity.js';
import { userHomeDir } from '../../core/paths/userHome.js';
import { CONFIG_INPUT_MAX_FILES, ConfigInputError, type ConfigInputFile, type ConfigInputs } from './model.js';

/** Explicit source permission belongs to the caller, never to JSON metadata. */
export function createConfigInputs(files: readonly { readonly path: string; readonly source: 'project' | 'user' }[], launchCwd: string): ConfigInputs {
  if (files.length > CONFIG_INPUT_MAX_FILES) throw new ConfigInputError('resource-limit');
  try {
    const base = directoryIdentity(fs.realpathSync(launchCwd));
    const selected = files.map((file, position): ConfigInputFile => {
      if (!file.path.trim() || !['project', 'user'].includes(file.source)) throw new ConfigInputError('invalid-selection');
      const absolute = path.resolve(base.path, file.path);
      let canonical: string;
      try { canonical = fs.realpathSync(absolute); }
      catch { throw new ConfigInputError('missing-or-unreadable', absolute); }
      return Object.freeze({ path: absolute, canonical, source: file.source, position,
        parent: directoryIdentity(fs.realpathSync(path.dirname(absolute))), targetParent: directoryIdentity(path.dirname(canonical)) });
    });
    const result = Object.freeze({ base, files: Object.freeze(selected), home: fs.realpathSync(userHomeDir()), profile: currentProfile() });
    assertConfigInputs(result);
    return result;
  } catch (error) { throw error instanceof ConfigInputError ? error : new ConfigInputError('identity-changed'); }
}

export function assertConfigInput(file: ConfigInputFile): void {
  try {
    assertDirectoryIdentity(file.parent); assertDirectoryIdentity(file.targetParent);
    if (fs.realpathSync(path.dirname(file.path)) !== file.parent.path || fs.realpathSync(file.path) !== file.canonical) throw new Error();
  } catch { throw new ConfigInputError('identity-changed', file.path); }
}

export function assertConfigInputs(inputs: ConfigInputs): void {
  try {
    assertDirectoryIdentity(inputs.base);
    const active = currentProfile();
    if (inputs.profile) assertCurrentProfile(inputs.profile);
    else if (active || fs.realpathSync(userHomeDir()) !== inputs.home) throw new Error();
    for (const file of inputs.files) assertConfigInput(file);
  } catch (error) { throw error instanceof ConfigInputError ? error : new ConfigInputError('identity-changed'); }
}
