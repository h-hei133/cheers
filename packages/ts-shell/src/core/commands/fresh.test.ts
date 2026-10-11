import { expect, it } from 'vitest';
import { freshLocalState } from './fresh.js';

it('reports unknown local reset without claiming transcript or account reset', async () => {
  const output = await freshLocalState({ resetConnection: () => 'unknown' });
  expect(output).toContain('unknown');
  expect(output).toContain('transcript and remote account state were not changed');
});

it('resets only owners that report a real local reset', async () => {
  const output = await freshLocalState({ resetConnection: () => 'reset', resetCursor: () => 'unchanged' });
  expect(output).toContain('1 owner');
  expect(output).toContain('transcript and remote account state were not changed');
});
