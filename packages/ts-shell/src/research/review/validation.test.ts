import { afterEach, expect, it } from 'vitest';
import { cleanupResearch, finishResearch, fixtureClaim, researchHarness, sourceRecord } from '../../test-utils/research.js';
import { validateReview } from './validation.js';

afterEach(cleanupResearch);
it.each(['none-found', 'counterevidence'] as const)('cannot bind %s to cached investigator evidence despite an unrelated fresh reviewer read', outcome => {
  const fresh = { ...sourceRecord, id: 'fresh-review-source', childId: 'review', locator: 'another.md' };
  const setup = finishResearch(researchHarness(), { sources: [sourceRecord, fresh], children: [{ id: 'review', stage: 'review',
    briefRevision: 1, startedAt: fresh.fetchedAt, status: 'completed', requestIds: [], sourceIds: [fresh.id] }] });
  const claim = fixtureClaim();
  const result = validateReview({ findings: [{ claimId: claim.id, outcome, reason: 'Declared review.', references: claim.supporting }],
    uncovered: [], limitation: 'Bounded review.' }, setup.current(), 'review');
  expect(result.status).toBe('completed'); expect(result.findings).toEqual([{ claimId: claim.id, outcome: 'insufficient',
    reason: expect.stringContaining('current review child'), references: [] }]);
  expect(result.uncovered).toEqual(['q1']); expect(setup.current().claims[0]?.support).toBe('direct');
});
it('does not accept failed fulltext or abstract-only acquisitions as method review evidence', () => {
  const claim = { ...fixtureClaim(), kind: 'method' as const };
  const source = { ...sourceRecord, childId: 'review', status: 'abstract' as const };
  const setup = finishResearch(researchHarness(), { claims: [claim], sources: [source], children: [{ id: 'review', stage: 'review',
    briefRevision: 1, startedAt: source.fetchedAt, status: 'completed', requestIds: [], sourceIds: [source.id] }] });
  const output = { findings: [{ claimId: claim.id, outcome: 'none-found' as const, reason: 'Declared review.', references: claim.supporting }], uncovered: [], limitation: 'Bounded review.' };
  expect(validateReview(output, setup.current(), 'review').findings[0]?.outcome).toBe('insufficient');
  const failed = validateReview({ ...output, findings: [] }, { ...setup.current(), sources: [{ ...source, status: 'failed', excerpts: [] }] }, 'review');
  expect(failed.status).toBe('failed'); expect(failed.findings[0]?.outcome).toBe('insufficient'); expect(failed.uncovered).toEqual(['q1']);
});
