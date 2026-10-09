import { SaxesParser, type SaxesTagNS } from 'saxes';
import type { RequestScope } from '../../core/network/request.js';
import { NetworkError } from '../../core/network/error.js';
import { sourceBody, type SourceTransport, type SourceBody } from './http.js';
import { arxiv, doi, publicLocator } from './fields.js';
import type { PaperItem, PaperRequest, PaperResponse } from './model.js';

export async function arxivSearch(request: PaperRequest, scope: RequestScope, cursor?: string, transport?: SourceTransport): Promise<PaperResponse & { readonly body: SourceBody }> {
  if (request.action === 'references' || request.action === 'citations') throw new NetworkError('invalid_response');
  const url = new URL('https://export.arxiv.org/api/query');
  if (request.action === 'lookup') {
    const id = arxiv(request.identifier); if (!id) throw new NetworkError('invalid_response'); url.searchParams.set('id_list', id);
  } else url.searchParams.set('search_query', `all:${request.query ?? ''}`);
  const start = cursor ? Number(cursor) : 0;
  if (!Number.isSafeInteger(start) || start < 0 || start > 1000) throw new NetworkError('invalid_response');
  url.searchParams.set('start', String(start)); url.searchParams.set('max_results', String(request.numResults));
  const body = await sourceBody(url.href, scope, { provider: 'arxiv', spacingMs: 3000, transport });
  const parsed = parseAtom(new TextDecoder().decode(body.bytes), request.numResults, scope);
  const next = start + parsed.items.length < parsed.total && parsed.items.length > 0 ? String(start + parsed.items.length) : undefined;
  return { items: parsed.items, ...(next ? { next } : {}), body };
}

export function parseAtom(xml: string, limit: number, scope: Pick<RequestScope, 'check'>): { readonly items: readonly PaperItem[]; readonly total: number } {
  const parser = new SaxesParser({ xmlns: true });
  const stack: string[] = []; let field = '', author = '', total = 0;
  let entry: Record<string, string> | undefined; let authors: string[] = [], urls: string[] = [];
  const items: PaperItem[] = [];
  parser.on('doctype', () => { throw new NetworkError('invalid_response'); });
  parser.on('error', () => { throw new NetworkError('invalid_response'); });
  parser.on('opentag', tag => {
    scope.check(); stack.push(tag.local); field = '';
    if (stack.length > 24) throw new NetworkError('invalid_response');
    if (stack.length === 1 && (tag.local !== 'feed' || tag.uri !== 'http://www.w3.org/2005/Atom')) throw new NetworkError('invalid_response');
    if (['entry', 'id', 'title', 'summary', 'published', 'updated', 'author', 'name', 'link'].includes(tag.local)
      && tag.uri !== 'http://www.w3.org/2005/Atom') throw new NetworkError('invalid_response');
    if (tag.local === 'entry') { if (entry) throw new NetworkError('invalid_response'); entry = {}; authors = []; urls = []; }
    if (entry && tag.local === 'link') {
      const href = publicLocator(attribute(tag, 'href'));
      if (href && (attribute(tag, 'type') === 'application/pdf' || attribute(tag, 'rel') === 'alternate')) urls.push(href);
    }
  });
  parser.on('text', text => { field += text; if (field.length > 24_000) throw new NetworkError('invalid_response'); });
  parser.on('cdata', text => { field += text; if (field.length > 24_000) throw new NetworkError('invalid_response'); });
  parser.on('closetag', tag => {
    scope.check(); const name = tag.local, parent = stack.at(-2), text = field.replace(/\s+/g, ' ').trim();
    if (name === 'totalResults') { total = Number(text); if (!Number.isSafeInteger(total) || total < 0) throw new NetworkError('invalid_response'); }
    if (entry && parent === 'entry' && ['id', 'title', 'summary', 'published', 'updated', 'doi'].includes(name)) entry[name] = text;
    if (entry && name === 'name' && parent === 'author') author = text;
    if (entry && name === 'author' && author) { authors.push(author); author = ''; }
    if (name === 'entry') {
      if (!entry || items.length >= limit) throw new NetworkError('invalid_response');
      const id = arxiv(entry.id); if (!id || !entry.title) throw new NetworkError('invalid_response');
      const version = /v(\d+)$/.exec(id)?.[1]; const doiId = doi(entry.doi);
      items.push({ provider: 'arxiv', id, title: entry.title, url: `https://arxiv.org/abs/${id}`, arxiv: id,
        ...(version ? { version: `v${version}` } : {}), ...(doiId ? { doi: doiId } : {}),
        ...(entry.summary ? { abstract: entry.summary } : {}), ...(entry.published ? { publishedAt: entry.published } : {}),
        ...(entry.updated ? { updatedAt: entry.updated } : {}), authors: authors.slice(0, 40),
        fulltextUrls: [...new Set(urls)].slice(0, 8), references: [], fields: Object.keys(entry),
        limits: ['Abstract and discovered links are not fulltext evidence.', 'Citation graph and retraction status are unavailable from this Atom response.'] });
      entry = undefined;
    }
    stack.pop(); field = '';
  });
  try { parser.write(xml).close(); } catch (error) { throw error instanceof NetworkError ? error : new NetworkError('invalid_response'); }
  scope.check(); return { items, total };
}

function attribute(tag: SaxesTagNS, name: string): string | undefined {
  const attr = tag.attributes[name]; return attr && typeof attr === 'object' ? attr.value : undefined;
}
