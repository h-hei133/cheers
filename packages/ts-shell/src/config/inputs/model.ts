import type { DirectoryIdentity } from '../../core/paths/profile/identity.js';
import type { ProfileContext } from '../../core/paths/profile/context.js';

export const CONFIG_INPUT_MAX_FILES = 32;
export const CONFIG_INPUT_MAX_BYTES = 8 * 1024 * 1024;

export interface ConfigInputFile {
  readonly path: string;
  readonly canonical: string;
  readonly source: 'project' | 'user';
  readonly position: number;
  readonly parent: DirectoryIdentity;
  readonly targetParent: DirectoryIdentity;
}

export interface ConfigInputs {
  readonly base: DirectoryIdentity;
  readonly profile?: ProfileContext;
  readonly home: string;
  readonly files: readonly ConfigInputFile[];
}

/** Codes and selected paths only; parser/filesystem messages never cross this boundary. */
export class ConfigInputError extends Error {
  constructor(readonly code: string, readonly file?: string, readonly admissionBlocked = true) {
    const safe = file?.replace(/[\x00-\x1f\x7f-\x9f]/g, '?').slice(0, 512);
    super(`Explicit config input${safe ? ` at ${safe}` : ''}: ${code}; input rejected.`);
    this.name = 'ConfigInputError';
  }
}
