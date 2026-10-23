import type { Transcript } from '../../../../presentation/tui/transcript/container.js';

/** An opening owns every admitted source; excess is refused without clipping. */
export const COPY_LIMITS = Object.freeze({ blocks: 20_000, textUnits: 32 * 1024 * 1024 });

export interface CopyEntry {
  readonly id: string;
  readonly label: string;
  readonly text: string;
}

/** One source snapshot and one matching-reference cache shared by its pages. */
export class CopySource {
  private readonly entries: CopyEntry[] = [];
  private needle = '';
  private matches: readonly CopyEntry[] = this.entries;

  constructor(transcript: Transcript, signal?: AbortSignal) {
    let blocks = 0;
    let units = 0;
    for (const block of transcript.copySources()) {
      signal?.throwIfAborted();
      const label = block.title ? `${block.kind} ${block.title}` : block.kind;
      units += block.text.length + label.length;
      if (++blocks > COPY_LIMITS.blocks || units > COPY_LIMITS.textUnits) {
        throw new Error('Transcript exceeds copy browsing limits. No source was selected.');
      }
      if (block.text.trim()) this.entries.push({ id: '', label, text: block.text });
    }
    this.entries.reverse();
    for (let index = 0; index < this.entries.length; index++) this.entries[index] = { ...this.entries[index]!, id: String(index) };
  }

  page(query: string, offset: number, size: number): { readonly entries: readonly CopyEntry[]; readonly total: number } {
    if (query !== this.needle) {
      this.needle = query;
      this.matches = query ? this.entries.filter(entry => `${entry.label} ${entry.text}`.toLowerCase().includes(query)) : this.entries;
    }
    return { entries: this.matches.slice(offset, offset + size), total: this.matches.length };
  }
}

/** Read only as far as the first non-empty line; later lines need no array. */
export function copySummary(text: string): string {
  let start = 0;
  while (start < text.length) {
    const newline = text.indexOf('\n', start);
    const end = newline < 0 ? text.length : newline;
    const line = text.slice(start, end).trim();
    if (line) return line.length > 70 ? `${line.slice(0, 69)}…` : line;
    start = end + 1;
  }
  return '';
}
