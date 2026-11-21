import fs from 'node:fs';
import path from 'node:path';
import { fileIdentity, pathIdentity, readTextFile } from '../../../core/workspace/files.js';
import { requireSsh, type SshProfile } from './model.js';
import { knownHostLine } from './options.js';

/** Local credentials and the short relative socket live under the original private session directory. */
export class SshDirectory {
  readonly path: string;
  private readonly identity: string;

  constructor(parent: string) {
    const binding = pathIdentity(parent);
    const stat = fs.lstatSync(parent);
    requireSsh(stat.isDirectory() && stat.uid === process.getuid?.() && (stat.mode & 0o022) === 0, 'denied');
    this.path = fs.mkdtempSync(path.join(parent, 'ssh-'));
    this.identity = pathIdentity(this.path);
    requireSsh(pathIdentity(parent) === binding, 'changed');
    this.check();
  }

  stage(profile: SshProfile): void {
    this.check();
    const key = path.join(this.path, 'identity');
    const known = path.join(this.path, 'known_hosts');
    const keyContent = profile.keySnapshot();
    const knownContent = knownHostLine(profile.selection);
    fs.writeFileSync(key, keyContent, { mode: 0o600, flag: 'wx' });
    fs.writeFileSync(known, knownContent, { mode: 0o600, flag: 'wx' });
    this.check();
    requireSsh(readTextFile(key, 64 * 1024) === keyContent && readTextFile(known, 24 * 1024) === knownContent, 'changed');
  }

  forgetCredentials(): void {
    this.check();
    fs.unlinkSync(path.join(this.path, 'identity'));
    fs.unlinkSync(path.join(this.path, 'known_hosts'));
  }

  socketIdentity(): string | undefined {
    this.check();
    const socket = fs.lstatSync(path.join(this.path, 'socket'), { throwIfNoEntry: false });
    if (!socket) return undefined;
    requireSsh(socket.isSocket() && socket.uid === process.getuid?.() && (socket.mode & 0o077) === 0, 'changed');
    return fileIdentity(socket);
  }

  remove(): void {
    this.check();
    fs.rmSync(this.path, { recursive: true });
  }

  private check(): void {
    const stat = fs.lstatSync(this.path);
    requireSsh(stat.isDirectory() && stat.uid === process.getuid?.() && (stat.mode & 0o777) === 0o700
      && pathIdentity(this.path) === this.identity, 'changed');
  }
}
