import { expect, it } from 'vitest';
import { localPage } from './projection.js';
import { pageDisplay } from '../ssh/projection.js';
import { SshClient } from '../../runtime/execution/ssh/client.js';
import type { SshTransport } from '../../runtime/execution/ssh/transport.js';
import type { SshJobSpec } from '../../runtime/execution/ssh/model.js';
import type { LocalJob } from '../../workflow/jobs/model.js';

const spec: SshJobSpec = { id: '00000000-0000-0000-0000-000000000000', command: 'fixture', digest: 'a'.repeat(64),
  binding: { profileIdentity: 'b'.repeat(64), fingerprint: 'SHA256:' + 'c'.repeat(43), root: '/workspace',
    directoryIdentity: '1:2', uid: 1000, bootId: 'd'.repeat(36), namespace: 'e'.repeat(32) } };
const authority = { mode: 'read-only', source: 'tool-runtime-approval', reason: 'fixture' } as const;
function clientFor(snapshot: () => { bytes: Buffer; dropped: '0' | 'unknown' }, cursor: () => number): SshClient {
  return new SshClient({ profile: { identity: spec.binding.profileIdentity, check() {} },
    run: async () => {
      const { bytes, dropped } = snapshot(); const offset = cursor();
      return { outputLimited: false, cleanup: 'complete', transport: { status: 'completed', exitCode: 0 },
        stdout: Buffer.from(['CHEERS_SSH_1', `id=${spec.id}`, 'stream=stdout', `offset=${offset}`,
          `next=${Math.min(bytes.length, offset + 16384)}`, `size=${bytes.length}`, `dropped=${dropped}`, `context=${bytes.toString('base64')}`, ''].join('\n')) };
    } } as unknown as SshTransport);
}

it.each(['中', '🙂'])('preserves %s across actual local and SSH byte page cursors', async character => {
  const original = 'x'.repeat(16383) + character + 'tail'; const bytes = Buffer.from(original);
  const job = { stdout: bytes.toString('base64'), truncated: false, output: 'complete' } as LocalJob;
  let offset = 0; let local = '';
  while (offset < bytes.length) {
    const page = localPage(job, 'stdout', offset); const next = Number(/next byte (\d+)/.exec(page)![1]);
    expect(next).toBeGreaterThan(offset); expect(next - offset).toBeLessThanOrEqual(16384);
    local += page.slice(page.indexOf('\n') + 1); offset = next;
  }
  expect(local).toBe(original);
  expect(() => localPage(job, 'stdout', 16384)).toThrow('splits a UTF-8 character');

  offset = 0;
  const client = clientFor(() => ({ bytes, dropped: '0' }), () => offset);
  let remote = ''; const chunks: Buffer[] = [];
  while (offset < bytes.length) {
    const page = await client.output(spec, 'stdout', offset, authority);
    expect(page.nextOffset).toBeGreaterThan(offset); expect(page.nextOffset - offset).toBe(page.bytes.length);
    remote += pageDisplay(page); chunks.push(page.bytes); offset = page.nextOffset;
  }
  expect(Buffer.concat(chunks)).toEqual(bytes); expect(remote).toBe(original);
});

it.each(['中', '🙂'])('keeps the SSH cursor before a growing %s sequence and flushes a proven final tail', async character => {
  const prefix = Buffer.from('x'.repeat(16383)); const encoded = Buffer.from(character);
  let bytes = Buffer.concat([prefix, encoded.subarray(0, 1)]); let offset = 0; let dropped: '0' | 'unknown' = 'unknown';
  const client = clientFor(() => ({ bytes, dropped }), () => offset);
  const first = await client.output(spec, 'stdout', offset, authority);
  expect(first.nextOffset).toBe(16383); expect(pageDisplay(first)).toBe(prefix.toString());
  offset = first.nextOffset;
  for (let index = 1; index < encoded.length; index++) {
    const pending = await client.output(spec, 'stdout', offset, authority);
    expect(pending.nextOffset).toBe(offset); expect(pageDisplay(pending)).not.toContain('�');
    bytes = Buffer.concat([bytes, encoded.subarray(index, index + 1)]);
  }
  const complete = await client.output(spec, 'stdout', offset, authority);
  expect(pageDisplay(complete)).toBe(character); expect(complete.nextOffset).toBe(bytes.length);
  offset = complete.nextOffset; bytes = Buffer.concat([bytes, encoded.subarray(0, 1)]); dropped = '0';
  const terminal = await client.output(spec, 'stdout', offset, authority);
  expect(terminal.nextOffset).toBe(bytes.length); expect(pageDisplay(terminal)).toBe('�');
});

it('allows malformed bytes without mistaking them for an interior valid UTF-8 cursor', async () => {
  const bytes = Buffer.from([0x80, 0x41]);
  const local = localPage({ stdout: bytes.toString('base64'), truncated: false, output: 'complete' } as LocalJob, 'stdout', 0);
  expect(local.slice(local.indexOf('\n') + 1)).toBe('�A');
  const remote = await clientFor(() => ({ bytes, dropped: '0' }), () => 0).output(spec, 'stdout', 0, authority);
  expect(remote.nextOffset).toBe(2); expect(pageDisplay(remote)).toBe('�A');
});

it('allows the terminal cursor after an incomplete sequence and keeps one replacement across a malformed prefix', async () => {
  for (const bytes of [Buffer.from([0xe4, 0xb8]), Buffer.concat([Buffer.from('x'.repeat(16383)), Buffer.from([0xe4, 0xb8, 0x41])])]) {
    const job = { stdout: bytes.toString('base64'), truncated: false, output: 'complete' } as LocalJob;
    let offset = 0; let local = ''; let remote = '';
    const client = clientFor(() => ({ bytes, dropped: '0' }), () => offset);
    while (offset < bytes.length) {
      const page = localPage(job, 'stdout', offset);
      const next = Number(/next byte (\d+)/.exec(page)![1]);
      local += page.slice(page.indexOf('\n') + 1);
      const ssh = await client.output(spec, 'stdout', offset, authority);
      expect(ssh.nextOffset).toBe(next); remote += pageDisplay(ssh); offset = next;
    }
    expect(local).toBe(bytes.toString('utf8')); expect(remote).toBe(local);
    expect(localPage(job, 'stdout', offset)).toContain(`next byte ${offset}/${bytes.length}`);
    const terminal = await client.output(spec, 'stdout', offset, authority);
    expect(terminal.nextOffset).toBe(offset); expect(terminal.bytes).toHaveLength(0);
    expect(localPage({ ...job, output: 'pending' }, 'stdout', offset)).toContain(`next byte ${offset}/${bytes.length}`);
    const live = await clientFor(() => ({ bytes, dropped: 'unknown' }), () => offset).output(spec, 'stdout', offset, authority);
    expect(live.nextOffset).toBe(offset); expect(live.bytes).toHaveLength(0);
  }
});
