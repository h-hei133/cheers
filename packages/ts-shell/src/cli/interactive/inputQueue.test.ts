import { expect, it, vi } from 'vitest';
import type { Session } from '../../session/schema/sessionRecord.js';
import { SubmissionQueue } from './inputQueue.js';

it('drains the edited/reordered actual queue and rejects consumed entry IDs', () => {
  const session = { id: 'session', createdAt: 'created', projectRoot: '/workspace' } as Session;
  const queue = new SubmissionQueue(() => session, vi.fn());
  const first = queue.push('duplicate'); const second = queue.push('duplicate');
  expect(queue.control.edit(second, 'edited')).toBe(true); expect(queue.control.move(second, first)).toBe(true);
  expect(queue.shift()).toBe('edited'); expect(queue.control.cancel(second)).toBe(false);
  expect(queue.control.cancel(first)).toBe(true); expect(queue.shift()).toBeUndefined();
});

it('retains one attachment set through editing and consumes it with its exact queued submission', () => {
  const queue = new SubmissionQueue(() => ({ id: 'session', createdAt: 'created', projectRoot: '/workspace' }) as Session, vi.fn());
  const attachments = { images: [{ type: 'image' as const, data: 'AA==', mimeType: 'image/png' }] };
  const id = queue.push('正文 /skill:a', attachments); queue.control.edit(id, '正文 /skill:a /skill:b');
  expect(queue.shift()).toBe('正文 /skill:a /skill:b'); expect(queue.takeAttachments()).toEqual(attachments);
  expect(queue.takeAttachments()).toBeUndefined(); expect(queue.shift()).toBeUndefined();
});

it('refuses stale session submissions without hiding valid current-session work behind them', () => {
  let session = { id: 'old', createdAt: 'created', projectRoot: '/workspace' } as Session;
  const refused = vi.fn(); const queue = new SubmissionQueue(() => session, refused);
  queue.push('old input'); session = { ...session, id: 'new' }; queue.push('new input');
  expect(queue.shift()).toBe('new input'); expect(refused).toHaveBeenCalledWith('old input');
  expect(queue.length).toBe(0);
});

it('returns exact text and attachments together when interrupted pending work is released', () => {
  const queue = new SubmissionQueue(() => ({ id: 'session', createdAt: 'created', projectRoot: '/workspace' }) as Session, vi.fn());
  const attachments = { images: [{ type: 'image' as const, data: 'AA==', mimeType: 'image/png' }] };
  queue.push('  正文 /skill:a\n/skill:b  ', attachments);
  expect(queue.release()).toEqual([{ text: '  正文 /skill:a\n/skill:b  ', attachments,
    sessionId: 'session', createdAt: 'created', projectRoot: '/workspace' }]);
  expect(queue.shift()).toBeUndefined(); expect(queue.release()).toEqual([]);
});
