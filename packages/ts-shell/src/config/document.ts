import fs from 'node:fs';
import { createHash } from 'node:crypto';
import { CONFIG_MAX_BYTES, ConfigDocumentError, parseConfigText } from './syntax.js';

/** Bounded handle reads also reject directories/devices; only ENOENT means absent. */
function fingerprint(stat: fs.BigIntStats): string {
  return `${stat.dev}:${stat.ino}:${stat.birthtimeNs}:${stat.size}:${stat.mtimeNs}:${stat.ctimeNs}`;
}

function readConfigText(filePath: string): { text: string; revision: string; fingerprint: string; bytes: number } | undefined {
  let fd: number | undefined;
  try {
    fd = fs.openSync(filePath, fs.constants.O_RDONLY | fs.constants.O_NONBLOCK);
    const before = fs.fstatSync(fd, { bigint: true });
    if (!before.isFile()) throw new ConfigDocumentError('unreadable');
    const bytes = Buffer.alloc(CONFIG_MAX_BYTES + 1);
    let used = 0;
    while (used < bytes.length) {
      const count = fs.readSync(fd, bytes, used, Math.min(16 * 1024, bytes.length - used), null);
      if (!count) break;
      used += count;
    }
    if (used > CONFIG_MAX_BYTES) throw new ConfigDocumentError('resource-limit');
    if (fingerprint(before) !== fingerprint(fs.fstatSync(fd, { bigint: true })) || fingerprint(before) !== fingerprint(fs.statSync(filePath, { bigint: true }))) throw new ConfigDocumentError('content-changed');
    const captured = bytes.subarray(0, used);
    try { return { text: new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(captured),
      revision: createHash('sha256').update(captured).digest('hex'), fingerprint: fingerprint(before), bytes: used }; }
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

export interface CapturedConfigSnapshot extends ConfigSnapshot {
  readonly revision: string;
  readonly fingerprint: string;
  readonly bytes: number;
}

export function readConfigSnapshot(filePath: string): CapturedConfigSnapshot | undefined {
  const captured = readConfigText(filePath);
  return captured === undefined ? undefined : { ...captured, values: parseConfigText(captured.text) };
}

/** Recheck the acquired object without decoding or resolving references again. */
export function configSnapshotMatches(filePath: string, snapshot: CapturedConfigSnapshot | undefined): boolean {
  try {
    const actual = readConfigText(filePath);
    return snapshot === undefined ? actual === undefined
      : actual?.fingerprint === snapshot.fingerprint && actual.revision === snapshot.revision;
  }
  catch { return false; }
}

export function readConfigDocument(filePath: string): Record<string, unknown> | undefined {
  return readConfigSnapshot(filePath)?.values;
}
