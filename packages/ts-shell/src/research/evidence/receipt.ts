import type { SourceRecord } from './model.js';

export function sourceReceipt(sources: readonly SourceRecord[]): string {
  let remaining = 1400; const visible: unknown[] = [];
  for (const source of sources) {
    const value = { sourceId: source.id, status: source.status, contentHash: source.contentHash,
      excerpts: source.excerpts.map(excerpt => ({ excerptId: excerpt.id, location: excerpt.location, quote: excerpt.text.slice(0, 160) })), limits: source.limits };
    const text = JSON.stringify(value);
    if (text.length > remaining) break;
    remaining -= text.length; visible.push(value);
  }
  return `[Research sources]\n${JSON.stringify({ sources: visible, omitted: sources.length - visible.length,
    notice: 'Only actual native source/excerpt IDs may be cited. Quotes refer to retained extracted text; omitted records require bounded context or authorized re-read. Acquisition does not prove truth.' })}`;
}
