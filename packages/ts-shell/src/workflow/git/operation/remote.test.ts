import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { gitFixture, gitGate, memoryGitStore } from '../../../test-utils/git.js';
import { NativeGit } from '../read/native.js';
import { readGitSnapshot } from '../read/snapshot.js';
import { createDefaultExecutionService } from '../../../runtime/execution/service.js';
import { preparePush, prepareRemoteReconciliation } from './remote.js';
import { runNativeGit } from './gate.js';

describe('remote Git unknown result reconciliation', () => {
  let fixture: ReturnType<typeof gitFixture>;
  beforeEach(() => { fixture = gitFixture(); for (const key of ['HOME', 'USERPROFILE', 'XDG_CONFIG_HOME', 'GIT_CEILING_DIRECTORIES', 'GIT_CONFIG_NOSYSTEM', 'GIT_CONFIG_GLOBAL']) vi.stubEnv(key, fixture.env[key as keyof typeof fixture.env]!); });
  afterEach(() => { vi.unstubAllEnvs(); fixture.cleanup(); });
  it('binds exact remote URL/ref, retains a lost push reply, queries before any fresh write and never retries', async () => {
    const remote = path.join(fixture.base, 'remote.git'); fixture.git(['init', '--bare', '-q', remote]); fixture.git(['remote', 'add', 'origin', remote]);
    const execution = createDefaultExecutionService(); let pushes = 0;
    const git = new NativeGit(fixture.root, { runCommand: async request => {
      const result = await execution.runCommand(request);
      if (request.args.includes('push')) { pushes++; return { ...result, status: 'timeout', exitCode: null }; }
      return result;
    } });
    const store = memoryGitStore(); const state = await readGitSnapshot(git); const plan = await preparePush(git, state, 'origin', 'refs/heads/topic', store);
    const result = await runNativeGit(git, plan, gitGate(fixture.root), () => {});
    expect(result.status).toBe('unknown'); expect(pushes).toBe(1); expect(store.read().operations[0]?.result.status).toBe('unknown');
    expect(fixture.git(['rev-parse', 'refs/heads/topic'], remote).trim()).toBe(state.head);
    await expect(preparePush(git, await readGitSnapshot(git), 'origin', 'refs/heads/topic', store)).rejects.toThrow('earlier remote write is unknown');
    const reconcile = prepareRemoteReconciliation(git, await readGitSnapshot(git), plan.id, store);
    expect((await runNativeGit(git, reconcile, gitGate(fixture.root), () => {})).status).toBe('succeeded'); expect(pushes).toBe(1); expect(store.read().operations[0]?.result.status).toBe('succeeded');
  });
  it('refuses changed configured remote after approval and secret-bearing remote URLs before any query', async () => {
    const remote = path.join(fixture.base, 'remote.git'); fixture.git(['init', '--bare', '-q', remote]); fixture.git(['remote', 'add', 'origin', remote]);
    const git = new NativeGit(fixture.root); const store = memoryGitStore(); const plan = await preparePush(git, await readGitSnapshot(git), 'origin', 'refs/heads/topic', store);
    const result = await runNativeGit(git, plan, gitGate(fixture.root, 'allow-once', { escalationPromptHandler: async prompt => {
      fixture.git(['remote', 'set-url', 'origin', path.join(fixture.base, 'other.git')]); return { promptId: prompt.id, decision: 'allow-once', respondedAt: Date.now() };
    } }), () => {});
    expect(result.status).toBe('blocked'); expect(result.note).toContain('GIT_STATE_CHANGED'); expect(store.read().operations).toHaveLength(0);
    fixture.git(['remote', 'set-url', 'origin', 'https://person:synthetic-password@example.invalid/repo']);
    await expect(preparePush(git, await readGitSnapshot(git), 'origin', 'refs/heads/topic', store)).rejects.toThrow('no embedded credentials');
  });
});
