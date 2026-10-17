import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { vi } from 'vitest';
import { HookDispatcher } from '../core/hooks/hookDispatcher.js';
import type { ToolGateOptions } from '../turn/tools.js';
import type { GitStore, GitWorkflowState } from '../workflow/git/operation/store.js';
import { GitWorkbench } from '../workflow/git/service.js';
const TMP = fileURLToPath(new URL('../../../../.tmp/', import.meta.url));
export function gitEnvironment(home: string): NodeJS.ProcessEnv {
  return { HOME: home, USERPROFILE: home, XDG_CONFIG_HOME: path.join(home, '.config'),
    GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_SYSTEM: path.join(home, '.gitconfig-system'), GIT_CONFIG_GLOBAL: path.join(home, '.gitconfig'),
    GIT_DIR: undefined, GIT_WORK_TREE: undefined };
}
export function stubGitEnvironment(home: string): void {
  for (const [key, value] of Object.entries(gitEnvironment(home))) {
    vi.stubEnv(key, value ?? '');
    // This Vitest version restores stubs but does not support deleting via stubEnv.
    if (value === undefined) delete process.env[key];
  }
}
export function gitFixture(unborn = false) {
  fs.mkdirSync(TMP, { recursive: true }); const base = fs.mkdtempSync(path.join(TMP, 'git-test-'));
  const root = path.join(base, 'source'); fs.mkdirSync(root); const home = path.join(base, 'home'); fs.mkdirSync(home);
  const env = { ...process.env, ...gitEnvironment(home), GIT_CEILING_DIRECTORIES: base };
  const git = (args: string[], cwd = root) => execFileSync('git', args, { cwd, env, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] });
  git(['init', '-q', '-b', 'main']); git(['config', 'user.name', 'Synthetic']); git(['config', 'user.email', 'synthetic@example.invalid']);
  if (!unborn) { fs.writeFileSync(path.join(root, 'a.txt'), Array.from({ length: 80 }, (_, index) => `line ${index + 1}`).join('\n') + '\n'); git(['add', '--', 'a.txt']); git(['commit', '-qm', 'initial']); }
  return { base, root, home, env, git, cleanup: () => fs.rmSync(base, { recursive: true, force: true }) };
}
export function gitGate(root: string, decision: 'allow-once' | 'deny' = 'allow-once', extra: Partial<ToolGateOptions> = {}): ToolGateOptions {
  return { sessionId: 'synthetic-git-session', workspaceRoot: root, permissionScope: 'ask', hooks: new HookDispatcher(), emit: () => {},
    escalationPromptHandler: async prompt => ({ promptId: prompt.id, decision, respondedAt: Date.now() }), ...extra };
}
export function memoryGitStore(): GitStore {
  let state: GitWorkflowState = { version: 1, operations: [], worktrees: [] };
  return { read: () => state, write: update => { state = update(state); } };
}
export function gitCommandContext(root: string) {
  const workbench = new GitWorkbench({ store: memoryGitStore(), busy: () => false, currentRoot: () => root, armCommit: () => 'synthetic-armed-commit',
    binding: { migrate: () => ({ changed: false, note: 'not used' }), owns: () => false, remember: () => {} }, execute: async () => { throw new Error('Read-only command fixture cannot write.'); } });
  return { cwd: root, gitCommand: workbench.command.bind(workbench), commitCommand: (args: string[]) => workbench.commit(args.join(' ')) };
}
