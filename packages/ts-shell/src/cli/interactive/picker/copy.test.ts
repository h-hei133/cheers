import { expect, it } from 'vitest';
import { Transcript } from '../../../presentation/tui/transcript/container.js';
import { textBlock } from '../../../presentation/tui/transcript/blocks.js';
import { copyPicker } from './copy.js';
import type { CommandContext } from '../../../core/commands/types.js';

it('lists every block, newest first, and copies the chosen source', async () => {
  const transcript = new Transcript();
  for (let index = 0; index < 40; index++) transcript.append(textBlock('assistant', `answer ${index}`));
  const picker = copyPicker(transcript, { cwd: '/workspace' } as CommandContext);
  const options = await picker.load();
  expect(options).toHaveLength(40);
  expect(options[0]?.detail).toBe('answer 39');
  const result = await picker.apply([options[39]!.id]);
  expect(result?.note).toContain('Copied 8 characters');
});
