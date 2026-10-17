import { sanitizeExecutionReportText } from '../../runtime/execution/error.js';
import { createReport, span } from '../../core/commands/report/projection.js';
import type { CommandReport } from '../../core/commands/report/contract.js';
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

/** Structured view of the same facts the text projection prints. */
export function planReport(plan?: PlanDraft): CommandReport {
  if (!plan) return createReport({ title: 'Plan review', facts: { status: 'none' },
    lines: [{ kind: 'text', spans: [span('No plan draft. Use /plan <task> or /plan set <text>.', 'muted')] }] });
  return createReport({
    title: 'Plan review',
    facts: { version: planVersion(plan), phase: plan.phase, criteria: plan.criteria.length, goal: plan.goal ? 'bound' : 'unbound' },
    lines: [
      { kind: 'text', spans: [span(redactExportText(plan.text), 'text')] },
      { kind: 'space' },
      ...plan.criteria.map(criterion => ({ kind: 'text' as const, bullet: true, spans: [
        span(`${criterion.id}: `, 'muted'),
        span(criterion.kind === 'command' ? criterion.command : `${criterion.path} = ${criterion.expected}`, 'code'),
        ...(criterion.implementation ? [span(' (session edit required)', 'muted')] : []),
      ] })),
      ...(plan.criteria.length ? [] : [{ kind: 'text' as const, spans: [span('Acceptance unverified: no approved verifiable criteria.', 'warning')] }]),
      { kind: 'text', spans: [span('Approval covers this exact draft; tool write and execution permissions remain separate.', 'muted')] },
    ],
  });
}
