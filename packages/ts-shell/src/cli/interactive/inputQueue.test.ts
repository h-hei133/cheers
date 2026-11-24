import { expect, it, vi } from 'vitest';
import type { Session } from '../../session/schema/sessionRecord.js';
import { PasteStore } from '../../presentation/tui/pastes.js';
import { recallQueuedDraft, SubmissionQueue } from './inputQueue.js';

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

it('retains the original input source through editing and moving queued submissions', () => {
  const queue = new SubmissionQueue(() => ({id:'session', createdAt:'created', projectRoot:'/workspace'}) as Session, vi.fn());
  const first = queue.push('User text'), second = queue.push('Extension text', undefined, 'extension');
  queue.control.edit(second, 'Edited extension text'); queue.control.move(second, first);
  expect(queue.shift()).toBe('Edited extension text'); expect(queue.takeSource()).toBe('extension'); expect(queue.takeSource()).toBeUndefined();
  expect(queue.shift()).toBe('User text'); expect(queue.takeSource()).toBeUndefined();
});

it('recalls the pending tail with exact text and images while protecting the current draft', () => {
  const session = { id: 'session', createdAt: 'created', projectRoot: '/workspace' } as Session;
  const queue = new SubmissionQueue(() => session, vi.fn());
  const pastes = new PasteStore(2);
  const image = { type: 'image' as const, data: 'AA==', mimeType: 'image/png' };
  const current = pastes.holdImage(image);
  pastes.holdImage(image);
  queue.push('earlier');
  queue.push('  latest\n', { images: [image] });
  const recalled = recallQueuedDraft(undefined, queue, pastes, current);
  expect(recalled).toBeDefined();
  expect(pastes.expand(recalled!)).toBe('  latest\n');
  expect(pastes.imagesIn(recalled!)).toEqual([image]);
  expect(pastes.imagesIn(current)).toEqual([image]);
  expect(queue.shift()).toBe('earlier');
  expect(queue.shift()).toBeUndefined();
});

it('retains a tail that belongs to another authority or cannot fit its attachments in the draft', () => {
  let session = { id: 'session', createdAt: 'created', projectRoot: '/workspace' } as Session;
  const queue = new SubmissionQueue(() => session, vi.fn());
  const pastes = new PasteStore(1);
  const image = { type: 'image' as const, data: 'AA==', mimeType: 'image/png' };
  const current = pastes.holdImage(image);
  const id = queue.push('requested', { images: [image] });
  expect(recallQueuedDraft(undefined, queue, pastes, current)).toBeUndefined();
  expect(pastes.imagesIn(current)).toEqual([image]);
  expect(queue.control.entries().map(entry => entry.id)).toEqual([id]);

  session = { ...session, projectRoot: '/other' };
  expect(recallQueuedDraft(undefined, queue, pastes, '')).toBeUndefined();
  session = { ...session, projectRoot: '/workspace' };
  queue.push('extension', undefined, 'extension');
  expect(recallQueuedDraft(undefined, queue, pastes, '')).toBeUndefined();
  expect(queue.control.entries().map(entry => entry.text)).toEqual(['requested', 'extension']);
});
