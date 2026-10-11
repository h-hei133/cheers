import { afterEach, expect, it } from 'vitest';
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
