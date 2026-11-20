import * as image from './image.js';
import * as pdf from './pdf.js';

const decoders = { ...image, ...pdf } satisfies typeof import('../api.d.ts');
export const { readImage, readPdf, resizeInlineImage } = decoders;
