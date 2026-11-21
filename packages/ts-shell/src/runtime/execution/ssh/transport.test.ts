import fs from 'node:fs';
import path from 'node:path';
import { generateKeyPairSync } from 'node:crypto';
import { createServer } from 'node:net';
import { afterEach, expect, it, vi } from 'vitest';
import { readSshProfile } from './profile.js';
import { sshArguments, knownHostLine } from './options.js';
import { SshTransport } from './transport.js';
import type { CommandExecutionRequest, CommandExecutionResult } from '../types.js';

const roots: string[] = [];
const authority = { mode: 'approved-for-write', source: 'tool-runtime-approval', reason: 'fixture' } as const;
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
it('pins a single native master and makes a lost channel incapable of opening a fallback connection', () => {
  const s = profile(); const args = sshArguments(s.selected.selection, 'master');
  expect(args).toContain('IdentityAgent=none'); expect(args).toContain('CertificateFile=none'); expect(args).toContain('PasswordAuthentication=no');
  expect(args).toContain('StrictHostKeyChecking=yes'); expect(args).toContain('ControlMaster=yes'); expect(args).toContain('ClearAllForwardings=yes');
  expect(args).toContain('UserKnownHostsFile=./known_hosts'); expect(args[args.indexOf('-i') + 1]).toBe('./identity');
  expect(args).toContain('-N'); expect(args[args.indexOf('-S') + 1]).toBe('./socket');
  const channel = sshArguments(s.selected.selection, 'channel');
  expect(channel).toContain('ControlMaster=no'); expect(channel).toContain('ProxyCommand=/bin/false');
  expect(channel).not.toContain('-i'); expect(channel).not.toContain('-N'); expect(channel[channel.indexOf('-S') + 1]).toBe('./socket');
  expect(knownHostLine(s.selected.selection)).toBe(`127.0.0.1 ${s.value.hostKey}\n`);
  expect(knownHostLine({ ...s.selected.selection, port: 24002 })).toBe(`[127.0.0.1]:24002 ${s.value.hostKey}\n`);
});

async function nativeMaster(input: CommandExecutionRequest, unexpectedlyLost?: Promise<void>): Promise<CommandExecutionResult> {
  expect(fs.readFileSync(path.join(input.cwd, input.args[input.args.indexOf('-i') + 1]!), 'utf8')).toContain('SYNTHETIC');
  expect(fs.statSync(input.env!.HOME!).mode & 0o777).toBe(0o700);
  const socket = path.join(input.cwd, 'socket');
  const server = createServer();
  const stopped = new Promise<void>(resolve => input.abortSignal!.addEventListener('abort', () => resolve(), { once: true }));
  await Promise.resolve();
  await new Promise<void>((resolve, reject) => { server.once('error', reject); server.listen(socket, () => { fs.chmodSync(socket, 0o600); resolve(); }); });
  await (unexpectedlyLost ? Promise.race([stopped, unexpectedlyLost]) : stopped);
  await new Promise<void>(resolve => server.close(() => resolve()));
  return { status: 'cancelled', exitCode: null, stdout: '', stderr: '', receipt: {} } as CommandExecutionResult;
}

it('bounds transport bytes, keeps cancellation distinct from remote outcome and erases credential work files', async () => {
  const s = profile(); fs.chmodSync(s.root, 0o755); let request!: CommandExecutionRequest;
  const native = vi.fn(async (input: CommandExecutionRequest) => {
    if (input.args.includes('-N')) return nativeMaster(input);
    request = input; expect(input.captureOutput).toBe(false); expect(input.env).not.toHaveProperty('SSH_AUTH_SOCK');
    expect(fs.existsSync(path.join(input.cwd, 'identity'))).toBe(false);
    expect(fs.statSync(input.env!.HOME!).mode & 0o777).toBe(0o700);
    input.onStdout!(Buffer.alloc(256 * 1024)); input.onStderr!(Buffer.alloc(129 * 1024)); expect(input.abortSignal!.aborted).toBe(true);
    return { status: 'cancelled', exitCode: null, stdout: '', stderr: '', receipt: { outputSummary: 'SYNTHETIC_SECRET' } } as CommandExecutionResult;
  });
  const owner = new SshTransport({ runCommand: native }, s.selected, s.root, s.root);
  await owner.open(authority);
  try {
  const result = await owner.run('printf exact\n', authority);
  expect(result.outputLimited).toBe(true); expect(result.stdout.length).toBe(256 * 1024); expect(result.transport.status).toBe('cancelled');
  expect(result.transport).not.toHaveProperty('remoteOutcome'); expect(result.transport.receipt.outputSummary).not.toContain('SECRET');
  expect(result.cleanup).toBe('complete'); expect(owner.connected).toBe(true);
  expect(request.reason).not.toContain('SYNTHETIC');
  } finally { await owner.close(); }
  expect(fs.readdirSync(s.root).filter(name => name.startsWith('ssh-'))).toEqual([]);
});

it.each([false, true])('joins local invocation cleanup after permanent close (unverified=%s)', async unverified => {
  const s = profile();
  let entered!: () => void; const started = new Promise<void>(resolve => { entered = resolve; });
  let release!: () => void; const held = new Promise<void>(resolve => { release = resolve; });
  let request!: CommandExecutionRequest;
  const runCommand = vi.fn(async (input: CommandExecutionRequest) => {
    if (input.args.includes('-N')) return nativeMaster(input);
    request = input; entered(); await held;
    return { status: 'cancelled', exitCode: null, stdout: '', stderr: '', receipt: {}, ...(unverified ? { terminationFailed: true } : {}) } as CommandExecutionResult;
  });
  const owner = new SshTransport({ runCommand }, s.selected, s.root, s.root);
  await owner.open(authority);
  const running = owner.run('printf HELD\n', authority); await started;
  const closing = owner.close();
  try {
    expect(owner.close()).toBe(closing);
    expect(request.abortSignal?.aborted).toBe(true);
    expect(fs.existsSync(request.env!.HOME!)).toBe(true);
    await expect(owner.run('printf REFUSED\n', authority)).rejects.toMatchObject({ code: 'unavailable' });
    expect(runCommand).toHaveBeenCalledTimes(2);
    release();
    expect((await running).cleanup).toBe(unverified ? 'unknown' : 'complete');
    if (unverified) await expect(closing).rejects.toMatchObject({ code: 'cleanup' });
    else await expect(closing).resolves.toBeUndefined();
    expect(fs.existsSync(request.env!.HOME!)).toBe(false);
  } finally { release(); await Promise.allSettled([running, closing]); }
});

it('reuses one master for simultaneous channels, aborts only the selected channel, and never reconnects on loss', async () => {
  const s = profile();
  const channels: CommandExecutionRequest[] = [];
  let lose!: () => void;
  const lost = new Promise<void>(resolve => { lose = resolve; });
  let release!: () => void;
  const completed = new Promise<void>(resolve => { release = resolve; });
  const runCommand = vi.fn(async (input: CommandExecutionRequest) => {
    if (input.args.includes('-N')) return nativeMaster(input, lost);
    channels.push(input);
    const stopped = new Promise<void>(resolve => input.abortSignal!.addEventListener('abort', () => resolve(), { once: true }));
    await Promise.race([completed, stopped]);
    return { status: input.abortSignal!.aborted ? 'cancelled' : 'completed', exitCode: 0, stdout: '', stderr: '', receipt: {} } as CommandExecutionResult;
  });
  const owner = new SshTransport({ runCommand }, s.selected, s.root, s.root);
  const first = new AbortController();
  await owner.open(authority);
  try {
    const one = owner.run('printf FIRST\n', authority, first.signal);
    const two = owner.run('printf SECOND\n', authority);
    expect(channels).toHaveLength(2);
    expect(channels[0]!.cwd).toBe(channels[1]!.cwd);
    await expect(owner.run('printf THIRD\n', authority)).rejects.toMatchObject({ code: 'unavailable' });
    first.abort();
    expect((await one).transport.status).toBe('cancelled');
    expect(channels[1]!.abortSignal!.aborted).toBe(false);
    expect(owner.connected).toBe(true);
    release();
    expect((await two).transport.status).toBe('completed');
    lose();
    await vi.waitFor(() => expect(owner.connected).toBe(false));
    await expect(owner.run('printf REFUSED\n', authority)).rejects.toMatchObject({ code: 'unavailable' });
    expect(runCommand).toHaveBeenCalledTimes(3);
  } finally { release(); await owner.close(); }
});
