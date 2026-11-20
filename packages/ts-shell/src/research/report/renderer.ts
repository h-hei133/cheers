import { projectReport, type LedgerProjection } from '@cheers/research';
import { redactReportText } from '../../core/security/redaction.js';
import { neutraliseForDisplay } from '../../core/text/safety.js';
import type { ResearchRun } from '../run/model.js';

export function researchReport(run: ResearchRun, ledger?: LedgerProjection): string {
  return researchReportProjection(run, ledger).text;
}

export function researchReportProjection(run: ResearchRun, ledger?: LedgerProjection) {
  return projectReport(run, ledger, (text, limit) => {
    const redactions = new Set<string>();
    const projected = redactReportText(text, limit, { preserveLines: true, redactions }).split('\n').map(neutraliseForDisplay).join('\n');
    return { text: projected, truncated: redactions.has('truncated') };
  });
}
