import { describe, expect, it } from 'vitest';
import { stripAnsi } from '../text/ansi.js';
import { textBlock } from '../transcript/blocks.js';
import { Transcript } from '../transcript/container.js';
import { TranscriptPane } from './pane.js';

const width = 40, capacity = 5;

function conversation() {
  const transcript = new Transcript();
  for (let index = 0; index < 3; index++) {
    transcript.append(textBlock('user', `Prompt ${index}\n${'wrapped prompt '.repeat(5)}`));
    transcript.append(textBlock('assistant', `Reply ${index}\n${'answer\n'.repeat(8)}`));
  }
  const pane = new TranscriptPane(transcript);
  const render = () => pane.render(width, capacity, undefined);
  render();
  const document = transcript.all();
  const rendered = transcript.render(width - 1);
  const starts = rendered.owners.flatMap((owner, row) =>
    document[owner]?.kind === 'user' && rendered.owners[row - 1] !== owner ? [row] : []);
  const at = (row: number) => { pane.scrollToContentRow(row + Math.floor(capacity / 3)); render(); };
  return { transcript, document, pane, render, starts, at };
}

describe('prompt navigation', () => {
  it('moves between prompts and confirmed answers while excluding tool-calling and unconfirmed output', () => {
    const transcript = new Transcript();
    const prompt = transcript.append(textBlock('user', 'Original prompt'));
    transcript.append({ ...textBlock('assistant', 'Reading the file.\n' + 'preamble\n'.repeat(5)), hasToolCalls: true });
    transcript.append({ ...textBlock('tool', 'File content'), title: 'read', status: 'ok' });
    const answer = transcript.append({ ...textBlock('assistant', 'Confirmed answer\n' + 'body\n'.repeat(8)), hasToolCalls: false });
    transcript.append(textBlock('assistant', 'Unknown partial output\n' + 'tail\n'.repeat(10)));
    const pane = new TranscriptPane(transcript);
    const render = () => pane.render(width, capacity, undefined);
    render();
    const sources = [...transcript.copySources()];
    expect(pane.scroll('previous-prompt')).toBe(true); render();
    expect(pane.blockAtScreenRow(0)).toBe(answer);
    expect(pane.scroll('previous-prompt')).toBe(true); render();
    expect(pane.blockAtScreenRow(0)).toBe(prompt);
    expect(pane.scroll('next-prompt')).toBe(true); render();
    expect(pane.blockAtScreenRow(0)).toBe(answer);
    expect(pane.scroll('next-prompt')).toBe(false);
    expect([...transcript.copySources()]).toEqual(sources);
  });
  it('jumps between original prompt boundaries without visiting wrapped continuation rows', () => {
    const { pane, render, starts, transcript } = conversation();
    const sources = [...transcript.copySources()];
    for (const target of [...starts].reverse()) {
      expect(pane.scroll('previous-prompt')).toBe(true);
      expect(pane.selectionTop()).toBe(target);
      expect(stripAnsi(render()[0]!)).toContain(`Prompt ${starts.indexOf(target)}`);
      expect(pane.blockAtScreenRow(0)?.kind).toBe('user');
    }
    expect(pane.scroll('previous-prompt')).toBe(false);
    for (const target of starts.slice(1)) {
      expect(pane.scroll('next-prompt')).toBe(true);
      expect(pane.selectionTop()).toBe(target);
      render();
    }
    expect(pane.scroll('next-prompt')).toBe(false);
    expect([...transcript.copySources()]).toEqual(sources);
  });

  it('returns to the current prompt from its wrapped body, then advances to the next prompt', () => {
    const { pane, render, starts, at } = conversation();
    at(starts[1]! + 1);
    expect(pane.scroll('previous-prompt')).toBe(true);
    expect(pane.selectionTop()).toBe(starts[1]);
    render();
    expect(pane.scroll('next-prompt')).toBe(true);
    expect(pane.selectionTop()).toBe(starts[2]);
  });

  it('keeps a prompt anchor when a narrow resize rewraps its original block', () => {
    const { pane, render, starts } = conversation();
    expect(pane.scroll('previous-prompt')).toBe(true); render();
    const block = pane.blockAtScreenRow(0);
    pane.render(20, capacity, undefined);
    expect(pane.blockAtScreenRow(0)).toBe(block);
    expect(pane.scroll('previous-prompt')).toBe(true);
    const content = pane.render(20, capacity, undefined);
    expect(stripAnsi(content[0]!)).toContain('Prompt 1');
    expect(pane.selectionTop()).toBeLessThan(starts[2]! * 2);
  });

  it('ignores prompt-looking control bytes in assistant content and user continuation rows', () => {
    const transcript = new Transcript();
    transcript.append(textBlock('user', 'Original prompt\n\x1b]133;A\x07user continuation'));
    transcript.append(textBlock('assistant', '\x1b]133;A\x07assistant content\n' + 'tail\n'.repeat(10)));
    const pane = new TranscriptPane(transcript);
    pane.render(width, capacity, undefined);
    expect(pane.scroll('previous-prompt')).toBe(true);
    expect(pane.selectionTop()).toBe(0);
    pane.render(width, capacity, undefined);
    expect(pane.scroll('next-prompt')).toBe(false);
  });

  it.each(['document', 'invalidated', 'zero-width', 'changed'] as const)(
    'refuses prompt navigation against a %s frame', unavailable => {
      const { pane, transcript } = conversation();
      if (unavailable === 'document') pane.render(width, capacity, undefined, undefined, undefined, 'document');
      if (unavailable === 'invalidated') pane.invalidatePageAvailability();
      if (unavailable === 'zero-width') pane.render(0, capacity, undefined);
      if (unavailable === 'changed') transcript.setText(transcript.blockAt(0)!, 'Changed prompt');
      const top = pane.selectionTop();
      expect(pane.scroll('previous-prompt')).toBe(false);
      expect(pane.selectionTop()).toBe(top);
    });

  it('drops old prompt coordinates when the conversation is replaced before a paint', () => {
    const { pane, transcript } = conversation();
    transcript.clear(); transcript.append(textBlock('notice', 'Replacement without a prompt'));
    expect(pane.scroll('previous-prompt')).toBe(false);
    pane.render(width, capacity, undefined);
    expect(pane.scroll('previous-prompt')).toBe(false);
  });

  it('reveals only one existing retained page at the oldest painted prompt', () => {
    const transcript = new Transcript();
    const earlier = Array.from({ length: 61 }, (_, index) => textBlock('user', `Earlier ${index}`));
    transcript.retainEarlier(earlier);
    transcript.append(textBlock('user', 'Current prompt'));
    transcript.append(textBlock('assistant', 'Current reply\n' + 'tail\n'.repeat(10)));
    const pane = new TranscriptPane(transcript);
    pane.render(width, capacity, undefined);
    pane.scroll(-1_000); pane.render(width, capacity, undefined);
    const original = pane.blockAtScreenRow(0), sources = [...transcript.copySources()];
    expect(pane.scroll('previous-prompt')).toBe(true);
    expect(transcript.all()).toHaveLength(62);
    expect(pane.scroll('previous-prompt')).toBe(false);
    pane.render(width, capacity, undefined);
    expect(pane.blockAtScreenRow(0)).toBe(original);
    expect(pane.scroll('previous-prompt')).toBe(true);
    expect(stripAnsi(pane.render(width, capacity, undefined)[0]!)).toContain('Earlier 60');
    expect([...transcript.copySources()]).toEqual(sources);
  });

  it('reaches existing retained history when a notice precedes the oldest painted prompt', () => {
    const transcript = new Transcript();
    transcript.retainEarlier([textBlock('user', 'Earlier prompt')]);
    transcript.append(textBlock('notice', '1 earlier message is not shown.'));
    const current = transcript.append(textBlock('user', 'Current prompt'));
    transcript.append(textBlock('assistant', 'tail\n'.repeat(10)));
    const pane = new TranscriptPane(transcript);
    pane.render(width, capacity, undefined);
    expect(pane.scroll('previous-prompt')).toBe(true);
    expect(pane.render(width, capacity, undefined)[0]).toContain('Current prompt');
    expect(pane.selectionTop()).toBeGreaterThan(0);
    expect(pane.scroll('previous-prompt')).toBe(true);
    pane.render(width, capacity, undefined);
    expect(pane.selectionTop()).toBe(0);
    expect(pane.scroll('previous-prompt')).toBe(true);
    expect(transcript.all()).toHaveLength(4);
    pane.render(width, capacity, undefined);
    expect(pane.blockAtScreenRow(0)?.text).toBe('1 earlier message is not shown.');
    expect(pane.scroll('previous-prompt')).toBe(true);
    pane.render(width, capacity, undefined);
    expect(pane.blockAtScreenRow(0)?.text).toBe('Earlier prompt');
    expect(transcript.all()).toContain(current);
  });
});
