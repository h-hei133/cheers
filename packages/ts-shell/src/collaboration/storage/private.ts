import fs from 'node:fs';
import { readTextFile } from '../../core/workspace/files.js';
import { requireValue } from '@cheers/collaboration';
export function privateText(target: string, maxBytes = 64 * 1024): string {
  const source = readTextFile(target, maxBytes);
  requireValue(source !== undefined && (fs.statSync(target).mode & 0o077) === 0, 'denied'); return source;
}
