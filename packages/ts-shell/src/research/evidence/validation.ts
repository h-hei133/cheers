import { mergeSources as merge, validateDraft as validate, type ResearchBrief, type ResearchDraft, type SourceRecord } from '@cheers/research';
import { sameValue } from '../../config/values.js';
import { safeText } from './producer.js';

export { validateReference } from '@cheers/research';

export function validateDraft(draft: ResearchDraft, brief: ResearchBrief, sources: readonly SourceRecord[]): ResearchDraft {
  return validate(draft, brief, sources, safeText);
}

export function mergeSources(current: readonly SourceRecord[], incoming: readonly SourceRecord[]) {
  return merge(current, incoming, sameValue);
}
