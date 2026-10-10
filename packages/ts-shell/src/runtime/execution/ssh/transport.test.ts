import fs from 'node:fs';
import path from 'node:path';
import { generateKeyPairSync } from 'node:crypto';
import { afterEach, expect, it, vi } from 'vitest';
import { readSshProfile } from './profile.js';
import { sshArguments, knownHostLine } from './options.js';
import { SshTransport } from './transport.js';
import type { CommandExecutionRequest, CommandExecutionResult } from '../types.js';

const roots: string[] = [];
afterEach(() => { for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true }); });
function profile() {
  const parent = path.resolve('.tmp'); fs.mkdirSync(parent, { recursive: true }); const root = fs.mkdtempSync(path.join(parent, 'ssh-transport-'));
  roots.push(root); fs.chmodSync(root, 0o700);
  const identityFile = path.join(root, 'key'); fs.writeFileSync(identityFile, '-----BEGIN OPENSSH PRIVATE KEY-----\nSYNTHETIC\n-----END OPENSSH PRIVATE KEY-----\n', { mode: 0o600 });
  const publicKey = generateKeyPairSync('ed25519').publicKey.export({ format: 'der', type: 'spki' }).subarray(-32);
  const algorithm = Buffer.from('ssh-ed25519'); const key = Buffer.alloc(4 + algorithm.length + 4 + publicKey.length);
  key.writeUInt32BE(algorithm.length); algorithm.copy(key, 4); key.writeUInt32BE(publicKey.length, 4 + algorithm.length); publicKey.copy(key, 8 + algorithm.length);
  const file = path.join(root, 'profile'); const value = { version: 1, host: '127.0.0.1', user: 'fixture', port: 22,
    workspace: '/remote workspace', executable: '/usr/bin/ssh', hostKey: 'ssh-ed25519 ' + key.toString('base64'), identityFile };
  fs.writeFileSync(file, JSON.stringify(value), { mode: 0o600 }); return { root, file, value, identityFile, selected: readSshProfile(file, () => {}) };
}
it('binds exact private profile/key sources and rejects option and host-database injection', () => {
  const s = profile(); fs.writeFileSync(s.identityFile, 'changed'); expect(s.selected.check).toThrow(/changed/);
  for (const changed of [{ host: '-oProxyCommand=touch' }, { user: '-o' }, { hostKey: s.value.hostKey + '\n@cert-authority * bad' }]) {
    fs.writeFileSync(s.file, JSON.stringify({ ...s.value, ...changed })); expect(() => readSshProfile(s.file, () => {})).toThrow();
  }
});
it('suppresses ambient authority and escapes native percent/space paths without changing literal remote data', () => {
  const s = profile(); const args = sshArguments(s.selected.selection, '/private %h/key', '/private %h/known hosts');
  expect(args).toContain('IdentityAgent=none'); expect(args).toContain('CertificateFile=none'); expect(args).toContain('PasswordAuthentication=no');
  expect(args).toContain('StrictHostKeyChecking=yes'); expect(args).toContain('ControlMaster=no'); expect(args).toContain('ClearAllForwardings=yes');
  expect(args).toContain('UserKnownHostsFile="/private %%h/known hosts"'); expect(args[args.indexOf('-i') + 1]).toBe('/private %%h/key');
  expect(knownHostLine(s.selected.selection)).toBe(`127.0.0.1 ${s.value.hostKey}\n`);
  expect(knownHostLine({ ...s.selected.selection, port: 24002 })).toBe(`[127.0.0.1]:24002 ${s.value.hostKey}\n`);
});
it('bounds transport bytes, keeps cancellation distinct from remote outcome and erases credential work files', async () => {
  const s = profile(); fs.chmodSync(s.root, 0o755); let request!: CommandExecutionRequest;
  const native = vi.fn(async (input: CommandExecutionRequest) => {
    request = input; expect(input.captureOutput).toBe(false); expect(input.env).not.toHaveProperty('SSH_AUTH_SOCK');
    expect(fs.readFileSync(input.args[input.args.indexOf('-i') + 1]!, 'utf8')).toContain('SYNTHETIC');
    expect(fs.statSync(input.env!.HOME!).mode & 0o777).toBe(0o700);
    input.onStdout!(Buffer.alloc(256 * 1024)); input.onStderr!(Buffer.alloc(129 * 1024)); expect(input.abortSignal!.aborted).toBe(true);
    return { status: 'cancelled', exitCode: null, stdout: '', stderr: '', receipt: { outputSummary: 'SYNTHETIC_SECRET' } } as CommandExecutionResult;
  });
  const owner = new SshTransport({ runCommand: native }, s.selected, s.root, s.root);
  const result = await owner.run('printf exact\n', { mode: 'approved-for-write', source: 'tool-runtime-approval', reason: 'fixture' });
  expect(result.outputLimited).toBe(true); expect(result.stdout.length).toBe(256 * 1024); expect(result.transport.status).toBe('cancelled');
  expect(result.transport).not.toHaveProperty('remoteOutcome'); expect(result.transport.receipt.outputSummary).not.toContain('SECRET');
  expect(result.cleanup).toBe('complete'); expect(fs.readdirSync(s.root).filter(name => name.startsWith('ssh-'))).toEqual([]);
  expect(request.reason).not.toContain('SYNTHETIC');
});
