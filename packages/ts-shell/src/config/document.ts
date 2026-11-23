import fs from 'node:fs';
import { createHash } from 'node:crypto';
import { stringify } from 'yaml';
import { CONFIG_MAX_BYTES, ConfigDocumentError, configFormatForPath, inspectConfigDocument, parseConfigFileText } from './syntax.js';

/** Bounded handle reads also reject directories/devices; only ENOENT means absent. */
function fingerprint(stat: fs.BigIntStats): string {
  return `${stat.dev}:${stat.ino}:${stat.birthtimeNs}:${stat.size}:${stat.mtimeNs}:${stat.ctimeNs}`;
}

function readConfigText(filePath: string, maxBytes = CONFIG_MAX_BYTES): { text: string; revision: string; fingerprint: string; bytes: number; mode: number } | undefined {
  let fd: number | undefined;
  try {
    fd = fs.openSync(filePath, fs.constants.O_RDONLY | fs.constants.O_NONBLOCK);
    const before = fs.fstatSync(fd, { bigint: true });
    if (!before.isFile()) throw new ConfigDocumentError('unreadable');
    if (before.size > BigInt(maxBytes)) throw new ConfigDocumentError('resource-limit');
    const bytes = Buffer.alloc(Number(before.size) + 1);
    let used = 0;
    while (used < bytes.length) {
      const count = fs.readSync(fd, bytes, used, Math.min(16 * 1024, bytes.length - used), null);
      if (!count) break;
      used += count;
    }
    if (used > maxBytes) throw new ConfigDocumentError('resource-limit');
    if (used !== Number(before.size)) throw new ConfigDocumentError('content-changed');
    if (fingerprint(before) !== fingerprint(fs.fstatSync(fd, { bigint: true })) || fingerprint(before) !== fingerprint(fs.statSync(filePath, { bigint: true }))) throw new ConfigDocumentError('content-changed');
    const captured = bytes.subarray(0, used);
    try { return { text: new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(captured),
      revision: createHash('sha256').update(captured).digest('hex'), fingerprint: fingerprint(before), bytes: used, mode: Number(before.mode) }; }
    catch { throw new ConfigDocumentError('invalid-utf8'); }
  } catch (error) {
    if (fd === undefined && (error as NodeJS.ErrnoException).code === 'ENOENT') {
      try { fs.lstatSync(filePath); }
      catch (missing) { if ((missing as NodeJS.ErrnoException).code === 'ENOENT') return undefined; }
      throw new ConfigDocumentError('unreadable');
    }
    throw error instanceof ConfigDocumentError ? error : new ConfigDocumentError('unreadable');
  } finally {
    if (fd !== undefined) fs.closeSync(fd);
  }
}

/** Measure the very bytes the writer will publish, including formatting. */
export function serializeConfigDocument(value: unknown, format: 'jsonc' | 'yaml' = 'jsonc'): string {
  const text = format === 'yaml'
    ? stringify(value, { version: '1.2', schema: 'core', lineWidth: 0, sortMapEntries: false })
    : JSON.stringify(value, null, 2);
  if (Buffer.byteLength(text) > CONFIG_MAX_BYTES) throw new ConfigDocumentError('resource-limit');
  if (format === 'yaml') inspectConfigDocument(parseConfigFileText('config.yaml', text));
  return text;
}

export interface ConfigSnapshot {
  readonly text: string;
  readonly values: Record<string, unknown>;
  readonly format?: 'jsonc' | 'yaml';
}

export interface CapturedConfigSnapshot extends ConfigSnapshot {
  readonly revision: string;
  readonly fingerprint: string;
  readonly bytes: number;
  readonly mode: number;
}

export function readConfigSnapshot(filePath: string, options: {
  readonly allowDuplicateTopLevel?: readonly string[];
  readonly maxBytes?: number;
  readonly format?: 'jsonc' | 'yaml';
} = {}): CapturedConfigSnapshot | undefined {
  try {
    const captured = readConfigText(filePath, options.maxBytes);
    if (captured === undefined) return undefined;
    const format = options.format ?? configFormatForPath(filePath);
    const parserPath = format === 'yaml' ? 'config.yaml' : 'config.json';
    return { ...captured, values: parseConfigFileText(parserPath, captured.text, options), format };
  } catch (error) {
    if (error instanceof ConfigDocumentError) throw new ConfigDocumentError(error.code, error.position, filePath);
    throw error;
  }
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
