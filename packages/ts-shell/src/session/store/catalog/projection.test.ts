import { expect, it, vi } from 'vitest';
import type { Session } from '../../schema/sessionRecord.js';
import { projectSessionMetadata } from '../../schema/sessionMetadataCodec.js';
import { buildSessionStateSnapshot } from '../../schema/sessionStateSnapshot.js';
import { createMessageTranscriptEvent } from '../../sessionEventCodec.js';
import { decodeSessionSummary, summarizeSession } from './projection.js';

function decodeFixture() {
  const timestamp = '2026-10-30T00:00:00.000Z';
  const session: Session = {
    id: 'session', projectRoot: '/workspace', createdAt: timestamp, updatedAt: timestamp, status: 'completed',
    turns: Array.from({ length: 3072 }, (_, index) => ({
      id: `message-${index}`, role: index === 0 ? 'user' as const : 'assistant' as const,
      content: `catalog scheduling fixture ${index}`, timestamp,
    })),
  };
  return { session, metadata: JSON.stringify(projectSessionMetadata(session)),
    state: JSON.stringify(buildSessionStateSnapshot(session, undefined)),
    transcript: session.turns.map(turn => JSON.stringify(createMessageTranscriptEvent(turn))).join('\n') };
}

it.each([false, true])('yields during catalog transcript parsing and respects cancellation=%s', async cancel => {
  const { session, metadata, state, transcript } = decodeFixture();
  const controller = new AbortController();
  const reason = new Error('catalog closed during parsing');
  const parse = JSON.parse;
  let parsed = 0, observed = 0;
  let immediate: ReturnType<typeof setImmediate> | undefined;
  const spy = vi.spyOn(JSON, 'parse').mockImplementation((...args: Parameters<typeof JSON.parse>) => {
    const value = parse(...args);
    if (value?.type === 'message') {
      parsed++;
      if (parsed === 1) immediate = setImmediate(() => {
        observed = parsed;
        if (cancel) controller.abort(reason);
      });
    }
    return value;
  });
  try {
    const decoded = decodeSessionSummary(session.id, metadata, state, transcript, 'version', controller.signal);
    if (cancel) await expect(decoded).rejects.toBe(reason);
    else expect(await decoded).toEqual(summarizeSession(session, 'version'));
    expect(observed).toBeGreaterThan(0);
    expect(observed).toBeLessThan(session.turns.length);
    if (cancel) expect(parsed).toBeLessThan(session.turns.length);
    else expect(parsed).toBe(session.turns.length);
  } finally {
    if (immediate) clearImmediate(immediate);
    spy.mockRestore();
  }
});

it('rejects already cancelled catalog decoding even without a transcript or state', async () => {
  const { session, metadata } = decodeFixture();
  const reason = new Error('catalog already closed');
  await expect(decodeSessionSummary(session.id, metadata, undefined, undefined, 'version', AbortSignal.abort(reason)))
    .rejects.toBe(reason);
});

it('keeps bounded first-prompt and latest-answer excerpts in the catalog summary', () => {
  const session: Session = {
    id: 'session',
    projectRoot: '/workspace',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:01:00.000Z',
    status: 'completed',
    turns: [
      { role: 'user', content: `  ${'p'.repeat(1300)}\n  ` },
      { role: 'assistant', content: 'middle answer' },
      { role: 'assistant', content: `  ${'a'.repeat(1300)}\n  ` },
    ],
  };

  const summary = summarizeSession(session, 'version');
  expect(summary.preview?.prompt).toHaveLength(1200);
  expect(summary.preview?.prompt?.startsWith('ppp')).toBe(true);
  expect(summary.preview?.prompt).not.toContain('\n');
  expect(Array.from(summary.preview?.answer ?? '')).toHaveLength(1201);
  expect(summary.preview?.answer?.startsWith('…')).toBe(true);
  expect(summary.preview?.answer?.endsWith('aaa')).toBe(true);
  expect(summary.preview?.answer).not.toContain('middle answer');
});

it('projects large excerpts without materializing the full text as a code-point array', () => {
  const session: Session = {
    id: 'session',
    projectRoot: '/workspace',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:01:00.000Z',
    status: 'completed',
    turns: [
      { role: 'user', content: 'p'.repeat(8 * 1024 * 1024) },
      { role: 'assistant', content: 'a'.repeat(8 * 1024 * 1024) },
    ],
  };
  const from = vi.spyOn(Array, 'from');
  try {
    const summary = summarizeSession(session, 'version');
    expect(summary.preview?.prompt).toHaveLength(1200);
    expect(summary.preview?.answer).toHaveLength(1201);
    expect(from.mock.calls.some(([value]) =>
      (typeof value === 'string' && value.length > 1200)
      || (Array.isArray(value) && value.length > 1200))).toBe(false);
  } finally {
    from.mockRestore();
  }
});
