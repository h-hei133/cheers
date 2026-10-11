import { expect, it, vi } from 'vitest';
import { runForceCommand } from './forceCommandRuntime.js';

it('selects one available tool without granting execution authority', async () => {
  const select = vi.fn(async (tool: string) => tool === 'read' ? 'Selected read.' : Promise.reject(new Error('unavailable')));
  const result = await runForceCommand(['read'], { cwd: process.cwd(), forceTool: select } as never);
  expect(select).toHaveBeenCalledWith('read');
  expect(result.output).toContain('Plan mode, sandbox, ordinary approval');
});

it('refuses names that could smuggle options or an elevation mode', async () => {
  const select = vi.fn(async () => 'selected');
  const result = await runForceCommand(['--no-approval'], { cwd: process.cwd(), forceTool: select } as never);
  expect(select).not.toHaveBeenCalled();
  expect(result.output).toContain('requires one available tool name');
});
