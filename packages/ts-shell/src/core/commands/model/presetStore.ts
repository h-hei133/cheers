import fs from 'node:fs';
import { resolveUserDataFile } from '../../paths/userHome.js';
import { profilePathOverride } from '../../paths/profile/context.js';
import { withFileLock, writeJsonFileAtomic } from '../../../session/store/sessionFileStore.js';
import { decodePresets } from '../../../session/model/state.js';
import type { SessionModelPreset } from '../../../session/model/contract.js';
import { sameValue } from '../../../config/values.js';
import { isRecord } from '../../values/record.js';

/**
 * The profile-owned model preset library.
 *
 * A session preset is a draft for one conversation; this file is the library the
 * same profile keeps across sessions. Names are owned whole: a session entry of
 * the same name hides the library entry instead of merging roles from both.
 */
export const PROFILE_PRESET_VERSION = 1;
export const PROFILE_PRESET_LIMIT = 32;

export class ProfilePresetError extends Error {}

export function profilePresetsPath(): string {
  return profilePathOverride('CHEERS_MODEL_PRESETS_FILE') || resolveUserDataFile('model-presets.json');
}

export function readProfilePresets(): Record<string, SessionModelPreset> {
  let raw: unknown;
  try { raw = JSON.parse(fs.readFileSync(profilePresetsPath(), 'utf8')); }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return {};
    throw new ProfilePresetError('Model preset library could not be read.');
  }
  if (!isRecord(raw) || raw.version !== PROFILE_PRESET_VERSION) throw new ProfilePresetError('Model preset library has an unsupported shape.');
  const decoded = decodePresets(raw.presets ?? {});
  if (!decoded) throw new ProfilePresetError('Model preset library contains an invalid preset.');
  return decoded;
}

function writeProfilePresets(presets: Readonly<Record<string, SessionModelPreset>>): void {
  const target = profilePresetsPath();
  writeJsonFileAtomic(target, { version: PROFILE_PRESET_VERSION, presets });
  if (!sameValue(readProfilePresets(), presets)) throw new ProfilePresetError('Model preset library write could not be verified.');
}

export function saveProfilePreset(name: string, preset: SessionModelPreset): 'saved' | 'replaced' {
  return withFileLock(`${profilePresetsPath()}.lock`, () => {
    const current = readProfilePresets();
    if (!Object.hasOwn(current, name) && Object.keys(current).length >= PROFILE_PRESET_LIMIT) {
      throw new ProfilePresetError(`Model preset library holds ${PROFILE_PRESET_LIMIT} names; delete one first.`);
    }
    const replaced = Object.hasOwn(current, name);
    writeProfilePresets({ ...current, [name]: preset });
    return replaced ? 'replaced' : 'saved';
  });
}

export function deleteProfilePreset(name: string): 'deleted' | 'not-found' {
  return withFileLock(`${profilePresetsPath()}.lock`, () => {
    const current = readProfilePresets();
    if (!Object.hasOwn(current, name)) return 'not-found';
    const next = { ...current };
    delete next[name];
    writeProfilePresets(next);
    return 'deleted';
  });
}
