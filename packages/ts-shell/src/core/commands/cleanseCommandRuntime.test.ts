import { expect, it, vi } from 'vitest';
import { runCleanseCommand } from './cleanseCommandRuntime.js';
it('uses retained findings, exact repair approval and original-scope validation without Git dirtiness', async () => {
  const securityCommand = vi.fn(async () => ({ kind: 'local' as const, output: 'actual native owner', state: { status: 'partial' } }));
  const context = { cwd: process.cwd(), securityCommand };
  await runCleanseCommand(['diagnose', 'scan'], context);
  await runCleanseCommand(['repair', 'scan', 'fingerprint', 'fix.patch'], context);
  await runCleanseCommand(['apply', 'scan', 'fingerprint', 'proposal'], context);
  await runCleanseCommand(['verify', 'scan', 'fingerprint'], context);
  expect(securityCommand.mock.calls.map(call => call[0])).toEqual([
    ['show', 'scan'], ['disposition', 'scan', 'fingerprint', 'propose', 'fix.patch'],
    ['disposition', 'scan', 'fingerprint', 'apply', 'proposal'], ['validate', 'scan', 'fingerprint'],
  ]);
  expect(await runCleanseCommand(['verify', 'scan', 'fingerprint'], context)).toMatchObject({ state: { status: 'partial' } });
  securityCommand.mockClear();
  expect(await runCleanseCommand(['repair', 'scan'], context)).toMatchObject({ output: expect.stringContaining('Invalid') });
  expect(securityCommand).not.toHaveBeenCalled();
});
