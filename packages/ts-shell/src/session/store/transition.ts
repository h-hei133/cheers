import fs from 'node:fs';
import { descriptorPath, fileIdentity, pathIdentity } from '../../core/workspace/files.js';
import { readReport, REPORT_BYTES } from '../../core/commands/report/codec.js';
import { decodeTranscriptLine } from '../sessionEventCodec.js';
import { readTranscriptPrefixDigest } from '../transcript/source.js';
import type { SessionFileLayout } from './sessionFileLayout.js';
import { withSessionStateLock } from './sessionStateStore.js';
import { fileVersion } from './version.js';
import { readSessionMetadataRecord } from './sessionStore.js';
import { projectSessionMetadata } from '../schema/sessionMetadataCodec.js';
import type { Session } from '../schema/sessionRecord.js';
import { sameValue } from '../../config/values.js';

const REPORT_SUFFIX_BYTES = 16 * REPORT_BYTES;

/** Startup can append observations; saved state, identity and earlier history stay pinned. */
export function captureSessionTransition(layout: SessionFileLayout): (activated: Session) => (readback: () => void) => void {
  const path = pathIdentity(layout.sessionDir), directory = fileIdentity(fs.lstatSync(layout.sessionDir));
  const state = version(layout.statePath);
  const prefix = transcript(layout.transcriptPath);
  const checkSource = () => {
    if (pathIdentity(layout.sessionDir) !== path || fileIdentity(fs.lstatSync(layout.sessionDir)) !== directory
      || version(layout.statePath) !== state) throw new Error('The saved session substrate changed during replacement.');
  };
  return activated => {
    checkSource();
    if (transcript(layout.transcriptPath, prefix).version !== prefix.version) throw new Error('The prepared transcript changed during activation.');
    const metadata = version(layout.metadataPath), stored = readSessionMetadataRecord(layout.metadataPath);
    const expected = Object.fromEntries(Object.entries(projectSessionMetadata(activated)).filter(([, value]) => value !== undefined));
    if (!stored || metadata !== version(layout.metadataPath) || !sameValue(stored, expected)) throw new Error('The saved metadata does not match this activation.');
    return readback => withSessionStateLock(layout, () => {
      const check = () => { checkSource(); if (version(layout.metadataPath) !== metadata) throw new Error('The saved metadata changed during replacement.'); };
      check();
      const before = transcript(layout.transcriptPath, prefix);
      readback();
      check();
      if (before.version !== version(layout.transcriptPath)) throw new Error('The saved transcript changed during replacement readback.');
    }, { requireExisting: true });
  };
}

function version(target: string): string {
  const stat = fs.lstatSync(target);
  if (!stat.isFile()) throw new Error('The saved session file is unavailable.');
  return JSON.stringify(fileVersion(stat));
}

function transcript(target: string, prefix?: { readonly identity: string; readonly bytes: number; readonly digest: string }): {
  readonly identity: string; readonly bytes: number; readonly digest: string; readonly version: string;
} {
  const fd = fs.openSync(target, fs.constants.O_RDONLY | (fs.constants.O_NOFOLLOW ?? 0) | (fs.constants.O_NONBLOCK ?? 0));
  try {
    const stat = fs.fstatSync(fd), identity = fileIdentity(stat), bytes = prefix?.bytes ?? stat.size;
    if (!stat.isFile() || fileIdentity(fs.lstatSync(target)) !== identity || descriptorPath(fd, target) !== target
      || (prefix && (prefix.identity !== identity || stat.size < bytes))) throw new Error('The saved transcript identity changed during replacement.');
    const digest = readTranscriptPrefixDigest(fd, bytes);
    if (prefix && digest !== prefix.digest) throw new Error('The saved transcript prefix changed during replacement.');
    if (prefix && stat.size > bytes) reports(fd, bytes, stat.size - bytes);
    const final = JSON.stringify(fileVersion(fs.fstatSync(fd)));
    if (final !== JSON.stringify(fileVersion(stat)) || final !== version(target)) throw new Error('The saved transcript changed during acquisition.');
    return { identity, bytes, digest, version: final };
  } finally { fs.closeSync(fd); }
}

function reports(fd: number, offset: number, length: number): void {
  if (length > REPORT_SUFFIX_BYTES) throw new Error('Startup observations exceed the replacement readback limit.');
  const suffix = Buffer.alloc(length);
  let read = 0;
  while (read < length) {
    const count = fs.readSync(fd, suffix, read, length - read, offset + read);
    if (!count) throw new Error('Startup observation readback is incomplete.');
    read += count;
  }
  const text = suffix.toString('utf8');
  if (!Buffer.from(text, 'utf8').equals(suffix) || !text.endsWith('\n')) throw new Error('Startup observations are unreadable.');
  for (const line of text.slice(0, -1).split('\n')) {
    const event = decodeTranscriptLine(line);
    if (event.type !== 'command-output' || !readReport(event.report)) throw new Error('The saved conversation changed during startup.');
  }
}
