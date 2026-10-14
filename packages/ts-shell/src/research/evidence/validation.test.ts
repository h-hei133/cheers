import { expect, it } from 'vitest';
import { fixtureClaim, researchBrief, sourceRecord } from '../../test-utils/research.js';
import { mergeSources, validateDraft, validateReference } from './validation.js';
import { researchInputDigest, researchReportDigest } from '../run/prompts.js';
import { researchHarness, finishResearch, cleanupResearch } from '../../test-utils/research.js';
import { afterEach } from 'vitest';
import { validateFragment } from '../report/validation.js';
import fs from 'node:fs';
import path from 'node:path';
import { createReadToolDefinition } from '../../core/tools/read.js';
import { createDefaultExecutionService } from '../../runtime/execution/service.js';
import { toolSources } from './producer.js';

afterEach(cleanupResearch);
it('binds exact quotes to real nonstale excerpts and rejects abstract-only evaluation support', () => {
  const claim = fixtureClaim(); expect(validateReference(claim.supporting[0]!, [sourceRecord])).toBe(sourceRecord);
  expect(() => validateReference({ ...claim.supporting[0]!, quote: 'invented' }, [sourceRecord])).toThrow(/citation/);
  expect(() => validateReference(claim.supporting[0]!, [{ ...sourceRecord, stale: true }])).toThrow(/citation/);
  const draft = validateDraft({ summary: 'paper', claims: [{ ...claim, kind: 'evaluation' }], covered: ['q1'], uncovered: [], limitations: [] },
    researchBrief, [{ ...sourceRecord, status: 'abstract' }]);
  expect(draft.claims[0]?.support).toBe('insufficient'); expect(draft.covered).toEqual([]); expect(draft.uncovered).toEqual(['q1', 'q2']);
});
it('retains an unsupported indirect explanation as insufficient and leaves its questions uncovered', () => {
  const claim = { ...fixtureClaim(), support: 'indirect' as const, supporting: [], opposing: [],
    supportReason: 'An unverified inference.', limitations: ['No source was acquired.'] };
  const draft = validateDraft({ summary: 'Unverified draft', claims: [claim], covered: ['q1', 'q2'], uncovered: [], limitations: [] }, researchBrief, []);
  expect(draft.claims[0]).toMatchObject({ support: 'insufficient', supporting: [], opposing: [] });
  expect(draft.claims[0]?.supportReason).toContain('An unverified inference.');
  expect(draft.claims[0]?.limitations).toContain('No source was acquired.');
  expect(draft.covered).toEqual([]); expect(draft.uncovered).toEqual(['q1', 'q2']);
});
it('keeps fulltext normalization within the declared limitation cap while preserving its missing-evidence reason', () => {
  const claim = { ...fixtureClaim(), kind: 'evaluation' as const, limitations: Array.from({ length: 32 }, (_, index) => `Limit ${index}`) };
  const draft = validateDraft({ summary: 'Abstract only', claims: [claim], covered: ['q1'], uncovered: [], limitations: [] }, researchBrief,
    [{ ...sourceRecord, status: 'abstract' }]);
  expect(draft.claims[0]?.support).toBe('insufficient'); expect(draft.claims[0]?.limitations).toHaveLength(32);
  expect(draft.claims[0]?.limitations.at(-1)).toContain('Fulltext method/evaluation evidence is missing.');
});
it('refreshes A after A to B to A and relates byte-identical mirrors without counting independent support', () => {
  const first = sourceRecord; const second = { ...first, id: 's-B', contentHash: 'b'.repeat(64) };
  let merged = mergeSources([first], [second]); expect(merged.sources.find(source => source.id === first.id)?.stale).toBe(true);
  merged = mergeSources(merged.sources, [first]); expect(merged.sources.find(source => source.id === first.id)?.stale).toBe(false);
  expect(merged.sources.find(source => source.id === second.id)?.stale).toBe(true);
  merged = mergeSources(merged.sources, [{ ...first, id: 's-mirror', locator: 'mirror.md' }]);
  expect(merged.sources.find(source => source.id === first.id)?.replicas).toEqual(['s-mirror']);
  expect(merged.sources.find(source => source.id === 's-mirror')?.replicas).toEqual([first.id]);
});
it('rejects old report fragments when real review changes despite unchanged evidence digest', () => {
  const setup = finishResearch(researchHarness()); const run = setup.current();
  const fragment = { index: 0, title: 'Bound report', text: '[source:s-fixture#l1]', claimIds: ['c-q1'], sourceIds: ['s-fixture'], inputDigest: researchReportDigest(run) };
  expect(validateFragment(fragment, run)).toBe(fragment);
  const changed = { ...run, review: { ...run.review!, status: 'failed' as const, limitation: 'Review failed.' } };
  expect(researchInputDigest(run)).toBe(researchInputDigest(changed)); expect(researchReportDigest(run)).not.toBe(researchReportDigest(changed));
  expect(() => validateFragment(fragment, changed)).toThrow(/binding/);
  expect(() => validateFragment({ ...fragment, text: '[source:invented#l1]' }, run)).toThrow(/outside/);
});

it('uses only actual selected text for line citations and invalidates corrected extraction even with identical raw bytes', async () => {
  const setup = researchHarness(); fs.writeFileSync(path.join(setup.root, 'release.md'), 'FIRST\nACTUAL');
  const args = { path: 'release.md', offset: 2, limit: 1 };
  const result = await createReadToolDefinition(createDefaultExecutionService()).execute(args, { taskId: 'text', workspaceRoot: setup.root, sessionId: setup.session.id });
  expect(result.output).toContain('Showing lines 2-2');
  const context = { assistantMessage: { role: 'assistant' as const, content: '' }, call: { id: 'text', name: 'read', args }, args,
    result: { output: result.output!, metadata: result.metadata, isError: false }, isError: false };
  const source = toolSources(context, 'text', 1)[0]!;
  expect(source.excerpts).toEqual([{ id: 'l2', location: 'lines 2-2', text: 'ACTUAL' }]);
  expect(() => validateReference({ sourceId: source.id, excerptId: 'l2', quote: 'Showing lines' }, [source])).toThrow(/citation/);
  expect(validateReference({ sourceId: source.id, excerptId: 'l2', quote: 'ACTUAL' }, [source])).toBe(source);
  const previous = { ...source, id: 's-old-extraction', excerpts: [{ id: 'l2', location: 'lines 2-4', text: result.output! }] };
  const merged = mergeSources([previous], [source]);
  expect(merged.changed).toEqual([previous.id]); expect(merged.sources[0]?.stale).toBe(true);
  const missingBody = toolSources({ ...context, result: { ...context.result, metadata: { provenance: result.metadata!.provenance } } }, 'text', 1)[0]!;
  expect(missingBody.status).toBe('failed'); expect(missingBody.excerpts).toEqual([]);
  expect(missingBody.limits.join(' ')).toContain('Native source text is unavailable');
});
