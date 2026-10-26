import { createHash } from 'node:crypto';
import type { ImageContent } from '../../model-adapters/multimodal.js';

interface AttachmentBindingInput {
  readonly images: readonly ImageContent[];
}

/** Bind prompt images without retaining their raw bytes in a reservation. */
export function attachmentBinding(attachments?: AttachmentBindingInput): string {
  if (!attachments?.images.length) return '';
  const digest = createHash('sha256');
  for (const image of attachments.images) {
    digest.update(image.type);
    digest.update('\0');
    digest.update(image.mimeType);
    digest.update('\0');
    digest.update(image.data);
    digest.update('\0');
  }
  return digest.digest('hex');
}
