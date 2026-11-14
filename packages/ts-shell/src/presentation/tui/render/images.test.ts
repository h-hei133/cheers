import { describe, expect, it } from 'vitest';
import { pngImage } from '../../../test-utils/image.js';
import { inlineImageRows } from '../image.js';
import { setCellDimensions } from '../imageDimensions.js';
import { stripAnsi } from '../text/ansi.js';
import { visibleWidth } from '../text/measure.js';
import { renderBlock } from '../transcript/blocks.js';
import { highlightSelection } from '../transcript/selection.js';
import { imagePaintPosition, separateImageRows } from './images.js';

describe('image painting geometry', () => {
  it.each(['kitty', 'iterm2'] as const)('separates %s controls from selected user background and scrollbar', protocol => {
    setCellDimensions({ widthPx: 9, heightPx: 18 });
    const rows = renderBlock({ kind: 'user', text: '', finalized: true, images: [pngImage(320, 161)] }, 40, { imageProtocol: protocol });
    const shaded = highlightSelection(rows, { from: { row: 0, column: 1 }, to: { row: 10, column: 38 } }).map(row => `${row}|`);
    const separated = separateImageRows(shaded);
    expect(separated.images).toHaveLength(1);
    expect(separated.images[0]).toMatchObject({ column: 0, top: 0, bottom: 11, row: protocol === 'kitty' ? 0 : 10 });
    const text = separated.text[separated.images[0]!.row]!;
    expect(text).not.toContain('\r');
    expect(text).not.toContain('\x1b_G');
    expect(text).not.toContain('\x1b]1337;File=');
    expect(visibleWidth(text)).toBe(41);
    expect(stripAnsi(text)).toBe(`${' '.repeat(40)}|`);
    expect(imagePaintPosition(separated.images[0]!)).toBe(`\x1b[${protocol === 'kitty' ? 1 : 11};1H`);
  });

  it('retains two placements of the same image and their independent row positions', () => {
    const rows = inlineImageRows(pngImage(80, 80), 'kitty', 4)!;
    const separated = separateImageRows([...rows, 'between', ...rows]);
    expect(separated.images).toHaveLength(2);
    expect(separated.images[0]?.sequence).toBe(separated.images[1]?.sequence);
    expect(separated.images.map(image => image.row)).toEqual([0, rows.length + 1]);
  });

  it('honors a column reanchor when a cropped image starts above the viewport', () => {
    const graphic = inlineImageRows(pngImage(80, 80), 'kitty', 4)![0]!;
    const separated = separateImageRows([`${' '.repeat(40)}\r\x1b[3C${graphic}\x1b[0m|`]);
    expect(separated.images[0]?.column).toBe(3);
    expect(visibleWidth(separated.text[0]!)).toBe(41);
    expect(separated.text[0]).not.toContain('\r');
    expect(separated.text[0]).not.toContain('\x1b[3C');
  });
});
