import { validateFragment as validate, type ReportFragment } from '@cheers/research';
import type { ResearchRun } from '../run/model.js';
import { researchReportDigest } from '../run/prompts.js';

export function validateFragment(fragment: ReportFragment, run: ResearchRun): ReportFragment {
  return validate(fragment, run, () => researchReportDigest(run));
}
