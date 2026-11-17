import { canonicalImageMime, inspectImage } from '../../model-adapters/image/input.js';
import type { ExportImage } from './model.js';

/** Export every admitted historical image; tool-call image counts do not apply to a transcript. */
export function projectExportImages(images: readonly ExportImage[] | undefined): {
  readonly images?: readonly ExportImage[]; readonly omitted: number;
} {
  const accepted: ExportImage[] = [];
  let omitted = 0;
  for (const image of images ?? []) {
    try {
      const mediaType = canonicalImageMime(image.mediaType.trim().toLowerCase());
      const data = image.data.trim();
      inspectImage({ type: 'image', mimeType: mediaType, data });
      accepted.push({ mediaType, data });
    } catch {
      omitted += 1;
    }
  }
  return { ...(accepted.length ? { images: accepted } : {}), omitted };
}
