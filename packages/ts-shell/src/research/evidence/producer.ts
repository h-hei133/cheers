import { createHash } from 'node:crypto';
import type { AfterToolCallContext } from '../../core/agent/tools.js';
import { isRecord } from '../../core/values/record.js';
import { redactReportText } from '../../core/security/redaction.js';
import { neutraliseForDisplay } from '../../core/text/safety.js';
import type { SourceRecord, SourceExcerpt } from './model.js';
import type { PaperItem } from '../sources/model.js';

export function toolSources(context: AfterToolCallContext, childId: string, briefRevision: number): SourceRecord[] {
  const metadata = context.result.metadata;
  const paper = metadata && isRecord(metadata.paper) ? metadata.paper : undefined;
  if (paper && Array.isArray(paper.items)) return paper.items.slice(0, 60).filter(isRecord).map(item => paperSource(item as unknown as PaperItem, context, childId, briefRevision));
  if (!['read', 'web_fetch', 'document_read'].includes(context.call.name)) return [];
  const provenance = metadata && isRecord(metadata.provenance) ? metadata.provenance : {};
  const locator = String(provenance.originalUrl ?? provenance.locator ?? context.args.url ?? context.args.path ?? context.call.name);
  const media = metadata && isRecord(metadata.media) ? metadata.media : undefined;
  const read = metadata && isRecord(metadata.read) ? metadata.read : undefined;
  const digest = hashString(media?.sourceHash ?? provenance.contentHash);
  const truncated = metadata?.truncated === true || read?.stopReason !== undefined || media?.nextOffset !== undefined;
  const noText = metadata?.empty === true || media && Array.isArray(media.pages) && media.pages.every(page => isRecord(page) && page.status === 'no-text');
  const failure = context.isError ? safeFailure(metadata) : undefined;
  const bodyAvailable = media?.kind === 'pdf' ? Array.isArray(media.pages) : typeof read?.text === 'string';
  const excerpts = context.isError ? [] : media?.kind === 'pdf' ? pdfExcerpts(media) : textExcerpts(read, String(provenance.location ?? 'extracted-lines'));
  const id = `s-${digestOf(`${locator}\n${digest ?? context.call.id}\n${JSON.stringify(excerpts)}`).slice(0, 20)}`;
  return [{ id, kind: typeof context.args.path === 'string' ? 'file' : 'web', provider: context.call.name,
    locator: safeText(locator, 4096), ...(typeof provenance.finalUrl === 'string' ? { finalLocator: safeText(provenance.finalUrl, 4096) } : {}),
    fetchedAt: typeof provenance.fetchedAt === 'string' ? provenance.fetchedAt : new Date().toISOString(),
    callId: context.call.id, childId, briefRevision,
    status: context.isError ? failure?.includes('denied') ? 'restricted' : 'failed' : noText ? 'no-text' : !digest || !bodyAvailable ? 'failed' : truncated ? 'truncated' : 'read',
    ...(digest ? { contentHash: digest } : {}), hashScope: media?.kind === 'pdf' ? 'source-bytes' : String(provenance.hashScope ?? 'source-bytes'),
    readKey: JSON.stringify({ offset: context.args.offset ?? 1, limit: context.args.limit ?? (media?.kind === 'pdf' ? 5 : 500) }),
    ...(typeof provenance.mime === 'string' && provenance.mime ? { mime: safeText(provenance.mime, 128) } : {}),
    ...(typeof media?.sourceBytes === 'number' || typeof provenance.bytes === 'number' ? { bytes: Number(media?.sourceBytes ?? provenance.bytes) } : {}),
    parser: String(provenance.parser ?? media?.extraction ?? 'unknown'), replicas: [], excerpts: digest ? excerpts : [],
    limits: [...(truncated ? ['Only bounded selected text was read; unselected content is uncovered.'] : []),
      ...(media?.kind === 'pdf' ? [`Selected pages ${media.startPage}-${media.endPage} of ${media.totalPages}; text-only extraction, no OCR/images/layout interpretation.`] : []),
      ...(!digest ? ['The tool did not provide content-addressed native provenance.'] : []),
      ...(!bodyAvailable && !context.isError ? ['Native source text is unavailable; display output cannot supply citable evidence.'] : []),
      ...(excerpts.reduce((sum, excerpt) => sum + excerpt.text.length, 0) >= 24000 ? ['Stored excerpts are bounded to 24000 characters.'] : [])],
    ...(failure ? { failure } : {}) }];
}

function paperSource(item: PaperItem, context: AfterToolCallContext, childId: string, briefRevision: number): SourceRecord {
  const { retrieval, ...normalized } = item;
  const projected = JSON.stringify(normalized);
  const id = `s-${digestOf(`${item.provider}:${item.id}\n${item.version ?? ''}\n${projected}`).slice(0, 20)}`;
  const metadata = [item.title, `Authors: ${item.authors.join(', ')}`, item.publishedAt ? `Published: ${item.publishedAt}` : '',
    item.doi ? `DOI: ${item.doi}` : '', item.arxiv ? `arXiv: ${item.arxiv}` : '', item.retracted === undefined ? 'Retraction status unknown.' : `Retracted: ${item.retracted}`].filter(Boolean).join('\n');
  return { id, kind: 'paper', provider: item.provider, locator: safeText(item.url, 4096), fetchedAt: new Date().toISOString(),
    callId: context.call.id, childId, briefRevision, status: item.abstract ? 'abstract' : 'metadata',
    contentHash: digestOf(projected), hashScope: 'native-metadata-projection', title: safeText(item.title, 4096),
    identifiers: { providerId: item.id, ...(item.doi ? { doi: item.doi } : {}), ...(item.arxiv ? { arxiv: item.arxiv } : {}), ...(item.version ? { version: item.version } : {}) },
    replicas: [], fulltextUrls: item.fulltextUrls.map(url => safeText(url, 4096)),
    ...(retrieval ? { retrieval: { ...retrieval, url: safeText(retrieval.url, 4096) } } : {}),
    excerpts: [{ id: 'metadata', location: 'provider metadata', text: safeText(metadata, 8000) },
      ...(item.abstract ? [{ id: 'abstract', location: 'provider abstract', text: safeText(item.abstract, 8000) }] : [])],
    limits: item.limits.map(limit => safeText(limit, 4096)) };
}

function pdfExcerpts(media: Record<string, unknown>): SourceExcerpt[] {
  if (!Array.isArray(media.pages)) return [];
  const pages = media.pages.filter(isRecord).filter(page => Number.isSafeInteger(page.page) && Number(page.page) >= Number(media.startPage)
    && Number(page.page) <= Number(media.endPage) && Number(page.page) <= Number(media.totalPages) && page.status === 'text' && typeof page.text === 'string').slice(0, 5);
  return pages.map(page => ({ id: `p${page.page}`, location: `page ${page.page} (extracted text)`,
    text: safeText(page.text as string, Math.min(8000, 24000 / Math.max(1, pages.length))) }));
}
function textExcerpts(read: Record<string, unknown> | undefined, location: string): SourceExcerpt[] {
  if (typeof read?.text !== 'string' || !Number.isSafeInteger(read.startLine) || Number(read.startLine) < 1) return [];
  const lines = read.text.split('\n');
  if (Number.isSafeInteger(read.endLine)) lines.length = Math.max(0, Math.min(lines.length, Number(read.endLine) - Number(read.startLine) + 1));
  let remaining = 24000;
  const result: SourceExcerpt[] = [];
  for (let index = 0; index < lines.length && result.length < 24 && remaining > 0; index += 20) {
    const start = Number(read?.startLine ?? 1) + index;
    const text = safeText(lines.slice(index, index + 20).join('\n'), Math.min(8000, remaining)); remaining -= text.length;
    result.push({ id: `l${start}`, location: `${location} ${start}-${start + Math.min(20, lines.length - index) - 1}`, text });
  }
  return result;
}
function hashString(value: unknown): string | undefined { return typeof value === 'string' && /^[a-f0-9]{64}$/.test(value) ? value : undefined; }
export function digestOf(text: string): string { return createHash('sha256').update(text).digest('hex'); }
export function safeText(text: string, limit = 4096): string {
  return redactReportText(text, Math.floor(limit), { preserveLines: true }).split('\n').map(neutraliseForDisplay).join('\n');
}
function safeFailure(metadata?: Record<string, unknown>): string {
  const failure = metadata && isRecord(metadata.failure) ? metadata.failure : undefined;
  return typeof failure?.code === 'string' ? safeText(failure.code, 128) : 'tool-failed';
}
