import { expect, it } from 'vitest';
import { attachmentBinding } from './binding.js';

const image = (data: string, mimeType = 'image/png') => ({ type: 'image' as const, mimeType, data });

it('binds ordered image bytes and MIME identity without treating empty input as content', () => {
  const first = image('first');
  const second = image('second', 'image/jpeg');
  expect(attachmentBinding()).toBe('');
  expect(attachmentBinding({ images: [] })).toBe('');
  const bound = attachmentBinding({ images: [first, second] });
  expect(bound).toMatch(/^[a-f0-9]{64}$/);
  expect(attachmentBinding({ images: [first] })).not.toBe(bound);
  expect(attachmentBinding({ images: [image('changed'), second] })).not.toBe(bound);
  expect(attachmentBinding({ images: [second, first] })).not.toBe(bound);
});
