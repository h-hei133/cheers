import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { assertDirectoryIdentity, directoryIdentity } from '../../core/paths/profile/identity.js';
import { fileIdentity, inspectWorkspaceFile } from '../../core/workspace/files.js';
import type { CapturedConfigSnapshot } from '../document.js';
import { CREDENTIAL_FILE_MODE, holdsCredentialMaterial } from '../secret.js';
import { CONFIG_MAX_BYTES } from '../syntax.js';

export function publicationMode(snapshot: CapturedConfigSnapshot, values: Record<string, unknown>): number {
  const mode = snapshot.mode & 0o777;
  return holdsCredentialMaterial(values) ? mode & CREDENTIAL_FILE_MODE : mode;
}

export function publishExclusive(file: string, text: string, mode: number, admit: () => void,
  started: () => void): fs.Stats {
  const originalDirectory = path.dirname(file);
  const directory = fs.realpathSync(originalDirectory);
  const identity = directoryIdentity(directory);
  const temporary = path.join(directory, `.${path.basename(file)}-${process.pid}-${randomUUID()}`);
  const check = () => {
    admit();
    assertDirectoryIdentity(identity);
    if (fs.realpathSync(originalDirectory) !== directory || entry(file)) throw new Error('Migration destination changed.');
  };
  check();
  let staged: fs.Stats | undefined;
  try {
    const descriptor = fs.openSync(temporary, 'wx', 0o600);
    try {
      staged = fs.fstatSync(descriptor);
      fs.writeFileSync(descriptor, text, 'utf8');
      if (process.platform !== 'win32') fs.fchmodSync(descriptor, mode);
      fs.fsyncSync(descriptor);
    } finally { fs.closeSync(descriptor); }
    check();
    if (fileIdentity(fs.lstatSync(temporary)) !== fileIdentity(staged)) throw new Error('Migration stage identity changed.');
    started();
    fs.linkSync(temporary, file);
    syncDirectory(directory);
    verifyPublished(file, staged, text, mode);
    return staged;
  } finally {
    const current = entry(temporary);
    if (staged && current && fileIdentity(current) === fileIdentity(staged)) {
      fs.unlinkSync(temporary);
      syncDirectory(directory);
    }
  }
}

export function syncDirectory(directory: string): void {
  if (process.platform === 'win32') return;
  const descriptor = fs.openSync(directory, fs.constants.O_RDONLY);
  try { fs.fsyncSync(descriptor); } finally { fs.closeSync(descriptor); }
}

export function verifyPublished(file: string, identity: fs.Stats, text: string, mode: number): void {
  if (!identity.isFile()) throw new Error('Migration requires a regular file at the backup and destination paths.');
  const saved = inspectWorkspaceFile(fs.realpathSync(path.dirname(file)), path.basename(file), undefined, CONFIG_MAX_BYTES);
  if (saved.state !== 'exists' || saved.identity !== fileIdentity(identity) || saved.content !== text
    || process.platform !== 'win32' && (saved.mode & 0o777) !== mode) {
    throw new Error('Migration file readback or permissions could not be verified.');
  }
}

export function sameIdentity(file: string, expected: fs.Stats): boolean {
  try {
    const current = fs.lstatSync(file);
    return fileIdentity(current) === fileIdentity(expected) && current.mode === expected.mode;
  } catch { return false; }
}

export function entry(file: string): fs.Stats | undefined {
  try { return fs.lstatSync(file); }
  catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
}

export function safeReason(error: unknown): string {
  return error instanceof Error ? error.message.replace(/[\x00-\x1f\x7f-\x9f]/g, ' ').slice(0, 512)
    : 'Configuration migration was refused.';
}
