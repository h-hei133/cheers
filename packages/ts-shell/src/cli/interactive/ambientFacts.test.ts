import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import * as todos from '../../core/commands/todoCommandRuntime.js';
import { AgentRegistryScanner } from '../../core/messaging/agentRegistryScanner.js';
import type { BackgroundRunner } from '../../workflow/jobs/local/model.js';
import { renderHints } from '../../presentation/tui/chrome/hints.js';
import { stripAnsi } from '../../presentation/tui/text/ansi.js';
import { readAmbientFacts, readPeerSessionCount } from './ambientFacts.js';

it('keeps hidden peer reads session-bound without renewing an expired scan', () => {
  const now = vi.spyOn(Date, 'now').mockReturnValue(1000);
  const scan = vi.mocked(AgentRegistryScanner.prototype.scanAllReachableAgents);
  expect(readPeerSessionCount('cache-only-origin', { refresh: false })).toBeUndefined();
  expect(scan).not.toHaveBeenCalled();
  expect(readPeerSessionCount('cache-only-origin')).toBe(0);
  expect(scan).toHaveBeenCalledTimes(1);
  now.mockReturnValue(4000);
  expect(readPeerSessionCount('cache-only-origin', { refresh: false })).toBe(0);
  expect(readPeerSessionCount('different-session', { refresh: false })).toBeUndefined();
  expect(scan).toHaveBeenCalledTimes(1);
  readAmbientFacts('cache-only-origin');
  expect(scan).toHaveBeenCalledTimes(2);
});

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

it('does not walk the agent registry once per frame', () => {
  // The row under the prompt is repainted on every frame, and the registry
  // behind the peer count is a recursive directory walk that reads every
  // subagent definition. A count a second old is indistinguishable to a reader.
  const scan = vi.spyOn(AgentRegistryScanner.prototype, 'scanAllReachableAgents').mockReturnValue([]);
  const now = vi.spyOn(Date, 'now');

  now.mockReturnValue(1_000);
  readAmbientFacts('frame-1');
  readAmbientFacts('frame-1');
  readAmbientFacts('frame-1');
  expect(scan).toHaveBeenCalledTimes(1);

  // A different session is a different question and must not reuse the answer.
  readAmbientFacts('frame-2');
  expect(scan).toHaveBeenCalledTimes(2);

  // Once the window has passed the count is refreshed from the live registry.
  now.mockReturnValue(3_000);
  readAmbientFacts('frame-2');
  expect(scan).toHaveBeenCalledTimes(3);
});
