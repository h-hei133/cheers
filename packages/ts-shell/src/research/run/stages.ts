import type { ResearchBrief } from '../brief/model.js';
import { researchLimits } from '../brief/model.js';
import { briefSchema } from '../brief/schema.js';
import type { ResearchDraft } from '../evidence/model.js';
import { draftSchema } from '../evidence/schema.js';
import { validateDraft } from '../evidence/validation.js';
import { safeText } from '../evidence/producer.js';
import { reviewOutputSchema } from '../review/schema.js';
import { validateReview } from '../review/validation.js';
import type { ReviewFinding } from '../review/model.js';
import { validateFragment } from '../report/validation.js';
import { parseResearchOutput } from './parse.js';
import { gapsSchema, reconciliationSchema, researchInputDigest } from './prompts.js';
import { reportFragmentSchema } from './schema.js';
import type { ReportFragment, ResearchRun } from './model.js';
import { sameValue } from '../../config/values.js';

export function applyStage(run: ResearchRun, text: string, childId: string): ResearchRun {
  if (run.stage === 'brief') {
    if (run.request.briefPath && (run.briefInput?.path !== run.request.briefPath || run.briefInput.childId !== childId
      || run.briefInput.briefRevision !== run.briefRevision)) throw new Error('The required brief file was not completely read by this brief child. Obtain an authorized complete bounded text read before research can continue.');
    const brief = parseResearchOutput<ResearchBrief>(text, briefSchema);
    if (brief.revision !== run.briefRevision || run.request.mode && brief.mode !== run.request.mode
      || new Set(brief.questions.map(question => question.id)).size !== brief.questions.length) throw new Error('Research brief has an invalid revision, mode or question identity.');
    return { ...run, brief, briefs: [...run.briefs, brief].slice(-16), stage: 'investigate' };
  }
  if (!run.brief) throw new Error('Research brief is unavailable.');
  if (run.stage === 'investigate' || run.stage === 'draft') {
    const draft = validateDraft(parseResearchOutput<ResearchDraft>(text, draftSchema), run.brief, run.sources);
    return { ...run, draft, claims: draft.claims, ...(run.stage === 'investigate'
      ? { investigationRounds: run.investigationRounds + 1, stage: 'gaps' as const }
      : { stage: 'review' as const }) };
  }
  if (run.stage === 'gaps') {
    const gaps = parseResearchOutput<{ gaps: string[]; covered: string[]; uncovered: string[] }>(text, gapsSchema);
    const ids = run.brief.questions.map(question => question.id);
    if ([...gaps.covered, ...gaps.uncovered].some(id => !ids.includes(id))) throw new Error('Research gap coverage uses unknown questions.');
    return { ...run, gapQuestions: gaps.gaps, stage: gaps.gaps.length && run.investigationRounds < researchLimits[run.request.depth].rounds ? 'investigate' : 'draft' };
  }
  if (run.stage === 'review') {
    const output = validateReview(parseResearchOutput<{ findings: ReviewFinding[]; uncovered: string[]; limitation: string }>(text, reviewOutputSchema), run, childId);
    return { ...run, stage: 'report', review: { ...output, role: 'independent', correlation: 'same-model-independent-context',
      childId, inputDigest: run.review?.inputDigest ?? researchInputDigest(run),
      limitation: safeText(['Independent context uses the same model; errors may be correlated.', output.limitation].filter(Boolean).join(' '), 4096) } };
  }
  if (run.stage === 'report') {
    if (run.fragments.length >= researchLimits[run.request.depth].fragments) return settleReport(run);
    const fragment = validateFragment(parseResearchOutput<ReportFragment>(text, reportFragmentSchema), run);
    const fragments = [...run.fragments, fragment];
    return settleReport({ ...run, fragments });
  }
  parseResearchOutput(text, reconciliationSchema);
  return reconcileSources(run, childId);
}

/** A settled report has no next fragment, including after source reconciliation. */
export function settleReport(run: ResearchRun): ResearchRun {
  if (run.stage !== 'report' || run.fragments.length < researchLimits[run.request.depth].fragments) return run;
  const partial = !run.draft || run.draft.uncovered.length > 0 || run.claims.some(claim => claim.support === 'insufficient')
    || run.review?.status !== 'completed' || run.review.uncovered.length > 0 || run.review.findings.some(finding => finding.outcome === 'insufficient');
  return { ...run, status: partial ? 'partial' : 'completed' };
}

export function citedSourceIds(run: ResearchRun): readonly string[] {
  return [...new Set([...run.claims.flatMap(claim => [...claim.supporting, ...claim.opposing]),
    ...(run.review?.findings.flatMap(finding => finding.references) ?? [])].map(reference => reference.sourceId))];
}

function reconcileSources(run: ResearchRun, childId: string): ResearchRun {
  const actual = run.children.find(child => child.id === childId)?.sourceIds ?? [];
  const changed: string[] = [];
  for (const id of citedSourceIds(run)) {
    const previous = run.sources.find(source => source.id === id)!;
    const refreshed = run.sources.find(source => actual.includes(source.id) && source.locator === previous.locator
      && source.readKey === previous.readKey && !source.stale && ['read', 'truncated', 'metadata', 'abstract'].includes(source.status));
    if (!refreshed) throw new Error('Recovery requires actual successful re-reads of every retained cited source.');
    if (refreshed.contentHash !== previous.contentHash || !sameValue(refreshed.excerpts, previous.excerpts) || previous.stale) changed.push(id);
  }
  if (changed.length) return { ...run, claims: [], draft: undefined, review: undefined, fragments: [], gapQuestions: ['Cited source content changed during recovery; reinvestigate before reusing conclusions.'], stage: 'investigate', resumeStage: undefined };
  return settleReport({ ...run, stage: run.resumeStage ?? 'investigate', resumeStage: undefined });
}
