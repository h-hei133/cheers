import { afterEach, expect, it, vi } from 'vitest';
import { parseResearchArgs } from './syntax.js';
import { routeSlashCommand } from '../slashRouter.js';

afterEach(() => vi.restoreAllMocks());
it('routes exclusive deep research aliases to the native owner and keeps web collection separate', async () => {
  const handler = vi.fn(async () => ({ kind: 'local' as const, output: 'Native bound research' }));
  for (const command of ['deep-research', 'research', 'deep']) {
    expect(await routeSlashCommand(`/${command} --mode paper --depth deep question`, { cwd: process.cwd(), researchCommand: handler }))
      .toMatchObject({ kind: 'local', output: 'Native bound research' });
  }
  expect(handler).toHaveBeenCalledTimes(3);
  const parsed = parseResearchArgs(['--mode', 'paper', '--depth', 'deep', '--brief', 'brief.md', '--save', 'question']);
  expect(parsed.ok).toBe(true); if (parsed.ok) { expect(parsed.action.name).toBe(''); expect(parsed.flags.get('save')).toBe(true); }
  expect(parseResearchArgs(['--depth', 'unbounded', 'question']).ok).toBe(false);
  expect(parseResearchArgs(['reconcile', 'discard']).ok).toBe(true);
});
