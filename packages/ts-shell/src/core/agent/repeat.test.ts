import { describe, expect, it } from 'vitest';
import { ToolRepetition } from './repeat.js';

const call = { name: 'read', args: { path: '/private/project/a.ts' } };

describe('ToolRepetition', () => {
  it('adds advisory notes at the progressive consecutive thresholds', () => {
    const repetition = new ToolRepetition();
    expect(repetition.observe(call)).toBeUndefined();
    expect(repetition.observe(call)).toBeUndefined();
    expect(repetition.observe(call)).toContain('requested 3 times');
    expect(repetition.observe(call)).toBeUndefined();
    expect(repetition.observe(call)).toContain('requested 5 times');
    expect(repetition.observe(call)).toBeUndefined();
    expect(repetition.observe(call)).toBeUndefined();
    expect(repetition.observe(call)).toContain('requested 8 times');
  });

  it('canonicalizes key order, ignores changes and resets without retaining call details', () => {
    const repetition = new ToolRepetition();
    const first = { name: 'read', args: { first: 1, nested: { alpha: true, beta: 2 } } };
    const reordered = { name: 'read', args: { nested: { beta: 2, alpha: true }, first: 1 } };
    expect(repetition.observe(first)).toBeUndefined();
    expect(repetition.observe(reordered)).toBeUndefined();
    expect(repetition.observe({ name: 'read', args: { first: 2, nested: { alpha: true, beta: 2 } } })).toBeUndefined();
    repetition.reset();
    expect(repetition.observe(first)).toBeUndefined();
    expect(repetition.observe(first)).toBeUndefined();
    const reminder = repetition.observe(first);
    expect(reminder).toContain('requested 3 times');
    expect(reminder).not.toContain('/private/project');
  });

  it('reminds about repeated call sequences without stopping later calls', () => {
    const repetition = new ToolRepetition();
    const sequence = [call, { name: 'edit', args: { path: '/private/project/a.ts' } }];
    let reminder: string | undefined;
    for (let index = 0; index < 16; index++) reminder = repetition.observe(sequence[index % sequence.length]!);
    expect(reminder).toContain('same 2-call sequence');
    expect(repetition.observe(call)).toBeUndefined();
  });

  it('does not classify ordinary edits, varying arguments or oversized input as a reminder', () => {
    const repetition = new ToolRepetition();
    for (let index = 0; index < 6; index++) {
      expect(repetition.observe({ name: index % 2 ? 'edit' : 'read', args: { path: `file-${index}.ts` } })).toBeUndefined();
    }
    expect(repetition.observe({ name: 'read', args: { payload: 'x'.repeat(256 * 1024 + 1) } })).toBeUndefined();
    expect(repetition.observe(call)).toBeUndefined();
  });
});
