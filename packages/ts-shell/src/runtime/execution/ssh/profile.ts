import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { isIP } from 'node:net';
import { pathIdentity, readTextFile } from '../../../core/workspace/files.js';
import { isRecord } from '../../../core/values/record.js';
import { freezeDeep } from '../../../core/values/freeze.js';
import { requireSsh, SshError, type SshProfile, type SshSelection } from './model.js';

function privateSource(file: string): string {
  const content = readTextFile(file, 64 * 1024); const stat = fs.lstatSync(file);
  requireSsh(content !== undefined && stat.isFile() && stat.uid === process.getuid?.() && (stat.mode & 0o077) === 0, 'denied');
  return content;
}
export function hostKeyAlgorithm(key: string): string {
  const parts = key.split(' '); requireSsh(parts.length === 2 && /^[A-Za-z0-9+/]+={0,2}$/.test(parts[1]!));
  const bytes = Buffer.from(parts[1]!, 'base64'); requireSsh(bytes.toString('base64') === parts[1] && bytes.length > 8 && bytes.length <= 16 * 1024);
  const length = bytes.readUInt32BE(0); requireSsh(length > 0 && length < bytes.length - 4 && bytes.subarray(4, 4 + length).toString('ascii') === parts[0]);
  requireSsh(['ssh-ed25519', 'ssh-rsa', 'ecdsa-sha2-nistp256', 'ecdsa-sha2-nistp384', 'ecdsa-sha2-nistp521'].includes(parts[0]!));
  return parts[0] === 'ssh-rsa' ? 'rsa-sha2-512,rsa-sha2-256' : parts[0]!;
}
function absolute(value: unknown): string {
  requireSsh(typeof value === 'string' && value.length <= 4096 && path.isAbsolute(value) && !/[\u0000-\u001f\u007f]/.test(value)); return value;
}
/** Read only explicit, private sources. No agent, SSH config or password fallback is consulted. */
export function readSshProfile(file: string, assertRead: (file: string) => void): SshProfile {
  try {
    requireSsh(process.platform === 'linux', 'unavailable'); file = absolute(file); assertRead(file);
    const source = privateSource(file); const fileBinding = pathIdentity(file); const value: unknown = JSON.parse(source);
    requireSsh(isRecord(value) && Object.keys(value).every(key => ['version', 'host', 'port', 'user', 'workspace', 'executable', 'hostKey', 'identityFile'].includes(key)));
    requireSsh(value.version === 1 && typeof value.host === 'string' && value.host.length <= 253
      && (isIP(value.host) || /^[a-zA-Z0-9](?:[a-zA-Z0-9.-]*[a-zA-Z0-9])?$/.test(value.host)));
    requireSsh(typeof value.user === 'string' && /^[a-zA-Z_][a-zA-Z0-9_.-]{0,63}$/.test(value.user));
    requireSsh(Number.isInteger(value.port) && Number(value.port) >= 1 && Number(value.port) <= 65535);
    const workspace = absolute(value.workspace); requireSsh(path.posix.normalize(workspace) === workspace);
    const executable = absolute(value.executable); const identityFile = absolute(value.identityFile); assertRead(identityFile);
    const key = privateSource(identityFile); const keyBinding = pathIdentity(identityFile);
    requireSsh(/-----BEGIN (?:(?:OPENSSH|RSA|EC) )?PRIVATE KEY-----/.test(key));
    requireSsh(typeof value.hostKey === 'string' && value.hostKey.length <= 24 * 1024); hostKeyAlgorithm(value.hostKey);
    const native = fs.statSync(executable); requireSsh(native.isFile() && native.size <= 32 * 1024 * 1024 && (native.mode & 0o111) !== 0 && (native.mode & 0o022) === 0, 'denied');
    const nativeBinding = pathIdentity(executable); const nativeHash = hash(fs.readFileSync(executable));
    const selection: SshSelection = freezeDeep({ version: 1, host: value.host, port: Number(value.port), user: value.user,
      workspace, executable, hostKey: value.hostKey });
    const check = () => {
      try {
        assertRead(file); assertRead(identityFile);
        requireSsh(pathIdentity(file) === fileBinding && privateSource(file) === source
          && pathIdentity(identityFile) === keyBinding && privateSource(identityFile) === key
          && pathIdentity(executable) === nativeBinding && hash(fs.readFileSync(executable)) === nativeHash, 'changed');
      } catch { throw new SshError('changed'); }
    };
    return Object.freeze({ selection, identity: hash(JSON.stringify([selection, fileBinding, keyBinding, hash(key), nativeBinding, nativeHash])),
      fingerprint: 'SHA256:' + createHash('sha256').update(Buffer.from(value.hostKey.split(' ')[1]!, 'base64')).digest('base64').replace(/=+$/, ''),
      check, keySnapshot: () => { check(); return key; } });
  } catch (error) { throw error instanceof SshError ? error : new SshError('unavailable'); }
}
function hash(value: string | Buffer): string { return createHash('sha256').update(value).digest('hex'); }
