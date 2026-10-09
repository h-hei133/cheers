import { createHash } from 'node:crypto';
import { pathIdentity, readTextFile } from '../workspace/files.js';
import { DEFINITION_BYTES } from './definition.js';

export { pathIdentity } from '../workspace/files.js';
export function readAgentFile(target: string): string | undefined {
  return readTextFile(target, DEFINITION_BYTES);
}
export function definitionIdentity(target: string, raw: string): string {
  return createHash('sha256').update(pathIdentity(target)).update('\0').update(raw).digest('hex');
}
