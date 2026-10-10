import { expect, it } from 'vitest';
import { projectEvent } from './client/events.js';
import { decodeSnapshot, projectSnapshot } from './contract/snapshot.js';
import { emptySnapshot } from './__tests__/fixture.js';

it('never forwards split message/tool secrets or raw provider event graphs', () => {
  for (const event of [{ type: 'message.delta', role: 'planner', delta: 'Bear' }, { type: 'message.delta', role: 'planner', delta: 'er SYNTHETIC_SECRET' },
    { type: 'tool.output', toolName: 'tool', taskId: 'call', chunk: 'Bearer SYNTHETIC_SECRET' },
    { type: 'reasoning.delta', role: 'planner', delta: 'Bearer SYNTHETIC_SECRET' }]) expect(projectEvent(event as never, 1, 1)).toBeUndefined();
  expect(projectEvent({ type: 'query.started', sessionId: 'Bearer SYNTHETIC_SECRET', prompt: 'Bearer SYNTHETIC_SECRET', sessionPath: '/secret' }, 1, 1))
    .toEqual({ sequence: 1, kind: 'query.started', timestamp: 1 });
  const snapshot = projectSnapshot({ header: { sessionId: 'private-id', workspace: '/private', exportedAt: '' }, tree: [], leafId: null, warnings: [],
    entries: [{ id: 'message', role: 'assistant', content: 'Bearer SYNTHETIC_SECRET', html: '<script>attack()</script>',
      toolCalls: [{ id: 'call', name: 'raw', arguments: 'Bearer SYNTHETIC_SECRET' }] }] }, 1);
  expect(JSON.stringify(snapshot)).not.toContain('SYNTHETIC_SECRET'); expect(JSON.stringify(snapshot)).not.toContain('<script>');
  expect(snapshot.cutover).toBe(1); expect(snapshot.consistency).toBe('partial');
});
it('omits whole large UTF-8 fields and rejects uploaded active HTML or opaque fields', () => {
  const snapshot = projectSnapshot({ header: { sessionId: '', workspace: '', exportedAt: '' }, tree: [], leafId: null, warnings: [],
    entries: [{ id: 'large', role: 'user', content: '中文'.repeat(10000), html: '' }] }, 0);
  expect(snapshot.entries[0]!.content).toContain('omitted');
  expect(() => decodeSnapshot({ ...emptySnapshot, html: '<script>attack</script>' })).toThrow();
  expect(() => decodeSnapshot({ ...emptySnapshot, entries: [{ id: 'a'.repeat(64), role: 'user', content: 'x', providerBlob: 'opaque' }] })).toThrow();
});
