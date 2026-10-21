import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import * as todos from '../../core/commands/todoCommandRuntime.js';
import { AgentRegistryScanner } from '../../core/messaging/agentRegistryScanner.js';
import type { BackgroundRunner } from '../../workflow/jobs/local/model.js';
import { renderHints } from '../../presentation/tui/chrome/hints.js';
import { stripAnsi } from '../../presentation/tui/text/ansi.js';
import { readAmbientFacts } from './ambientFacts.js';

beforeEach(() => {
  vi.spyOn(todos, 'getSessionTodos').mockReturnValue([]);
  vi.spyOn(AgentRegistryScanner.prototype, 'scanAllReachableAgents').mockReturnValue([]);
});
afterEach(() => vi.restoreAllMocks());

it('keeps unavailable task storage report-safe, then rereads the source after recovery', () => {
  const list = vi.fn().mockImplementationOnce(() => { throw new Error('PRIVATE_TASK_STORAGE'); })
    .mockReturnValue([{ state: 'running' }, { state: 'starting' }, { state: 'completed' }, { state: 'unknown' }]);
  const runner = { list } as unknown as BackgroundRunner;
  const facts = readAmbientFacts('session', runner);
  expect(facts.runningCommands).toBe('unavailable');
  const frame = stripAnsi(renderHints({ busy: false, suggesting: false, cancelArmed: false, queued: 0 }, facts, 80).join('\n'));
  expect(frame).toBe('task status unavailable');
  expect(frame).not.toContain('PRIVATE_TASK_STORAGE');
  expect(readAmbientFacts('session', runner).runningCommands).toBe(2);
  expect(list).toHaveBeenCalledTimes(2);
});

it('reports a known zero only when no runner is configured or a read succeeds with no live tasks', () => {
  expect(readAmbientFacts('session').runningCommands).toBe(0);
  expect(readAmbientFacts('session', { list: () => [] } as unknown as BackgroundRunner).runningCommands).toBe(0);
});
