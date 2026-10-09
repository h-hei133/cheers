import { spawnSync } from 'node:child_process';
/** Fixed synchronous bootstrap discovery; never a general command/write path. */
export function inspectGitDiscovery(args: readonly string[], cwd: string): { ok: boolean; stdout: string } {
  if (!['rev-parse', 'symbolic-ref', 'status', 'config'].includes(args[0] ?? '')) throw new Error('Unsupported bootstrap Git discovery.');
  const options = ['--no-pager', '--no-optional-locks', '-c', 'core.fsmonitor=false', '-c', 'core.untrackedCache=false'];
  if (args[0] === 'status') {
    const helpers = spawnSync('git', [...options, 'config', '--get-regexp', '^filter\\..*\\.(clean|smudge|process)$'], { cwd, encoding: 'utf8', shell: false, timeout: 10000, maxBuffer: 1024 * 1024 });
    if (helpers.error || ![0, 1].includes(helpers.status ?? -1) || helpers.stdout?.split('\n').some(line => /^filter\.\S+\s+\S/.test(line))) return { ok: false, stdout: '' };
  }
  const result = spawnSync('git', [...options, ...args], { cwd, encoding: 'utf8', shell: false, timeout: 10000, maxBuffer: 8 * 1024 * 1024,
    env: { ...process.env, GIT_PAGER: 'cat', GIT_OPTIONAL_LOCKS: '0', GIT_TERMINAL_PROMPT: '0' } });
  return { ok: !result.error && result.status === 0, stdout: result.stdout || '' };
}
