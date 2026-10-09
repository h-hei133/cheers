import type { ReportFragment, ResearchRun } from '../run/model.js';
import { researchReportDigest } from '../run/prompts.js';
import { validateReference } from '../evidence/validation.js';

export function validateFragment(fragment: ReportFragment, run: ResearchRun): ReportFragment {
  if (fragment.index !== run.fragments.length || fragment.inputDigest !== researchReportDigest(run)
    || fragment.claimIds.some(id => !run.claims.some(claim => claim.id === id))
    || new Set(fragment.claimIds).size !== fragment.claimIds.length || new Set(fragment.sourceIds).size !== fragment.sourceIds.length
    || /\[\d+(?:\s*[,\-]\s*\d+)*\]/.test(fragment.text)) throw new Error('Research report fragment has invalid binding or citations.');
  const citations = [...fragment.text.matchAll(/\[source:([^\]#]+)#([^\]]+)\]/g)];
  if ((fragment.text.match(/\[source:/g) ?? []).length !== citations.length) throw new Error('Research report contains a malformed citation.');
  const references = run.claims.filter(claim => fragment.claimIds.includes(claim.id)).flatMap(claim => [...claim.supporting, ...claim.opposing]);
  const reviewed = run.review?.findings.filter(finding => fragment.claimIds.includes(finding.claimId)).flatMap(finding => finding.references) ?? [];
  const allowed = [...references, ...reviewed];
  for (const citation of citations) {
    const reference = allowed.find(value => value.sourceId === citation[1] && value.excerptId === citation[2]);
    if (!reference) throw new Error('Research report cites evidence outside its bound claims/review.');
    validateReference(reference, run.sources);
  }
  const used = [...new Set(citations.map(citation => citation[1]!))];
  if (used.length !== fragment.sourceIds.length || used.some(id => !fragment.sourceIds.includes(id))) throw new Error('Research report source list differs from its citations.');
  return fragment;
}
