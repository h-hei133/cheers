import { validateReview as validate, type ReviewOutput } from '@cheers/research';
import { safeText } from '../evidence/producer.js';
import type { ResearchRun } from '../run/model.js';

export function validateReview(output: ReviewOutput, run: ResearchRun, childId: string) {
  return validate(output, run, childId, safeText);
}
