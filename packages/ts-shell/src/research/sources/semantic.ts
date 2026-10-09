import type { RequestScope } from '../../core/network/request.js';
import { NetworkError } from '../../core/network/error.js';
import { isRecord } from '../../core/values/record.js';
import { sourceBody, sourceJson, type SourceTransport, type SourceBody } from './http.js';
import { record, requiredText, optionalText, array, publicLocator, doi, arxiv } from './fields.js';
import type { PaperItem, PaperRequest, PaperResponse } from './model.js';

const fields = 'paperId,title,abstract,url,externalIds,authors,publicationDate,openAccessPdf';

export async function semantic(request: PaperRequest, scope: RequestScope, cursor?: string, transport?: SourceTransport): Promise<PaperResponse & { readonly body: SourceBody }> {
  const key = process.env.SEMANTIC_SCHOLAR_API_KEY?.trim();
  const headers = key ? { 'x-api-key': key } : undefined;
  let url: URL;
  if (request.action === 'search') {
    url = new URL('https://api.semanticscholar.org/graph/v1/paper/search'); url.searchParams.set('query', request.query ?? '');
  } else {
    const raw = request.identifier ?? '';
    const paperId = doi(raw) ? `DOI:${doi(raw)}` : arxiv(raw) ? `ARXIV:${arxiv(raw)}` : raw;
    if (!/^(?:[a-f0-9]{40}|(?:DOI|ARXIV):.+|CorpusId:\d+)$/i.test(paperId)) throw new NetworkError('invalid_response');
    url = new URL(`https://api.semanticscholar.org/graph/v1/paper/${encodeURIComponent(paperId)}${request.action === 'lookup' ? '' : `/${request.action}`}`);
  }
  url.searchParams.set('fields', fields);
  if (request.action !== 'lookup') { url.searchParams.set('limit', String(request.numResults)); url.searchParams.set('offset', cursor ?? '0'); }
  const body = await sourceBody(url.href, scope, { headers, provider: 'semantic-scholar', spacingMs: 1000, transport });
  const value = record(sourceJson(body));
  if (request.action === 'lookup') return { items: [semanticItem(value)], body };
  const items = array(value.data).slice(0, request.numResults).map(item => {
    const row = record(item);
    return semanticItem(request.action === 'citations' ? row.citingPaper : request.action === 'references' ? row.citedPaper : row);
  });
  const next = Number.isSafeInteger(value.next) && (value.next as number) >= 0 ? String(value.next) : undefined;
  return { items, ...(next ? { next } : {}), body };
}

function semanticItem(value: unknown): PaperItem {
  const item = record(value); const id = requiredText(item.paperId);
  if (!/^[a-f0-9]{40}$/i.test(id)) throw new NetworkError('invalid_response');
  const identifiers = isRecord(item.externalIds) ? item.externalIds : {};
  const pdf = isRecord(item.openAccessPdf) ? publicLocator(item.openAccessPdf.url) : undefined;
  const doiId = doi(identifiers.DOI), arxivId = arxiv(identifiers.ArXiv);
  const abstract = optionalText(item.abstract);
  return { provider: 'semantic-scholar', id, title: requiredText(item.title), url: publicLocator(item.url) ?? `https://www.semanticscholar.org/paper/${id}`,
    ...(doiId ? { doi: doiId } : {}), ...(arxivId ? { arxiv: arxivId } : {}), ...(abstract ? { abstract } : {}),
    ...(optionalText(item.publicationDate) ? { publishedAt: optionalText(item.publicationDate)! } : {}),
    authors: array(item.authors ?? [], 300).slice(0, 40).flatMap(author => { const name = optionalText(record(author).name); return name ? [name] : []; }),
    fulltextUrls: pdf ? [pdf] : [], references: [], fields: Object.keys(item).filter(key => item[key] !== null),
    limits: ['Retraction/revision status is unknown unless provided by a separately read source.', 'Metadata and abstract are not fulltext method/evaluation evidence.'] };
}
