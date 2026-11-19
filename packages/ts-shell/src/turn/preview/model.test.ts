import { expect, it } from 'vitest';
import type { ToolSchema } from '../tools.js';
import type { ToolPreview } from './contract.js';
import { toolPreview } from './model.js';

const read: ToolSchema = { type: 'function', function: { name: 'read', parameters: {
  type: 'object', properties: { path: {}, content: {}, tags: {}, token: {}, count: {}, details: {}, other: {} },
} } };

it('observes closed members across escapes and nested JSON without publishing raw argument values', () => {
  const events: ToolPreview[] = [];
  const preview = toolPreview([read], event => events.push(event));
  preview.observe({ index: 0, name: 'read', delta: '{"pa' });
  preview.observe({ index: 0, name: 'read', delta: 'th":"src/\\u006' });
  expect(events).toHaveLength(1);
  preview.observe({ index: 0, name: 'read', delta: '1.ts","tags":[{"note":"x,}\\\\\\"y"},true],' });
  expect(events.at(-1)).toMatchObject({ phase: 'update', fields: ['path', 'tags'], target: 'src/a.ts' });
  const firstUpdate = events.at(-1);
  preview.observe({ index: 0, name: 'read', delta: '"token":"SYNTHETIC_SECRET","undeclared":"hidden"}' });
  expect(events.at(-1)).toMatchObject({ phase: 'update', fields: ['path', 'tags', 'token'], target: 'src/a.ts' });
  expect(firstUpdate).toMatchObject({ fields: ['path', 'tags'] });
  expect(JSON.stringify(events)).not.toMatch(/SYNTHETIC_SECRET|undeclared|hidden/);
  preview.close();
  expect(events.at(-1)).toMatchObject({ phase: 'end' });
});

it.each(['{"path":"src/a.ts",}', '{"path":"src/a.ts","tags":[}}', '{"path":"src/a.ts"} extra'])(
  'clears a preview when subsequent input invalidates the prefix %s', input => {
    const events: ToolPreview[] = [];
    const preview = toolPreview([read], event => events.push(event));
    const endOfPath = input.indexOf('src/a.ts') + 'src/a.ts"'.length + 1;
    preview.observe({ index: 0, name: 'read', delta: input.slice(0, endOfPath) });
    expect(events.at(-1)).toMatchObject({ phase: 'update', target: 'src/a.ts' });
    preview.observe({ index: 0, name: 'read', delta: input.slice(endOfPath) });
    expect(events.at(-1)).toMatchObject({ phase: 'update', fields: [] });
    expect(events.at(-1)).not.toHaveProperty('target');
    preview.close();
  },
);

it('bounds distinct calls, scanned arguments, property count and display bytes', () => {
  const events: ToolPreview[] = [];
  const preview = toolPreview([read], event => events.push(event));
  for (let index = 0; index < 30; index++) preview.observe({ index, name: 'read' });
  expect(events.filter(event => event.phase === 'start')).toHaveLength(8);
  preview.observe({ index: 0, name: 'read', delta: '{"path":"src/a.ts","content":"' + 'x'.repeat(20_000) });
  expect(events.at(-1)).toMatchObject({ phase: 'update', index: 0, fields: ['path'], target: 'src/a.ts', truncated: true });
  const bounded = events.length;
  preview.observe({ index: 0, name: 'read', delta: '","tags":true}' });
  expect(events).toHaveLength(bounded);
  preview.observe({ index: 1, name: 'read', delta: '{"path":"src/a.ts","tags":' + '['.repeat(25) });
  expect(events.at(-1)).toMatchObject({ phase: 'update', index: 1, fields: ['path'], truncated: true });
  preview.observe({ index: 2, name: 'read', fields: {
    path: 'tree/' + '\u{1F4C4}'.repeat(40), content: {}, tags: [], token: null, count: 1, details: 'text', other: true,
  } });
  const projected = events.at(-1);
  expect(projected).toMatchObject({ phase: 'update', index: 2, fields: ['path', 'content', 'tags', 'token', 'count', 'details'],
    truncated: true });
  if (!projected || projected.phase === 'end') throw new Error('Missing argument preview.');
  expect(Buffer.byteLength(projected.target!)).toBeLessThanOrEqual(96);
  expect(projected.target).toMatch(/^tree\/(?:\u{1F4C4})+\.\.\.$/u);
  preview.close();
});

it.each(['\x1b[2Jfake', 'line\u2028fake', 'https://person:secret@destination', '/private/path'])(
  'keeps unsafe path values out of the preview %j', unsafe => {
    const events: ToolPreview[] = [];
    const preview = toolPreview([read], event => events.push(event));
    preview.observe({ index: 0, name: 'read', delta: JSON.stringify({ path: unsafe }) });
    expect(events.at(-1)).toMatchObject({ phase: 'update', fields: ['path'] });
    expect(events.at(-1)).not.toHaveProperty('target');
    preview.close();
  },
);

it.each(['abort', 'source'] as const)('retires publication when the captured response loses its %s', mode => {
  const controller = new AbortController();
  const events: ToolPreview[] = [];
  let current = true;
  const preview = toolPreview([read], event => events.push(event), controller.signal, () => current);
  preview.observe({ index: 0, name: 'read' });
  if (mode === 'abort') controller.abort();
  else current = false;
  preview.observe({ index: 0, name: 'read', delta: '{"path":"too-late"}' });
  preview.close();
  expect(events.map(event => event.phase)).toEqual(['start', 'end']);
  expect(events[0]?.previewId).toBe(events[1]?.previewId);
});
