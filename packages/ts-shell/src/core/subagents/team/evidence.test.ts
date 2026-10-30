import { createHash } from 'node:crypto';
import { expect, it } from 'vitest';
import { reviewEvidence } from './evidence.js';
import type { AfterToolCallContext } from '../../agent/tools.js';

function observation(overrides: Partial<AfterToolCallContext> = {}): AfterToolCallContext {
  const text = 'observed text';
  return { call: { id: 'read', name: 'read', args: { path: 'file.txt' } }, args: { path: 'file.txt' },
    assistantMessage: { role: 'assistant', content: 'read' }, isError: false,
    result: { output: text, isError: false, metadata: { read: { text, startLine: 1, endLine: 1 },
      provenance: { locator: 'file.txt', parser: 'utf8', hashScope: 'selected-text', location: 'lines',
        contentHash: createHash('sha256').update(text).digest('hex') } } }, ...overrides };
}

it('retires read authority and returns detached receipt snapshots', async () => {
  const reads = reviewEvidence('r');
  await reads.observe(observation());
  const snapshot = reads.snapshot();
  (snapshot[0] as { locator: string }).locator = 'tampered';
  expect(reads.snapshot()[0]?.locator).toBe('file.txt');
  reads.retire();
  expect(await reads.observe(observation())).toBeUndefined();
  expect(reads.snapshot()).toHaveLength(1);
});

it('refuses new receipts when the original review signal is cancelled', async () => {
  const controller = new AbortController();
  const reads = reviewEvidence('r', controller.signal);
  controller.abort();
  expect(await reads.observe(observation())).toBeUndefined();
  expect(reads.snapshot()).toEqual([]);
});

it.each(['grep', 'glob'])('does not certify a %s result as a native file content read', async name => {
  expect(await reviewEvidence('r').observe(observation({ call: { id: 'call', name, args: {} } }))).toBeUndefined();
});

it('rejects a mismatched native locator and invalid line range', async () => {
  const reads = reviewEvidence('r');
  expect(await reads.observe(observation({ args: { path: 'other.txt' } }))).toBeUndefined();
  const context = observation();
  (context.result.metadata!.read as { endLine: number }).endLine = 0;
  expect(await reads.observe(context)).toBeUndefined();
});

it.each(['text', 'no-text'])('certifies only actually extracted PDF %s', async status => {
  const reads = reviewEvidence('r');
  const result = await reads.observe(observation({ args: { path: 'doc.pdf' }, result: { output: 'PDF extraction', isError: false,
    metadata: { provenance: { locator: 'doc.pdf', parser: 'poppler', location: 'pages' },
      media: { kind: 'pdf', sourceHash: 'a'.repeat(64), startPage: 2, endPage: 2,
        pages: [{ page: 2, status, text: status === 'text' ? 'extracted' : '' }] } } } }));
  if (status === 'text') expect(result?.suffix).toContain('pages 2-2');
  else expect(result).toBeUndefined();
});
