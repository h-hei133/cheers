import { imageSequencesIn, type ImageProtocol } from '../image.js';
import { visibleWidth } from '../text/measure.js';
import { moveTo } from './paint.js';

export interface ImagePaint {
  readonly row: number;
  readonly column: number;
  readonly top: number;
  readonly bottom: number;
  readonly protocol: ImageProtocol;
  readonly sequence: string;
}

export interface ImageRows {
  readonly text: readonly string[];
  readonly images: readonly ImagePaint[];
}

/** Keep printable background/decorators separate from controls that draw over cells. */
export function separateImageRows(rows: readonly string[]): ImageRows {
  const text: string[] = [];
  const images: ImagePaint[] = [];
  for (let rowIndex = 0; rowIndex < rows.length; rowIndex++) {
    const row = rows[rowIndex]!;
    const controls = imageSequencesIn(row);
    let stripped = row;
    for (let index = controls.length - 1; index >= 0; index--) {
      const image = controls[index]!;
      const prefix = row.slice(0, image.start);
      const lastReturn = prefix.lastIndexOf('\r');
      const anchor = prefix.slice(lastReturn + 1);
      const column = visibleWidth(anchor) + Number(/\x1b\[(\d+)C/.exec(anchor)?.[1] ?? 0);
      const top = rowIndex - image.rowOffset;
      images.push({ row: rowIndex, column, top, bottom: top + image.rows, protocol: image.protocol, sequence: image.sequence });
      stripped = stripped.slice(0, image.start).replace(/\r(?:\x1b\[\d+C)?$/, '') + stripped.slice(image.end);
    }
    text.push(stripped);
  }
  images.sort((a, b) => a.row - b.row || a.column - b.column);
  return { text, images };
}

/** A changed anchor or covered row requires restoring the complete image layer. */
export function imageRowsChanged(previous: readonly string[], next: readonly string[], images: readonly ImagePaint[]): boolean {
  for (const image of images) {
    if (previous[image.row] !== next[image.row]) return true;
    for (let row = Math.max(0, image.top); row < Math.min(Math.max(previous.length, next.length), image.bottom); row++) {
      if (previous[row] !== next[row]) return true;
    }
  }
  return false;
}

/** Clear individual rows, retaining uploaded graphics that ED can release. */
export function* imageTextFragments(rows: readonly string[], height: number): IterableIterator<string> {
  for (let row = 0; row < height; row++) {
    yield `${moveTo(row, 0)}\x1b[2K`;
    yield rows[row] ?? '';
  }
}

/** Position only; the graphics protocol owns any protected cursor movement. */
export function imagePaintPosition(image: ImagePaint): string {
  return moveTo(image.row, image.column);
}
