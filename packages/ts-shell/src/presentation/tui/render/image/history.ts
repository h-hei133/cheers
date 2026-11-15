import { kittyDeleteImage, kittyPlacementFor } from '../../image.js';
import { truncateToWidth } from '../../text/layout.js';
import { separateImageRows, type ImagePaint, type ImageRows } from '../images.js';

// A native-scrollback occurrence gets its own upload ID. Re-uploading a data
// hash would erase earlier placements of the same source in retained history.
let nextImageId = 0x80000000;

interface ImageBinding {
  readonly sourceId: number;
  readonly imageId: number;
  bottom: number;
  placed: boolean;
}

interface ImageFrame extends ImageRows { readonly deletions: string }

/** Keeps only identities that can still be redrawn; the terminal owns earlier history. */
export class MainScreenImages {
  private readonly bindings = new Map<number, ImageBinding>();

  clear(visibleTop?: number): string {
    let deletions = '';
    if (visibleTop !== undefined) {
      for (const [row, binding] of this.bindings) {
        if (row >= visibleTop || !binding.placed) {
          deletions += kittyDeleteImage(binding.imageId);
        }
      }
    }
    this.bindings.clear();
    return deletions;
  }

  /** A placement crossing the history boundary must scroll out before replacement. */
  crossingBottom(top: number): number {
    let bottom = top;
    for (const [row, binding] of this.bindings) {
      if (binding.placed && row < top && binding.bottom > top) bottom = Math.max(bottom, binding.bottom);
    }
    return bottom;
  }

  append(rows: readonly string[], top: number, height: number, width: number): ImageRows {
    const separated = separateImageRows(rows);
    const text = [...separated.text];
    const images: ImagePaint[] = [];
    for (const image of separated.images) {
      if (image.top < 0 || image.bottom > rows.length || image.bottom - image.top > height) {
        text[Math.max(0, image.top)] = truncateToWidth('image (does not fit)', width);
        continue;
      }
      const sequence = this.bind(image, top, false);
      if (sequence) images.push({ ...image, sequence });
      else text[image.top] = truncateToWidth('image (unavailable)', width);
    }
    return { text, images };
  }

  visible(rows: readonly string[], top: number): ImageFrame {
    const separated = separateImageRows(rows);
    const complete = separated.images.filter(image => image.top >= 0 && image.bottom <= rows.length);
    const present = new Map(complete.filter(image => image.protocol === 'kitty')
      .map(image => [top + image.top, sourceIdOf(image.sequence)]));
    let deletions = '';
    for (const [row, binding] of this.bindings) {
      if (row < top) {
        // Text erasure cannot erase Kitty graphics. Once a placement enters
        // history, updating or deleting it would move/remove that history too.
        if (!binding.placed) deletions += kittyDeleteImage(binding.imageId);
        if (!binding.placed || binding.bottom <= top) this.bindings.delete(row);
      } else if (present.has(row) && present.get(row) !== binding.sourceId) {
        deletions += kittyDeleteImage(binding.imageId);
        this.bindings.delete(row);
      } else if (!present.has(row) && binding.placed) {
        deletions += `\x1b_Ga=d,d=i,i=${binding.imageId},p=1,q=2\x1b\\`;
        binding.placed = false;
      }
    }
    const images = complete.flatMap(image => {
      const sequence = this.bind(image, top, true);
      return sequence ? [{ ...image, sequence }] : [];
    });
    return { text: separated.text, images, deletions };
  }

  private bind(image: ImagePaint, top: number, placement: boolean): string | undefined {
    if (image.protocol !== 'kitty') return image.sequence;
    const sourceId = sourceIdOf(image.sequence);
    if (!Number.isSafeInteger(sourceId) || sourceId <= 0) return undefined;
    const row = top + image.top;
    let binding = this.bindings.get(row);
    if (!binding || binding.sourceId !== sourceId) {
      if (nextImageId > 0xffffffff) return undefined;
      binding = { sourceId, imageId: nextImageId++, bottom: top + image.bottom, placed: true };
      this.bindings.set(row, binding);
      placement = false;
    }
    binding.bottom = top + image.bottom;
    binding.placed = true;
    const sequence = image.sequence.replace(/i=\d+/, `i=${binding.imageId},p=1`);
    return placement ? kittyPlacementFor(sequence) : sequence;
  }
}

function sourceIdOf(sequence: string): number {
  return Number(/(?:,|\x1b_G)i=(\d+)/.exec(sequence)?.[1]);
}

/** Paint from the already-cleared group's last row and restore that exact cursor. */
export function appendedImageControl(image: ImagePaint, lastRow: number): string {
  const anchor = image.protocol === 'iterm2' ? image.top : image.row;
  const up = lastRow - anchor;
  const column = image.column > 0 ? `\x1b[${image.column}C` : '';
  const sequence = image.protocol === 'iterm2'
    ? image.sequence.replace(/^\x1b7(?:\x1b\[\d+A)?/, '').replace(/\x1b8$/, '') : image.sequence;
  return `\x1b7${up > 0 ? `\x1b[${up}A` : ''}\r${column}${sequence}\x1b8`;
}
