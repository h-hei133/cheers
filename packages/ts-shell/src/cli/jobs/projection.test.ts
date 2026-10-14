import { expect, it } from 'vitest';
import { localPage } from './projection.js';
import { pageDisplay } from '../ssh/projection.js';
import { SshClient } from '../../runtime/execution/ssh/client.js';
import type { SshTransport } from '../../runtime/execution/ssh/transport.js';
import type { SshJobSpec } from '../../runtime/execution/ssh/model.js';
import type { LocalJob } from '../../workflow/jobs/model.js';

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

  const spec: SshJobSpec = { id: '00000000-0000-0000-0000-000000000000', command: 'fixture', digest: 'a'.repeat(64),
    binding: { profileIdentity: 'b'.repeat(64), fingerprint: 'SHA256:' + 'c'.repeat(43), root: '/workspace',
      directoryIdentity: '1:2', uid: 1000, bootId: 'd'.repeat(36), namespace: 'e'.repeat(32) } };
  offset = 0;
  const client = new SshClient({ profile: { identity: spec.binding.profileIdentity, check() {} },
    run: async () => ({ outputLimited: false, cleanup: 'complete', transport: { status: 'completed', exitCode: 0 },
      stdout: Buffer.from(['CHEERS_SSH_1', `id=${spec.id}`, 'stream=stdout', `offset=${offset}`,
        `next=${Math.min(bytes.length, offset + 16384)}`, `size=${bytes.length}`, 'dropped=0', `context=${bytes.toString('base64')}`, ''].join('\n')) }) } as unknown as SshTransport);
  let remote = ''; const chunks: Buffer[] = [];
  while (offset < bytes.length) {
    const page = await client.output(spec, 'stdout', offset, { mode: 'read-only', source: 'tool-runtime-approval', reason: 'fixture' });
    expect(page.nextOffset).toBeGreaterThan(offset); expect(page.nextOffset - offset).toBe(page.bytes.length);
    remote += pageDisplay(page); chunks.push(page.bytes); offset = page.nextOffset;
  }
  expect(Buffer.concat(chunks)).toEqual(bytes); expect(remote).toBe(original);
});
