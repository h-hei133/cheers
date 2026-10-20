import { expect, it } from 'vitest';
import { Transcript } from '../../../presentation/tui/transcript/container.js';
import { textBlock } from '../../../presentation/tui/transcript/blocks.js';
import { copyPicker } from './copy.js';
import { setClipboardSink } from '../../../core/commands/copyCommandRuntime.js';
import type { CommandContext } from '../../../core/commands/types.js';

it('lists every block, newest first, and copies the chosen source', async () => {
  const captured: string[] = [];
  setClipboardSink(sequence => captured.push(sequence));
  const transcript = new Transcript();
  for (let index = 0; index < 40; index++) transcript.append(textBlock('assistant', `answer ${index}`));
  const picker = copyPicker(transcript, { cwd: '/workspace' } as CommandContext);
  const options = await picker.load();
  expect(options).toHaveLength(40);
  expect(options[0]?.detail).toBe('answer 39');
  try {
    const result = await picker.apply([options[39]!.id]);
    expect(result?.note).toContain('8 characters');
    const base64 = /;c;([^\x07]+)\x07/.exec(captured[0] ?? '')?.[1] ?? '';
    expect(Buffer.from(base64, 'base64').toString('utf8')).toBe('answer 0');
  } finally {
    setClipboardSink(undefined);
  }
});

it('loads a bounded first page and follows the explicit continuation', async () => {
  const transcript = new Transcript();
  for (let index = 0; index < 1001; index++) transcript.append(textBlock('assistant', `answer ${index}`));
  const first = copyPicker(transcript, { cwd: '/workspace' } as CommandContext);
  const firstOptions = await first.load();
  expect(firstOptions).toHaveLength(101);
  expect(firstOptions.at(-1)?.id).toBe('__more__');
  expect(firstOptions[0]?.detail).toBe('answer 1000');

  const next = await first.apply(['__more__']);
  expect(next?.next).toBeDefined();
  const secondOptions = await next!.next!.load();
  expect(secondOptions[0]?.detail).toBe('answer 900');
});

it('rejects a copy selection after the transcript revision changes', async () => {
  const captured: string[] = [];
  setClipboardSink(sequence => captured.push(sequence));
  const transcript = new Transcript();
  const block = transcript.append(textBlock('assistant', 'before'));
  const picker = copyPicker(transcript, { cwd: '/workspace' } as CommandContext);
  const options = await picker.load();
  transcript.setText(block, 'after');
  try {
    const result = await picker.apply([options[0]!.id]);
    expect(result?.note).toContain('Transcript changed');
    expect(captured).toHaveLength(0);
  } finally {
    setClipboardSink(undefined);
  }
});
