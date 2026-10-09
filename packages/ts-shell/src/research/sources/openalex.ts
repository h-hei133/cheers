import type { RequestScope } from '../../core/network/request.js';
import { NetworkError } from '../../core/network/error.js';
import { isRecord } from '../../core/values/record.js';
import { sourceBody, sourceJson, type SourceTransport, type SourceBody } from './http.js';
import { record, requiredText, optionalText, array, publicLocator, doi } from './fields.js';
import type { PaperItem, PaperRequest, PaperResponse } from './model.js';

export async function openalex(request: PaperRequest, scope: RequestScope, cursor?: string, transport?: SourceTransport): Promise<PaperResponse & { readonly body: SourceBody }> {
  const key = process.env.OPENALEX_API_KEY?.trim();
  const headers = key ? { Authorization: `Bearer ${key}` } : undefined;
  let url = new URL('https://api.openalex.org/works');
  if (request.action === 'search') {
    url.searchParams.set('search', request.query ?? '');
  } else {
    const identifier = request.identifier ?? '';
    const normalized = doi(identifier);
    if (!normalized && !/^W\d+$/.test(identifier)) throw new NetworkError('invalid_response');
    url = new URL(`https://api.openalex.org/works/${encodeURIComponent(normalized ? `https://doi.org/${normalized}` : identifier)}`);
    if (request.action !== 'lookup') {
      const resolved = await sourceBody(url.href, scope, { headers, provider: 'openalex', spacingMs: 200, transport });
      const item = record(sourceJson(resolved));
      const id = requiredText(item.id).split('/').at(-1)!;
      if (!/^W\d+$/.test(id)) throw new NetworkError('invalid_response');
      url = new URL('https://api.openalex.org/works');
      if (request.action === 'citations') url.searchParams.set('filter', `cites:${id}`);
      else {
        const ids = array(item.referenced_works ?? []).map(id => requiredText(id).split('/').at(-1)!).filter(id => /^W\d+$/.test(id));
        if (!ids.length) return { items: [], body: resolved };
        url.searchParams.set('filter', `openalex:${ids.slice(0, 50).join('|')}`);
      }
    }
  }
  if (request.action !== 'lookup') { url.searchParams.set('per_page', String(request.numResults)); url.searchParams.set('cursor', cursor ?? '*'); }
  const body = await sourceBody(url.href, scope, { headers, provider: 'openalex', spacingMs: 200, transport });
  const value = record(sourceJson(body));
  if (request.action === 'lookup') return { items: [openalexItem(value)], body };
  const items = array(value.results).slice(0, request.numResults).map(openalexItem);
  const next = isRecord(value.meta) ? optionalText(value.meta.next_cursor, 2048) : undefined;
  return { items, ...(next ? { next } : {}), body };
}

function openalexItem(value: unknown): PaperItem {
  const item = record(value);
  const id = requiredText(item.id);
  if (!/^https:\/\/openalex\.org\/W\d+$/.test(id)) throw new NetworkError('invalid_response');
  const identifiers = isRecord(item.ids) ? item.ids : {};
  const locations = [item.best_oa_location, item.primary_location, ...(Array.isArray(item.locations) ? array(item.locations, 100) : [])].filter(isRecord);
  const urls = [...new Set(locations.flatMap(location => [publicLocator(location.pdf_url), publicLocator(location.landing_page_url)]).filter((value): value is string => !!value))].slice(0, 8);
  const abstract = invertedAbstract(item.abstract_inverted_index);
  const doiId = doi(item.doi ?? identifiers.doi);
  return { provider: 'openalex', id, title: requiredText(item.title ?? item.display_name), url: urls[0] ?? id,
    ...(doiId ? { doi: doiId } : {}), ...(abstract ? { abstract } : {}),
    ...(optionalText(item.publication_date) ? { publishedAt: optionalText(item.publication_date)! } : {}),
    ...(optionalText(item.updated_date) ? { updatedAt: optionalText(item.updated_date)! } : {}),
    authors: array(item.authorships ?? [], 300).slice(0, 40).flatMap(authorship => {
      const row = record(authorship); const author = isRecord(row.author) ? optionalText(row.author.display_name) : undefined;
      return author ? [author] : [];
    }), fulltextUrls: urls,
    references: array(item.referenced_works ?? [], 2000).slice(0, 100).map(id => requiredText(id)),
    ...(typeof item.is_retracted === 'boolean' ? { retracted: item.is_retracted } : {}),
    fields: Object.keys(item).filter(key => item[key] !== null),
    limits: ['Metadata and discovered locations do not prove fulltext access or method/evaluation support.', ...(abstract ? [] : ['Abstract unavailable.'])] };
}

function invertedAbstract(value: unknown): string | undefined {
  if (value === null || value === undefined) return undefined;
  const index = record(value); const words: Array<readonly [number, string]> = [];
  for (const [word, positions] of Object.entries(index)) {
    for (const position of array(positions, 1000)) {
      if (!Number.isSafeInteger(position) || (position as number) < 0 || (position as number) > 10000) throw new NetworkError('invalid_response');
      words.push([position as number, word]); if (words.length > 10000) throw new NetworkError('invalid_response');
    }
  }
  return words.sort((a, b) => a[0] - b[0]).map(([, word]) => word).join(' ').slice(0, 16000) || undefined;
}
