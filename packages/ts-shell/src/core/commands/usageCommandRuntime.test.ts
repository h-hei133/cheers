import { afterEach, expect, it, vi } from 'vitest';
import { recordSessionUsage, resetSessionUsage } from '../../observability/usageTelemetry.js';
import { runUsageCommand } from './usageCommandRuntime.js';

afterEach(() => resetSessionUsage('usage-control-test'));

it('keeps measured usage distinct from unknown account quota', async () => {
  recordSessionUsage('usage-control-test', { model: 'm', provider: 'p', promptTokens: 2, completionTokens: 3 });
  const result = await runUsageCommand([], { cwd: process.cwd(), sessionId: 'usage-control-test' });
  expect(result.output).toContain('Tokens recorded: 5');
  expect(result.output).toContain('Account quota: unknown');
  expect(result.output).toContain('Reset credit: unavailable');
});

it('delegates optional local reset status lookup and still refuses incomplete apply syntax before invoking the account host', async () => {
  const usageCommand = vi.fn(async () => ({ kind: 'local' as const, output: 'stored receipt fixture' }));
  const context = { cwd: process.cwd(), usageCommand };
  for (const args of [['reset', 'status'], ['reset', 'status', '00000000-0000-4000-8000-000000000001']]) {
    expect((await runUsageCommand(args, context)).output).toBe('stored receipt fixture');
  }
  expect(usageCommand).toHaveBeenCalledTimes(2);
  expect((await runUsageCommand(['reset', 'apply'], context)).output).toContain('requires its preview ID');
  expect((await runUsageCommand(['reset', 'status', 'bad-id'], context)).output).toContain('UUID request ID');
  expect(usageCommand).toHaveBeenCalledTimes(2);
});
