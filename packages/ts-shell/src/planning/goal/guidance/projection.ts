import { redactExportText } from '../../../core/security/redaction.js';
import { guidanceFields, type GuidanceDraft } from './model.js';
import { guidanceVersion } from './state.js';
export function showGuidance(draft?: GuidanceDraft): string {
  if (!draft) return 'No guided goal draft. Use /guided-goal <objective>.';
  return [`Guided goal ${draft.phase}; version ${guidanceVersion(draft)}`,
    ...guidanceFields.map(field => `${field}: ${draft.answers[field] ? redactExportText(draft.answers[field]!) : '[unanswered]'}`),
    `budget: ${draft.answers.budget ?? 'off (optional; not staged)'}`,
    'Approval creates a paused goal and grants no tool permission.',
    draft.phase === 'draft' ? `Approve the exact completed draft with /guided-goal approve ${guidanceVersion(draft)}.`
      : draft.phase === 'approved' ? `Paused goal: ${draft.approval!.goalId}. Activate explicitly with /goal resume.` : 'Draft cancelled; no goal was created.'].join('\n');
}
