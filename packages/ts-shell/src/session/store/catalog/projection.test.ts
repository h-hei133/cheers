import { expect, it, vi } from 'vitest';
import type { Session } from '../../schema/sessionRecord.js';
import { summarizeSession } from './projection.js';

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
