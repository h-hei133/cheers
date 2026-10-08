import { sanitizeExecutionReportText } from '../../runtime/execution/error.js';
import { redactExportText } from '../../core/security/redaction.js';
import { planVersion } from './codec.js';
import type { PlanDraft } from './model.js';

export function showPlan(plan?: PlanDraft): string {
  if (!plan) return 'No plan draft. Use /plan <task> in plan mode or /plan set <text> to prepare one.';
  return [`Plan ${plan.phase}; version ${planVersion(plan)}`, redactExportText(plan.text),
    'Approval covers this exact draft and its criteria. Tool write and execution permissions remain separate.',
    'Target verification supports regular UTF-8 files up to 1 MiB, or policy-verified absence; unsupported targets remain unverified.',
    ...plan.criteria.map(criterion => `${criterion.id}: ${criterion.kind === 'command' ? `check ${redactExportText(criterion.command)}; targets ${criterion.targets.map(target => sanitizeExecutionReportText(target, 4096)).join(', ')}`
      : `artifact ${sanitizeExecutionReportText(criterion.path, 4096)} = ${criterion.expected}`}${criterion.implementation ? '; committed session edit required' : ''}`),
    ...(plan.criteria.length ? [] : ['Acceptance unverified: no approved verifiable criteria.']),
    `Review with /plan-review approve ${planVersion(plan)}; execute separately with /plan-review execute ${planVersion(plan)}.`].join('\n');
}
