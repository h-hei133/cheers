import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createProfileContext, withProfile } from '../../../core/paths/profile/context.js';
import { SshClient } from './client.js';
import type { SshTransport } from './transport.js';

let home: string;
beforeEach(() => { home = fs.mkdtempSync(path.join(os.tmpdir(), 'profile-ssh-')); });
afterEach(() => fs.rmSync(home, { recursive: true, force: true }));

it('separates remote journals with equal session, workspace and delegated SSH identities', async () => {
  const a = createProfileContext({ name: 'a', homeDir: home, env: {} });
  const b = createProfileContext({ name: 'b', homeDir: home, env: {} });
  const run = vi.fn(async () => ({ cleanup: 'complete', transport: { status: 'completed', exitCode: 0 },
    stdout: Buffer.from('CHEERS_SSH_1\nroot=L3JlbW90ZQ==\nidentity=1:2\nuid=1000\nboot=00000000-0000-0000-0000-000000000000\nmanager=systemd-user\ncgroup=v2\n') }));
  const transport = { profile: { identity: 'a'.repeat(64), fingerprint: 'SHA256:' + 'A'.repeat(43), selection: { workspace: '/remote' } }, run } as unknown as SshTransport;
  const first = withProfile(a, () => new SshClient(transport)); const second = withProfile(b, () => new SshClient(transport));
  const scope = { sessionId: 'same', workspaceRoot: '/same', createdAt: '2026-10-16' };
  const authority = { mode: 'approved-for-write', source: 'tool-runtime-approval', reason: 'synthetic SSH probe' } as const;
  const resultA = await first.connect(scope, authority); const resultB = await second.connect(scope, authority);
  expect(resultA.namespace).not.toBe(resultB.namespace);
  expect((await first.connect(scope, authority)).namespace).toBe(resultA.namespace);
  run.mockClear(); fs.renameSync(a.root, `${a.root}-retired`); fs.mkdirSync(a.root);
  await expect(first.connect(scope, authority)).rejects.toThrow('changed identity');
  expect(run).not.toHaveBeenCalled();
});
