import { NetworkError } from '../../network/error.js';
import { parseResponseJson } from '../../network/response.js';
import { validateToolArguments } from '../arguments.js';

export interface SearchResultItem {
  readonly title: string;
  readonly url: string;
  readonly snippet: string;
}

export interface SearchResults {
  readonly items: readonly SearchResultItem[];
  readonly truncated: boolean;
}

const resultSchema = {
  type: 'object', required: ['results'], properties: { results: {
    type: 'array', items: { type: 'object', properties: {
      title: { type: 'string' }, url: { type: 'string' }, text: { type: 'string' },
      content: { type: 'string' }, highlights: { type: 'array', items: { type: 'string' } },
    } },
  } },
};

export function boundSearchResults(items: readonly SearchResultItem[], limit: number): SearchResults {
  let truncated = items.length > limit;
  const bounded = items.slice(0, limit).map(item => {
    if (item.title.length > 512 || item.url.length > 2048 || item.snippet.length > 1000) truncated = true;
    return { title: item.title.slice(0, 512), url: item.url.slice(0, 2048), snippet: item.snippet.slice(0, 1000) };
  });
  return { items: bounded, truncated };
}

export function parseSearchResults(text: string, source: 'exa' | 'tavily', limit: number): SearchResults {
  const data = parseResponseJson(text);
  try { validateToolArguments(resultSchema, data); }
  catch { throw new NetworkError('invalid_response'); }
  const results = data.results as Array<{ title?: string; url?: string; text?: string; content?: string; highlights?: string[] }>;
  // Validate the entire response, then allocate display objects only for the requested rows.
  const items = results.slice(0, limit).map(result => ({
    title: result.title || 'Untitled', url: result.url || '',
    snippet: source === 'exa' ? result.highlights?.join(' ') || result.text || '' : result.content || '',
  }));
  const bounded = boundSearchResults(items, limit);
  return { ...bounded, truncated: bounded.truncated || results.length > limit };
}
