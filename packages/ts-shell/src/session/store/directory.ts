import fs from 'node:fs';
import { pathIdentity } from '../../core/workspace/files.js';

export function syncStoreDirectory(directory: string, expectedIdentity: string): void {
  if (pathIdentity(directory) !== expectedIdentity) throw new Error('The saved publication directory changed.');
  if (process.platform === 'win32') return;
  const fd = fs.openSync(directory, fs.constants.O_RDONLY | (fs.constants.O_DIRECTORY ?? 0) | (fs.constants.O_NOFOLLOW ?? 0));
  try {
    const opened = fs.fstatSync(fd);
    const current = fs.lstatSync(directory);
    if (!opened.isDirectory() || current.dev !== opened.dev || current.ino !== opened.ino
      || pathIdentity(directory) !== expectedIdentity) throw new Error('The saved publication directory changed.');
    fs.fsyncSync(fd);
  } finally { fs.closeSync(fd); }
}
