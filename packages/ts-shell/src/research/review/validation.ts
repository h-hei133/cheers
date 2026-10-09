import type { ResearchRun } from '../run/model.js';
import type { ClaimRecord, SourceRecord } from '../evidence/model.js';
import type { ReviewFinding } from './model.js';
import { validateReference } from '../evidence/validation.js';
import { safeText } from '../evidence/producer.js';

export function validateReview(output: { findings: readonly ReviewFinding[]; uncovered: readonly string[]; limitation: string }, run: ResearchRun, childId: string) {
  if (new Set(output.findings.map(finding => finding.claimId)).size !== output.findings.length
    || output.findings.some(finding => !run.claims.some(claim => claim.id === finding.claimId))) throw new Error('Review findings refer to unknown or duplicate claims.');
  if (output.uncovered.some(id => !run.brief?.questions.some(question => question.id === id))) throw new Error('Review coverage refers to an unknown subquestion.');
  const actual = new Set(run.children.find(child => child.id === childId && child.stage === 'review')?.sourceIds ?? []);
  const sources = run.sources.filter(source => actual.has(source.id) && source.childId === childId && !source.stale
    && ['metadata', 'abstract', 'read', 'truncated'].includes(source.status) && source.contentHash && source.excerpts.some(excerpt => excerpt.text.trim()));
  const findings = run.claims.map(claim => validateFinding(claim, output.findings.find(finding => finding.claimId === claim.id), sources, run));
  const uncovered = [...new Set([...output.uncovered, ...findings.filter(finding => finding.outcome === 'insufficient')
    .map(finding => run.claims.find(claim => claim.id === finding.claimId)!.questionId)])];
  return { ...output, findings, uncovered, status: sources.length ? 'completed' as const : 'failed' as const,
    limitation: safeText([...(!sources.length ? ['The review child obtained no actual successful source reads; its conclusions are unverified.'] : []), output.limitation].filter(Boolean).join(' '), 4096) };
}

function validateFinding(claim: ClaimRecord, finding: ReviewFinding | undefined, sources: readonly SourceRecord[], run: ResearchRun): ReviewFinding {
  if (!finding) return insufficient(claim.id, 'The review omitted this retained claim.');
  const references = finding.references.map(reference => validateReference(reference, run.sources));
  const eligible = sources.filter(source => !['behavior', 'method', 'evaluation'].includes(claim.kind) || ['read', 'truncated'].includes(source.status));
  if (!references.length || references.some(source => !eligible.some(actual => actual.id === source.id))) {
    return insufficient(claim.id, ['This claim lacks evidence bound to actual successful reads by the current review child.', finding.reason].filter(Boolean).join(' '));
  }
  return finding;
}

function insufficient(claimId: string, reason: string): ReviewFinding {
  return { claimId, outcome: 'insufficient', reason: safeText(reason, 4096), references: [] };
}
