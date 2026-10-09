import { requestScope } from '../../core/network/request.js';
import { networkFailure } from '../../core/network/error.js';
import { readOnlyTool } from '../../core/tools/capability.js';
import { validateToolArguments } from '../../core/tools/arguments.js';
import type { ToolDefinition } from '../../tools/types.js';
import { openalex } from './openalex.js';
import { arxivSearch } from './arxiv.js';
import { semantic } from './semantic.js';
import type { SourceTransport } from './http.js';
import type { PaperRequest, PaperItem, PaperProvider } from './model.js';

export const paperSearchSchema = { type: 'object', additionalProperties: false,
  properties: { provider: { enum: ['auto', 'openalex', 'arxiv', 'semantic-scholar'] },
    action: { enum: ['search', 'lookup', 'references', 'citations'] }, query: { type: 'string', minLength: 1, maxLength: 2000 },
    identifier: { type: 'string', minLength: 1, maxLength: 512 }, numResults: { type: 'integer', minimum: 1, maximum: 20 },
    pages: { type: 'integer', minimum: 1, maximum: 3 }, timeoutMs: { type: 'integer', minimum: 100, maximum: 60000 } } };

export function createPaperSearchTool(transport?: SourceTransport): ToolDefinition {
  return readOnlyTool({ name: 'paper_search',
    description: 'Search academic metadata/abstracts, lookup DOI/arXiv/paper IDs and discover references/citations or authorized fulltext locations. Actual provider failures, missing fields and abstract-only status stay visible. This does not read fulltext; use document_read/read for that. Fixed official origins, bounded pagination, shared rate admission and one total deadline.',
    argsSchema: paperSearchSchema,
    async execute(args, context) {
      validateToolArguments(paperSearchSchema, args);
      const request: PaperRequest = { provider: args.provider as PaperRequest['provider'] ?? 'auto', action: args.action as PaperRequest['action'] ?? 'search',
        query: args.query as string | undefined, identifier: args.identifier as string | undefined,
        numResults: args.numResults as number ?? 5, pages: args.pages as number ?? 1 };
      if (request.action === 'search' ? !request.query || request.identifier !== undefined : !request.identifier || request.query !== undefined) {
        return { success: false, error: 'paper_search requires query for search, or identifier for lookup/references/citations, exclusively.' };
      }
      const scope = requestScope(args.timeoutMs as number ?? 30000, context.abortSignal);
      const providers: PaperProvider[] = request.provider === 'auto' ? request.action === 'references' || request.action === 'citations'
        ? ['openalex', 'semantic-scholar'] : ['openalex', 'arxiv', 'semantic-scholar'] : [request.provider];
      const failures: Array<{ provider: PaperProvider; code: string; status?: number }> = [];
      const provenance: Array<{ provider: PaperProvider; finalUrl: string; contentHash: string; fetchedAt: string; bytes: number }> = [];
      const items: PaperItem[] = []; let truncated = false;
      try {
        for (const provider of providers) {
          let cursor: string | undefined;
          try {
            for (let page = 0; page < request.pages; page++) {
              scope.check();
              const result = await (provider === 'openalex' ? openalex : provider === 'arxiv' ? arxivSearch : semantic)(request, scope, cursor, transport);
              provenance.push({ provider, finalUrl: result.body.finalUrl, contentHash: result.body.hash, fetchedAt: result.body.fetchedAt, bytes: result.body.bytes.byteLength });
              items.push(...result.items.map(item => ({ ...item, retrieval: { url: result.body.finalUrl,
                contentHash: result.body.hash, fetchedAt: result.body.fetchedAt, bytes: result.body.bytes.byteLength } }))); cursor = result.next;
              if (!cursor || request.action === 'lookup') break;
              if (page + 1 === request.pages) truncated = true;
            }
            if (items.length) break;
          } catch (error) {
            const failure = networkFailure(error); failures.push({ provider, ...failure });
            if (failure.code === 'cancelled' || failure.code === 'timeout') break;
          }
        }
        const unique = uniquePapers(items).slice(0, 60);
        const paper = { action: request.action, items: unique, failures, provenance, truncated };
        return { success: unique.length > 0 || failures.length === 0,
          output: JSON.stringify({ ...paper, notice: 'Metadata/abstract discovery only. Read authorized fulltext separately before claiming methods or evaluations.' }),
          ...(unique.length === 0 && failures.length ? { error: `Academic discovery unavailable: ${failures.map(f => `${f.provider}:${f.code}`).join(', ')}.` } : {}), metadata: { paper } };
      } finally { scope.dispose(); }
    },
  }, { network: true });
}

export function uniquePapers(items: readonly PaperItem[]): PaperItem[] {
  const seen = new Set<string>();
  return items.filter(item => {
    // Version-specific preprints remain distinct even when a DOI is shared.
    const key = item.arxiv ? `arxiv:${item.arxiv}` : item.doi ? `doi:${item.doi}` : `${item.provider}:${item.id}`;
    if (seen.has(key)) return false; seen.add(key); return true;
  });
}
