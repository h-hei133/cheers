import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { afterEach, expect, it } from 'vitest';
import type { SshWorkspace } from '../model.js';
import { fileFields, remoteFile, remoteFileInfo, remoteFilePage, statFields, validateFileCursor, validateRemotePath } from './file.js';
import { parseRemoteFrame } from './protocol.js';

const directories: string[] = [];
const generation = 'fixture-generation';
afterEach(() => { for (const directory of directories.splice(0)) fs.rmSync(directory, { force: true, recursive: true }); });

function workspace(): SshWorkspace {
  const parent = fileURLToPath(new URL('../../../../../../../.tmp/', import.meta.url));
  fs.mkdirSync(parent, { recursive: true });
  const root = fs.realpathSync(fs.mkdtempSync(path.join(parent, 'ssh-file-')));
  directories.push(root);
  const { dev, ino } = fs.statSync(root, { bigint: true });
  return { root, directoryIdentity: `${dev}:${ino}`, uid: process.getuid!(), profileIdentity: 'a'.repeat(64),
    fingerprint: 'SHA256:' + 'A'.repeat(43), namespace: 'b'.repeat(32),
    bootId: fs.readFileSync('/proc/sys/kernel/random/boot_id', 'utf8').trim() };
}

function native(binding: SshWorkspace, relative: string, read: boolean) {
  return spawnSync('/usr/bin/bash', ['--noprofile', '--norc', '-s'], { input: remoteFile(binding, relative, read), timeout: 2_000 });
}

it.each(['', '/root', '../outside', 'dir/../file', 'dir//file', 'line\nbreak', '.cheers-jobs-private/item'])('rejects unbound remote path %j', value => {
  expect(() => validateRemotePath(value)).toThrow();
});

it('reads a literal path and binds each UTF-8 page to the original file snapshot', () => {
  const binding = workspace();
  const relative = "report $'draft'.txt";
  const text = 'a'.repeat(16_383) + '\u03b1' + 'last line';
  fs.writeFileSync(path.join(binding.root, relative), text);
  const stat = native(binding, relative, false);
  expect(stat.status).toBe(0);
  expect(remoteFileInfo(parseRemoteFrame(stat.stdout, statFields), relative).size).toBe(Buffer.byteLength(text));
  const source = native(binding, relative, true);
  expect(source.status).toBe(0);
  const frame = parseRemoteFrame(source.stdout, fileFields);
  const first = remoteFilePage(frame, generation, binding, relative, 0);
  expect(first.nextOffset).toBe(16_383);
  expect(() => validateFileCursor(first.nextOffset)).toThrow();
  expect(() => remoteFilePage(frame, generation, binding, relative, first.nextOffset + 1, first.version)).toThrow();
  expect(() => remoteFilePage(frame, 'new-generation', binding, relative, first.nextOffset, first.version)).toThrow(/changed/);
  const second = remoteFilePage(frame, generation, binding, relative, first.nextOffset, first.version);
  expect(Buffer.concat([first.bytes, second.bytes]).toString()).toBe(text);
  fs.writeFileSync(path.join(binding.root, relative), text.replace('last line', 'new bytes'));
  const changed = parseRemoteFrame(native(binding, relative, true).stdout, fileFields);
  expect(() => remoteFilePage(changed, generation, binding, relative, first.nextOffset, first.version)).toThrow(/changed/);
});

it('refuses links, special or oversized reads and replaced workspace identities', () => {
  const binding = workspace();
  fs.writeFileSync(path.join(binding.root, 'ordinary'), Buffer.alloc(65_537));
  fs.symlinkSync('ordinary', path.join(binding.root, 'alias'));
  fs.symlinkSync('.', path.join(binding.root, 'parent'));
  fs.mkdirSync(path.join(binding.root, 'nested'));
  fs.writeFileSync(path.join(binding.root, 'nested', 'entry' + '\n'), 'different file');
  fs.symlinkSync('entry' + '\n', path.join(binding.root, 'nested', 'entry'));
  expect(spawnSync('/usr/bin/mkfifo', [path.join(binding.root, 'fifo')]).status).toBe(0);
  expect(native(binding, 'alias', false).status).not.toBe(0);
  expect(native(binding, 'parent/ordinary', false).status).not.toBe(0);
  expect(native(binding, 'nested/entry', true).status).not.toBe(0);
  expect(native(binding, 'fifo', true).status).toBe(1);
  expect(native(binding, 'ordinary', true).status).not.toBe(0);
  expect(native(binding, 'ordinary', false).status).toBe(0);
  expect(native({ ...binding, directoryIdentity: '0:0' }, 'ordinary', false).status).not.toBe(0);
});
