import type { TextSize } from './model.js';

/** UTF-8 bytes and JavaScript UTF-16 code units are separate measured quantities. */
export function textSize(text: string): TextSize {
  return Object.freeze({ bytes: Buffer.byteLength(text, 'utf8'), codeUnits: text.length });
}
