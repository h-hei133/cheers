import fs from 'node:fs';
import { CONFIG_MAX_BYTES, ConfigDocumentError, parseConfigText } from './syntax.js';

/** Bounded handle reads also reject directories/devices; only ENOENT means absent. */
function readConfigText(filePath: string): string | undefined {
  let fd: number | undefined;
  try {
    fd = fs.openSync(filePath, fs.constants.O_RDONLY | fs.constants.O_NONBLOCK);
    if (!fs.fstatSync(fd).isFile()) throw new ConfigDocumentError('unreadable');
    const bytes = Buffer.alloc(CONFIG_MAX_BYTES + 1);
    let used = 0;
    while (used < bytes.length) {
      const count = fs.readSync(fd, bytes, used, Math.min(16 * 1024, bytes.length - used), null);
      if (!count) break;
      used += count;
    }
    if (used > CONFIG_MAX_BYTES) throw new ConfigDocumentError('resource-limit');
    try { return new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes.subarray(0, used)); }
    catch { throw new ConfigDocumentError('invalid-utf8'); }
  } catch (error) {
    if (fd === undefined && (error as NodeJS.ErrnoException).code === 'ENOENT') return undefined;
    throw error instanceof ConfigDocumentError ? error : new ConfigDocumentError('unreadable');
  } finally {
    if (fd !== undefined) fs.closeSync(fd);
  }
}

/** Measure the very bytes the writer will publish, including formatting. */
export function serializeConfigDocument(value: unknown): string {
  const text = JSON.stringify(value, null, 2);
  if (Buffer.byteLength(text) > CONFIG_MAX_BYTES) throw new ConfigDocumentError('resource-limit');
  return text;
}

export interface ConfigSnapshot {
  readonly text: string;
  readonly values: Record<string, unknown>;
}

export function readConfigSnapshot(filePath: string): ConfigSnapshot | undefined {
  const text = readConfigText(filePath);
  return text === undefined ? undefined : { text, values: parseConfigText(text) };
}

export function readConfigDocument(filePath: string): Record<string, unknown> | undefined {
  return readConfigSnapshot(filePath)?.values;
}
