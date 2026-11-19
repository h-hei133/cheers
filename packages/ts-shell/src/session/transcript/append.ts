import fs from 'node:fs';
import { descriptorPath, fileIdentity } from '../../core/workspace/files.js';
import { fileVersion } from '../store/version.js';
import { readTranscriptPrefixDigest } from './source.js';

export interface TranscriptAppendSource {
  readonly identity: string;
  readonly bytes: number;
  readonly sha256: string;
  readonly separator: boolean;
}

export function captureTranscriptAppend(path: string): TranscriptAppendSource {
  return withTranscript(path, false, (fd, stat) => {
    const last = Buffer.alloc(1);
    if (stat.size && fs.readSync(fd, last, 0, 1, stat.size - 1) !== 1) throw new Error('The saved transcript is unavailable.');
    const sha256 = readTranscriptPrefixDigest(fd, stat.size);
    assertStable(path, fd, stat);
    return { identity: fileIdentity(stat), bytes: stat.size, sha256, separator: stat.size > 0 && last[0] !== 10 };
  });
}

/** Continue only the proven byte prefix of one reserved append, including torn UTF-8. */
export function reconcileTranscriptAppend(path: string, source: TranscriptAppendSource, rows: string, commit = true): boolean {
  const append = Buffer.from(`${source.separator ? '\n' : ''}${rows}`, 'utf8');
  return withTranscript(path, commit, (fd, stat) => {
    const present = stat.size - source.bytes;
    if (fileIdentity(stat) !== source.identity || present < 0 || present > append.length
      || readTranscriptPrefixDigest(fd, source.bytes) !== source.sha256 || !matches(fd, source.bytes, append.subarray(0, present))) {
      throw new Error('The saved transcript append cannot be reconciled.');
    }
    assertStable(path, fd, stat);
    if (!commit) return present === append.length;
    if (present < append.length) fs.appendFileSync(fd, append.subarray(present));
    fs.fsyncSync(fd);
    const after = fs.fstatSync(fd);
    if (after.size !== source.bytes + append.length || !matches(fd, source.bytes, append)) throw new Error('The saved transcript append could not be verified.');
    assertStable(path, fd, after);
    return true;
  });
}

function withTranscript<T>(path: string, write: boolean, operation: (fd: number, stat: fs.Stats) => T): T {
  const flags = write ? fs.constants.O_RDWR | fs.constants.O_APPEND : fs.constants.O_RDONLY;
  const fd = fs.openSync(path, flags | (fs.constants.O_NOFOLLOW ?? 0) | (fs.constants.O_NONBLOCK ?? 0));
  try {
    const stat = fs.fstatSync(fd);
    if (!stat.isFile() || !fs.lstatSync(path).isFile() || descriptorPath(fd, path) !== path) throw new Error('The saved transcript is unavailable.');
    return operation(fd, stat);
  } finally { fs.closeSync(fd); }
}

function matches(fd: number, offset: number, expected: Buffer): boolean {
  const actual = Buffer.alloc(Math.min(expected.length, 64 * 1024));
  for (let start = 0; start < expected.length;) {
    const read = fs.readSync(fd, actual, 0, Math.min(actual.length, expected.length - start), offset + start);
    if (read === 0 || !actual.subarray(0, read).equals(expected.subarray(start, start + read))) return false;
    start += read;
  }
  return true;
}

function assertStable(path: string, fd: number, expected: fs.Stats): void {
  const current = fs.lstatSync(path);
  const observed = fs.fstatSync(fd);
  const version = fileVersion(expected).join(':');
  if (!current.isFile() || fileVersion(current).join(':') !== version || fileVersion(observed).join(':') !== version) {
    throw new Error('The saved transcript changed during publication.');
  }
}
