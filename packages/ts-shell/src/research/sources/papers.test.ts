import { afterEach, expect, it, vi } from 'vitest';
import { researchHarness, cleanupResearch } from '../../test-utils/research.js';
import { createPaperSearchTool, uniquePapers } from './papers.js';
import { parseAtom } from './arxiv.js';
import { limitedSource } from './limit.js';
import { requestScope } from '../../core/network/request.js';
import type { SourceTransport } from './http.js';
import { toolSources } from '../evidence/producer.js';

afterEach(cleanupResearch);
const atom = `<feed xmlns="http://www.w3.org/2005/Atom" xmlns:opensearch="http://a9.com/-/spec/opensearch/1.1/">
<opensearch:totalResults>2</opensearch:totalResults>
<entry><id>https://arxiv.org/abs/1706.03762v1</id><title>Bound paper</title><summary>Abstract only</summary><author><name>Author</name></author><link href="https://arxiv.org/pdf/1706.03762v1" type="application/pdf"/></entry>
<entry><id>https://arxiv.org/abs/1706.03762v2</id><title>Bound paper revised</title><summary>New abstract</summary></entry></feed>`;
it('uses strict Atom parsing, retains separate explicit revisions and rejects DTD or foreign namespace entries', () => {
  const parsed = parseAtom(atom, 2, { check: () => {} }); expect(parsed.total).toBe(2);
  expect(uniquePapers(parsed.items).map(item => item.version)).toEqual(['v1', 'v2']);
  expect(parsed.items[0]!.fulltextUrls).toEqual(['https://arxiv.org/pdf/1706.03762v1']);
  expect(() => parseAtom('<!DOCTYPE feed [<!ENTITY x "hostile">]>' + atom, 2, { check: () => {} })).toThrow(/invalid_response/);
  expect(() => parseAtom(atom.replace('<entry>', '<entry xmlns="urn:foreign">'), 2, { check: () => {} })).toThrow(/invalid_response/);
});
it('keeps schema/pagination/429/auth and native raw API provenance at the real source producer boundary', async () => {
  const setup = researchHarness(); vi.stubEnv('OPENALEX_API_KEY', 'synthetic-key-only');
  const received: Array<{ url: string; headers: unknown }> = []; let requests = 0;
  const transport: SourceTransport = async (url, options) => {
    received.push({ url: String(url), headers: options.headers }); requests++;
    if (requests === 1) return { response: new Response('HTTP_BODY_MUST_NOT_PUBLISH', { status: 429, headers: { 'retry-after': '0' } }), finalUrl: String(url) };
    const value = { results: [{ id: 'https://openalex.org/W123', title: 'Actual metadata', doi: 'https://doi.org/10.1234/example',
      authorships: [], referenced_works: [], abstract_inverted_index: { Actual: [0], abstract: [1] },
      primary_location: { pdf_url: null, landing_page_url: 'https://example.org/paper' }, is_retracted: false }], meta: { next_cursor: requests === 2 ? 'next' : null } };
    return { response: Response.json(value), finalUrl: String(url) };
  };
  const tool = createPaperSearchTool(transport);
  const args = { provider: 'openalex', query: 'bounded discovery', numResults: 1, pages: 2, timeoutMs: 10000 };
  const result = await tool.execute(args, { taskId: 'paper', workspaceRoot: setup.root });
  expect(result.success, result.error).toBe(true); expect(received).toHaveLength(3);
  expect(received[2]!.url).toContain('cursor=next'); expect(received.every(value => !value.url.includes('synthetic-key-only'))).toBe(true);
  expect(received[0]!.headers).toMatchObject({ Authorization: 'Bearer synthetic-key-only' });
  const records = toolSources({ assistantMessage: { role: 'assistant', content: '' }, call: { id: 'paper', name: 'paper_search', args }, args,
    result: { output: result.output!, isError: false, metadata: result.metadata }, isError: false }, 'child', 1);
  expect(records[0]).toMatchObject({ status: 'abstract', retrieval: { url: expect.stringContaining('api.openalex.org'), contentHash: expect.stringMatching(/^[a-f0-9]{64}$/) } });
  expect(records[0]!.fulltextUrls).toEqual(['https://example.org/paper']); expect(records[0]!.replicas).toEqual([]);
  expect(JSON.stringify(records)).not.toMatch(/synthetic-key-only|HTTP_BODY_MUST_NOT_PUBLISH/);
  await expect(tool.execute({ ...args, pages: 4 }, { taskId: 'invalid', workspaceRoot: setup.root })).rejects.toThrow();
});
it('stops fallback on cancellation and serializes a shared provider claim through the entire request/body lifecycle', async () => {
  const setup = researchHarness(); const controller = new AbortController(); let sends = 0;
  const transport: SourceTransport = async url => { sends++; controller.abort(); return { response: Response.json({}), finalUrl: String(url) }; };
  const result = await createPaperSearchTool(transport).execute({ query: 'q' }, { taskId: 'cancel', workspaceRoot: setup.root, abortSignal: controller.signal });
  expect(sends).toBe(1); expect(JSON.stringify(result)).toContain('cancelled');
  let release!: () => void; let started!: () => void; let active = 0; let maximum = 0; let secondEntered = false;
  const gate = new Promise<void>(resolve => { release = resolve; }); const began = new Promise<void>(resolve => { started = resolve; });
  const firstScope = requestScope(2000); const secondScope = requestScope(2000);
  try {
    const first = limitedSource('fixture-shared', 10, firstScope, async () => { active++; maximum = Math.max(maximum, active); started(); await gate; active--; return 1; });
    await began;
    const second = limitedSource('fixture-shared', 10, secondScope, async () => { secondEntered = true; active++; maximum = Math.max(maximum, active); active--; return 2; });
    expect(secondEntered).toBe(false); release(); expect(await Promise.all([first, second])).toEqual([1, 2]); expect(maximum).toBe(1);
  } finally { release(); firstScope.dispose(); secondScope.dispose(); }
});
