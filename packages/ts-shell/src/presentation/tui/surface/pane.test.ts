import { afterEach, describe, expect, it } from 'vitest';
import { pngImage } from '../../../test-utils/image.js';
import { kittyPlacementFor, type ImageProtocol } from '../image.js';
import { setCellDimensions } from '../imageDimensions.js';
import { stripAnsi } from '../text/ansi.js';
import { Transcript } from '../transcript/container.js';
import { TranscriptPane } from './pane.js';

afterEach(() => setCellDimensions({ widthPx: 9, heightPx: 18 }));

function picture(protocol: ImageProtocol, capacity = 4) {
  setCellDimensions({ widthPx: 9, heightPx: 18 });
  const image = pngImage(320, 161);
  const transcript = new Transcript();
  transcript.append({ kind: 'user', text: '', finalized: true, images: [image] });
  transcript.append({ kind: 'notice', text: Array.from({ length: 20 }, (_, i) => `following ${i}`).join('\n'), finalized: true });
  const pane = new TranscriptPane(transcript);
  const options = { imageProtocol: protocol };
  const original = [...transcript.render(40, options).rows];
  pane.render(41, capacity, undefined, undefined, options);
  return {
    image, transcript, original, pane,
    at(top: number) {
      pane.scrollToContentRow(top + Math.floor(capacity / 3));
      const rows = pane.render(41, capacity, undefined, undefined, options);
      expect(pane.screenToContent(0, 0).row).toBe(top);
      return rows;
    },
  };
}

describe('transcript image viewport', () => {
  it.each([
    { top: 0, rows: 4, y: 0, height: 59 },
    { top: 3, rows: 4, y: 43, height: 60 },
    { top: 9, rows: 2, y: 131, height: 30 },
  ])('crops source pixels and reanchors Kitty at top $top', ({ top, rows: extent, y, height }) => {
    const fixture = picture('kitty');
    const rows = fixture.at(top);
    const controls = /\x1b_G([^;]*);/.exec(rows[0]!)?.[1]?.split(',');
    expect(controls).toContain(`r=${extent}`);
    expect(controls).toContain(`y=${y}`);
    expect(controls).toContain(`h=${height}`);
    expect(controls).toContain('C=1');
    expect(rows.join('')).toContain(fixture.image.data);
    expect(kittyPlacementFor(rows[0]!)).toContain(`y=${y},h=${height},r=${extent}`);
    expect(fixture.pane.blockAtScreenRow(0)?.kind).toBe('user');
    if (top === 9) expect(stripAnsi(rows[3]!)).toContain('following 0');
    expect(fixture.transcript.render(40, { imageProtocol: 'kitty' }).rows).toEqual(fixture.original);
  });

  it.each([0, 3, 9])('uses an explicit iTerm fallback when clipped at top %i', top => {
    const fixture = picture('iterm2');
    const rows = fixture.at(top);
    expect(stripAnsi(rows[0]!)).toContain('image (partially visible)');
    expect(rows.join('')).not.toContain('\x1b]1337;File=');
    expect(rows.join('')).not.toContain('\x1b7');
    expect(rows.join('')).not.toContain('\x1b8');
    expect(rows.join('')).not.toContain('\r');
    expect(fixture.transcript.render(40, { imageProtocol: 'iterm2' }).rows).toEqual(fixture.original);
  });

  it('keeps a fully visible iTerm image and its cursor protection', () => {
    const fixture = picture('iterm2', 15);
    const rows = fixture.at(0);
    expect(rows[10]).toContain('\x1b7\x1b[10A\x1b]1337;File=');
    expect(rows[10]).toContain('height=11');
    expect(rows[10]).toContain(fixture.image.data);
    expect(rows[10]).toContain('\x1b8');
    expect(rows.join('')).not.toContain('partially visible');
  });

  it('does not resurrect a picture completely above the viewport', () => {
    const rows = picture('kitty').at(12);
    expect(rows.join('')).not.toContain('\x1b_G');
    expect(rows.join('')).not.toContain('partially visible');
    expect(stripAnsi(rows[0]!)).toContain('following 0');
  });
});
