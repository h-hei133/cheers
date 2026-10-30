import { describe, expect, it, vi } from 'vitest';
import { GitCommitIntent } from './intent.js';
import { memoryGitStore } from '../../../test-utils/git.js';
import { NativeGit } from '../read/native.js';
import type { GitSnapshot } from '../read/model.js';
import type { SessionMessage } from '../../../session/schema/sessionMessage.js';

const snapshot: GitSnapshot = { executionIdentity: 'synthetic-git', root: '/workspace', gitDir: '/workspace/.git',
  commonDir: '/workspace/.git', head: 'original-head', branch: 'main', files: [], branches: ['main'], fingerprint: 'original-snapshot' };

function fixture() {
  let state: { id: string; cwd: string; prompt?: SessionMessage } = { id: 'original-session', cwd: '/workspace' };
  const current = vi.fn(() => state), store = memoryGitStore(), runCommand = vi.fn();
  const intent = new GitCommitIntent(store, current), git = new NativeGit('/workspace', { runCommand });
  return { intent, git, current, store, runCommand, set: (next: typeof state) => { state = next; } };
}

describe('commit intent tool discovery', () => {
  it('does not acquire a session for repeated unarmed tool discovery', () => {
    const { intent, git, current, runCommand } = fixture();
    current.mockImplementation(() => { throw new Error('Session history must not be loaded.'); });
    for (let index = 0; index < 20; index++) expect(intent.tools(git)).toEqual([]);
    expect(current).not.toHaveBeenCalled(); expect(runCommand).not.toHaveBeenCalled();
  });

  it.each(['session', 'cwd', 'missing prompt', 'role', 'source', 'intent'] as const)(
    'still acquires the authoritative prompt and rejects a changed %s when armed', change => {
      const { intent, git, current, set, runCommand } = fixture();
      const id = intent.arm(snapshot, 'original-index'); current.mockClear();
      const prompt: SessionMessage = { role: 'user', content: '/commit', metadata: { source: 'git-commit', gitCommitId: id } };
      set({ id: change === 'session' ? 'other-session' : 'original-session', cwd: change === 'cwd' ? '/other' : '/workspace',
        prompt: change === 'missing prompt' ? undefined : { ...prompt,
          role: change === 'role' ? 'assistant' : 'user',
          metadata: { source: change === 'source' ? 'ordinary-input' : 'git-commit',
            gitCommitId: change === 'intent' ? 'other-intent' : id } } });
      expect(intent.tools(git)).toEqual([]);
      expect(current).toHaveBeenCalledOnce(); expect(runCommand).not.toHaveBeenCalled();
    });

  it('exposes only the exact armed commit and returns to lazy discovery after refusal', () => {
    const { intent, git, current, set, runCommand, store } = fixture();
    const id = intent.arm(snapshot, 'original-index');
    set({ id: 'original-session', cwd: '/workspace', prompt: {
      role: 'user', content: '/commit', metadata: { source: 'git-commit', gitCommitId: id } } });
    current.mockClear();
    const tools = intent.tools(git); expect(tools.map(tool => tool.name)).toEqual(['git_commit']);
    expect(tools[0]!.argsSchema).toMatchObject({ properties: { commitId: { const: id } } });
    expect(current).toHaveBeenCalledOnce();
    tools[0]!.onRefusal!({}, { workspaceRoot: '/workspace', taskId: 'refused' }, 'denied');
    expect(store.read().operations.at(-1)?.result.status).toBe('denied');
    current.mockClear(); current.mockImplementation(() => { throw new Error('Refused intent must not read history.'); });
    expect(intent.tools(git)).toEqual([]); expect(current).not.toHaveBeenCalled();
    expect(runCommand).not.toHaveBeenCalled();
  });
});
