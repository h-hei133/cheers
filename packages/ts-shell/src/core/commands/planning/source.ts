import { scanCommandArgs } from '../arguments.js';

/** Preserve literal source after control words, including shell quotes and line breaks. */
export function planningBody(raw: string | undefined, skip: number, fallback: readonly string[]): string {
  if (raw === undefined) return fallback.join(' ');
  const tokens = scanCommandArgs(raw);
  const first = tokens[skip];
  return first ? raw.slice(first.from) : '';
}

/** A command criterion has an explicit separator; flags are never inferred from shell source. */
export function criterionCommand(raw: string | undefined): string | undefined {
  if (raw === undefined) return undefined;
  const separator = scanCommandArgs(raw).find(token => token.value === '--' && raw.slice(token.from, token.to) === '--');
  return separator ? raw.slice(separator.to).replace(/^\s+/, '') : undefined;
}
