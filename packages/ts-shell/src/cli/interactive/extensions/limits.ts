import { stripAnsi } from '../../../presentation/tui/text/ansi.js';

export const MAX_UI_TEXT_BYTES = 16 * 1024;
export const MAX_UI_EDITOR_BYTES = 256 * 1024;
export const MAX_UI_CHROME_BYTES = 64 * 1024;
export const MAX_UI_CHOICES = 256;
export const MAX_UI_CHOICE_BYTES = 512;
export const MAX_UI_KEY_BYTES = 512;
export const MAX_UI_WIDGET_LINES = 256;
export const INPUT_LIMIT_NOTICE = 'Extension input exceeds its size limit; text was not inserted.';

/** Reject before sanitizing, copying or constructing a layout. */
export function textBytes(text: string, limit = MAX_UI_TEXT_BYTES): number {
  if (typeof text !== 'string' || text.length > limit) throw new Error('Extension UI text exceeds its size limit.');
  const bytes = Buffer.byteLength(text, 'utf8');
  if (bytes > limit) throw new Error('Extension UI text exceeds its size limit.');
  return bytes;
}

/** Extension strings are content; terminal controls cannot become UI commands. */
export function dialogText(text: string, limit = MAX_UI_TEXT_BYTES): string {
  textBytes(text, limit);
  return stripAnsi(text).replace(/\r\n?/g, '\n').replace(/[\x00-\x08\x0b-\x1f\x7f-\x9f]/g, '');
}

export function singleLine(text: string, limit = MAX_UI_TEXT_BYTES): string {
  return dialogText(text, limit).replace(/[\n\t]/g, ' ');
}

export function captureChoices(choices: readonly string[]): readonly string[] {
  if (!Array.isArray(choices) || choices.length > MAX_UI_CHOICES) throw new Error('Extension UI accepts at most 256 choices.');
  const captured: string[] = [];
  for (let index = 0, count = choices.length; index < count; index++) {
    const value = choices[index]!;
    textBytes(value, MAX_UI_CHOICE_BYTES);
    captured.push(value);
  }
  return Object.freeze(captured);
}

/** Insertion is additive, so its limit can be checked without changing the editor. */
export function acceptInsertion(current: string, incoming: string, limit: number, notice: () => void): boolean {
  if (incoming.length > limit || current.length + incoming.length > limit
    || Buffer.byteLength(current, 'utf8') + Buffer.byteLength(incoming, 'utf8') > limit) {
    notice();
    return false;
  }
  return true;
}
