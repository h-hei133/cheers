import { describe, expect, it } from 'vitest';
import { appendConversation } from '../../../cli/interactive/history.js';
import { forgetSessionTodos } from '../../../core/commands/todoCommandRuntime.js';
import type { Session } from '../../../session/schema/sessionRecord.js';
import { stripAnsi } from '../text/ansi.js';
import { sliceWithWidth } from '../text/measure.js';
import type { Block } from '../transcript/blocks.js';
import { Transcript } from '../transcript/container.js';
import type { ViewContext } from './contract.js';
import { TranscriptPane } from './pane.js';
import { InteractiveSurface } from './view.js';

const size = { columns: 60, rows: 16 };

function fixture(total = 205) {
  const live = { fullScreen: false };
  const context: ViewContext = {
    facts: () => ({ model: 'fixture', provider: 'fixture', branch: 'main' }), statusItems: () => [],
    activity: () => undefined, busy: () => false, queuedCount: () => 0, now: () => 0,
    ambient: () => ({ openTodos: 0, peerSessions: 0, runningCommands: 0 }), cancelArmed: () => false,
    overlayFullScreen: () => live.fullScreen, overlayRows: () => live.fullScreen ? ['Overlay'] : [],
    selection: () => undefined,
  };
  const view = new InteractiveSurface(context);
  const authored = view.transcript.append({ kind: 'notice', text: '145 earlier messages are not shown.', finalized: true });
  const session: Session = { id: 'retained-paging', projectRoot: process.cwd(), status: 'active',
    createdAt: '2026-11-11T00:00:00Z', updatedAt: '2026-11-11T00:00:00Z',
    turns: Array.from({ length: total }, (_, index) => ({
    id: 'message-' + index, role: 'user', content: 'History ' + index, timestamp: '2026-11-11T00:00:00Z',
  })), reports: [] };
  appendConversation({ transcript: view.transcript, editor: view.editor }, session);
  forgetSessionTodos(session.id);
  const notice = view.transcript.all().find(block => block !== authored && block.kind === 'notice');
  const sources = [...view.transcript.copySources()];
  view.renderFrame(size);
  view.scroll(-1_000_000);
  view.renderFrame(size);
  return { view, live, authored, notice, sources, session };
}

function content(view: InteractiveSurface): string {
  return sliceWithWidth(stripAnsi(view.renderFrame(size).rows[0] ?? ''), 0, view.scrollbarGeometry()?.column ?? size.columns).text;
}

describe('retained history paging', () => {
  it('reveals bounded original source pages without replacing the document or copy sequence', () => {
    const { view, authored, notice, sources, session } = fixture();
    const document = view.transcript.all();
    const sessionBefore = JSON.stringify(session);
    view.editor.setText('Unsubmitted draft');
    for (const [count, remaining] of [[60, 85], [60, 25], [25, 0]] as const) {
      view.scroll(-1_000_000); view.renderFrame(size);
      const anchor = view.blockAtScreenRow(0), oldSize = document.length;
      const before = content(view);
      expect(view.scrollPage(-1)).toBe(true);
      expect(document.length - oldSize).toBe(count);
      expect(view.transcript.all()).toBe(document);
      expect(content(view)).toBe(before);
      expect(view.blockAtScreenRow(0)).toBe(anchor);
      expect([...view.transcript.copySources()]).toEqual(sources);
      expect(notice?.text).toBe(remaining > 0 ? `${remaining} earlier messages are not shown.` : 'All earlier messages are shown.');
      expect(authored.text).toBe('145 earlier messages are not shown.');
    }
    view.scroll(-1_000_000); view.renderFrame(size);
    expect(view.scrollPage(-1)).toBe(false);
    expect(document).toContain(sources[0]);
    expect(view.editor.getText()).toBe('Unsubmitted draft');
    expect(JSON.stringify(session)).toBe(sessionBefore);
    const rendered = view.transcript.render(size.columns - 1);
    expect(rendered.sources.every((line, row) => line === undefined || line.block === rendered.owners[row])).toBe(true);
  });

  it('admits only one source page against the same painted top', () => {
    const { view } = fixture();
    const before = view.transcript.all().length;
    for (let index = 0; index < 5; index++) view.scrollPage(-1);
    expect(view.transcript.all().length - before).toBe(60);
    view.renderFrame(size);
    expect(view.selectionTop()).toBeGreaterThan(0);
  });

  it.each(['page', 'rows', 'search', 'thumb', 'end'] as const)('keeps later %s navigation before the next paint', action => {
    const { view } = fixture();
    const paintedOwners = view.transcript.render(size.columns - 1).owners;
    const paintedBlocks: Array<Block | undefined> = paintedOwners.map(owner => view.transcript.blockAt(owner));
    view.scrollPage(-1);
    if (action === 'page') view.scrollPage(1);
    if (action === 'rows') view.scroll(4);
    if (action === 'search') view.scrollToContentRow(20);
    if (action === 'thumb') view.scrollToThumb(3);
    if (action === 'end') view.scrollToEnd();
    const targetTop = view.selectionTop();
    const expected = paintedBlocks[targetTop];
    const oldOwner = paintedOwners[targetTop];
    const offset = oldOwner === undefined ? 0 : targetTop - paintedOwners.indexOf(oldOwner);
    expect(targetTop).toBeGreaterThan(0);
    view.renderFrame(size);
    if (action === 'end') expect(view.scrolledBack).toBe(0);
    else {
      expect(view.blockAtScreenRow(0)).toBe(expected);
      const index = view.transcript.all().indexOf(expected!);
      expect(view.selectionTop() - view.transcript.render(size.columns - 1).owners.indexOf(index)).toBe(offset);
    }
  });

  it('keeps following the end when later input reaches it before paint', () => {
    const { view } = fixture();
    view.scrollPage(-1); view.scroll(1_000_000);
    view.renderFrame(size);
    expect(view.scrolledBack).toBe(0);
    expect(view.renderFrame(size).rows.join('\n')).toContain('History 204');
  });

  it.each([false, true])('handles a short painted window with explicit end %s', end => {
    const transcript = new Transcript();
    transcript.retainEarlier(Array.from({ length: 60 }, (_, index) => ({
      kind: 'notice' as const, text: 'Retained ' + index, finalized: true,
    })));
    const first = transcript.append({ kind: 'notice', text: 'First visible', finalized: true });
    const last = transcript.append({ kind: 'notice', text: 'Last visible', finalized: true });
    const pane = new TranscriptPane(transcript);
    const capacity = transcript.rowCount(59);
    pane.render(60, capacity, undefined);
    expect(pane.selectionTop()).toBe(0);
    expect(pane.scrolledBack).toBe(0);
    expect(pane.scrollPage(-1)).toBe(true);
    if (end) { pane.scrollToEnd(); pane.scrollPage(1); }
    // Appending after the input makes following the end differ from the retained anchor.
    const tail = transcript.append({ kind: 'notice', text: 'New tail', finalized: true });
    pane.render(60, capacity, undefined);
    expect(pane.blockAtScreenRow(0)).toBe(end ? last : first);
    expect(pane.scrolledBack).toBe(end ? 0 : transcript.render(59).owners.filter(owner => transcript.blockAt(owner) === tail).length);
  });

  it('keeps hit testing on the painted blocks across a prepend and an end command', () => {
    const { view } = fixture();
    const anchor = view.blockAtScreenRow(0);
    view.scrollPage(-1);
    expect(view.blockAtScreenRow(0)).toBe(anchor);
    view.scrollToEnd();
    expect(view.blockAtScreenRow(0)).toBe(anchor);
    const sizeAfterPage = view.transcript.all().length;
    view.scrollPage(-1);
    expect(view.transcript.all()).toHaveLength(sizeAfterPage);
    const pendingTarget = view.selectionTop();
    const oldRows = view.transcript.render(size.columns - 1);
    const shiftedTarget = oldRows.owners.indexOf(60) + pendingTarget;
    const expected = view.transcript.blockAt(oldRows.owners[shiftedTarget]!);
    view.renderFrame(size);
    expect(view.selectionTop()).toBe(shiftedTarget);
    expect(view.blockAtScreenRow(0)).toBe(expected);
    view.transcript.clear();
    view.transcript.append({ kind: 'tool', text: 'different block', collapsed: true, finalized: true });
    expect(view.blockAtScreenRow(0)).toBeUndefined();
  });

  it.each(['document', 'width', 'height', 'capacity', 'overlay', 'invalidated'] as const)('does not reveal from a %s frame', unavailable => {
    const { view, live } = fixture();
    const before = view.transcript.all().length;
    if (unavailable === 'document') view.renderFrame(size, 'document');
    if (unavailable === 'width') view.renderFrame({ ...size, columns: 0 });
    if (unavailable === 'height') view.renderFrame({ ...size, rows: 0 });
    if (unavailable === 'capacity') view.renderFrame({ ...size, rows: 1 });
    if (unavailable === 'overlay') { live.fullScreen = true; view.renderFrame(size); }
    if (unavailable === 'invalidated') view.invalidateLayout();
    view.scrollPage(-1);
    expect(view.transcript.all()).toHaveLength(before);
    live.fullScreen = false;
    view.renderFrame(size); view.scroll(-1_000_000); view.renderFrame(size); view.scrollPage(-1);
    expect(view.transcript.all()).toHaveLength(before + 60);
  });

  it('retains a pending source anchor across an unavailable frame', () => {
    const { view, live } = fixture();
    const anchor = view.blockAtScreenRow(0);
    view.scrollPage(-1);
    live.fullScreen = true; view.renderFrame(size); view.scrollPage(-1);
    live.fullScreen = false; view.renderFrame(size);
    expect(view.blockAtScreenRow(0)).toBe(anchor);
  });

  it('drops retained pages and pending anchors when the conversation is replaced', () => {
    const { view } = fixture();
    const before = view.transcript.all();
    view.scrollPage(-1);
    view.transcript.clear();
    view.transcript.append({ kind: 'user', text: 'Replacement', finalized: true });
    view.renderFrame(size);
    expect(view.transcript.all()).not.toBe(before);
    expect(view.scrollPage(-1)).toBe(false);
    expect([...view.transcript.copySources()]).toEqual(view.transcript.all());
    expect(view.renderFrame(size).rows.join('\n')).not.toContain('History');
  });
});
