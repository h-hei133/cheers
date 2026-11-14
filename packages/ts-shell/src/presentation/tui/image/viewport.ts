import { imageSequencesIn, type ImageSequence } from '../image.js';
import { visibleWidth } from '../text/measure.js';
import { truncateToWidth } from '../text/layout.js';

/** Crop source pixels, retaining the original payload and transmission identity. */
function cropKitty(image: ImageSequence, hiddenRows: number, visibleRows: number): string | undefined {
  if (image.heightPx === undefined) return undefined;
  const match = /^\x1b_G([^;]*);/.exec(image.sequence);
  if (!match) return undefined;
  const y = Math.floor(image.heightPx * hiddenRows / image.rows);
  const end = Math.ceil(image.heightPx * (hiddenRows + visibleRows) / image.rows);
  const controls = match[1]!.split(',').filter(control => !/^(?:y|h|r)=/.test(control));
  controls.push(`y=${y}`, `h=${end - y}`, `r=${visibleRows}`);
  return `\x1b_G${controls.join(',')};${image.sequence.slice(match[0].length)}`;
}

/** Slice a viewport while retaining any graphics extent that crosses its boundaries. */
export function clipImageRows(rows: readonly string[], top: number, capacity: number, width: number): string[] {
  const visible = rows.slice(top, top + capacity);
  if (visible.length === 0) return visible;
  const bottom = top + visible.length;
  // The image owner bounds reservations to 48 rows. Inspect only possible
  // anchors around this viewport, keeping long immutable history out of paint.
  for (let anchor = Math.max(0, top - 47); anchor < Math.min(rows.length, bottom + 47); anchor++) {
    const row = rows[anchor]!;
    const images = imageSequencesIn(row);
    for (let index = images.length - 1; index >= 0; index--) {
      const image = images[index]!;
      const start = anchor - image.rowOffset;
      const end = start + image.rows;
      const visibleStart = Math.max(top, start);
      const visibleEnd = Math.min(bottom, end);
      if (visibleStart >= visibleEnd || (start >= top && end <= bottom)) continue;
      const cropped = image.protocol === 'kitty' ? cropKitty(image, visibleStart - start, visibleEnd - visibleStart) : undefined;
      if (anchor >= top && anchor < bottom) {
        const old = visible[anchor - top]!;
        const prefix = old.slice(0, image.start);
        visible[anchor - top] = (cropped ? prefix : prefix.replace(/\r(?:\x1b\[\d+C)?$/, ''))
          + (cropped ?? '') + old.slice(image.end);
      }
      if (!cropped) {
        visible[visibleStart - top] = truncateToWidth('image (partially visible)', Math.max(1, width));
      } else if (anchor < top) {
        const prefix = row.slice(0, image.start);
        const column = visibleWidth(prefix.slice(prefix.lastIndexOf('\r') + 1));
        visible[visibleStart - top] += `\r${column > 0 ? `\x1b[${column}C` : ''}${cropped}`;
      }
    }
  }
  return visible;
}

/** An overlay touching any reserved image row suppresses the complete control. */
export function suppressOccludedImages(rows: string[], top: number, capacity: number): void {
  const bottom = Math.min(rows.length, top + capacity);
  if (bottom <= Math.max(0, top)) return;
  for (let anchor = 0; anchor < rows.length; anchor++) {
    const row = rows[anchor]!;
    const images = imageSequencesIn(row);
    for (let index = images.length - 1; index >= 0; index--) {
      const image = images[index]!;
      const start = anchor - image.rowOffset;
      if (start >= bottom || start + image.rows <= top) continue;
      const current = rows[anchor]!;
      // The background was printed before this CR/cursor reanchor. Once the
      // image is gone, retaining that move would relocate subsequent overlay
      // text and its erase-to-end control to the left edge of the screen.
      const prefix = current.slice(0, image.start).replace(/\r(?:\x1b\[\d+C)?$/, '');
      rows[anchor] = prefix + current.slice(image.end);
    }
  }
}
